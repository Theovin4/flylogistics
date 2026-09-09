import { NextResponse } from "next/server";
import { z } from "zod";
import { normalizeTransportationType } from "@/lib/driver-data";
import { requireRole } from "@/lib/request-auth";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { apiError, enforceRateLimit, parseJson } from "@/server/api";
import { writeAuditLog } from "@/server/audit";
import { logApiError, requestContext } from "@/server/monitoring";
import { writeOperationalEvent } from "@/server/operational-events";

export const dynamic = "force-dynamic";

const kycSchema = z.object({
  idDocumentUrl: z.string().url().optional().or(z.literal("")),
  licenseUrl: z.string().url().optional().or(z.literal("")),
  vehicleType: z.string().trim().min(2).max(80),
  vehiclePlateNumber: z.string().trim().min(2).max(40),
  vehicleModel: z.string().trim().min(2).max(120)
});

function isMissingKycTable(error: { code?: string; message?: string } | null | undefined) {
  const message = error?.message?.toLowerCase() ?? "";
  return error?.code === "42P01" || error?.code === "42703" || String(error?.code ?? "").startsWith("PGRST") || message.includes("could not find");
}

export async function GET(request: Request) {
  const limited = await enforceRateLimit(request, "driver-kyc", { limit: 80, windowSeconds: 60 });
  if (limited) return limited;

  const access = await requireRole(request, ["driver"]);
  if (!access.profile) return NextResponse.json({ error: access.error }, { status: access.status });
  if (access.error) return NextResponse.json({ error: access.error }, { status: access.status });
  if (!access.profile.driver_id) return NextResponse.json({ submission: null, warning: "This driver account is not linked to a driver profile yet." });

  const supabase = getSupabaseAdmin();
  if (!supabase) return apiError("Driver verification is temporarily unavailable.", { status: 503 });

  const { data, error } = await supabase
    .from("driver_kyc_submissions")
    .select("*")
    .eq("driver_id", Number(access.profile.driver_id))
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    if (isMissingKycTable(error)) return NextResponse.json({ submission: null, warning: "Driver verification storage is being prepared." });
    logApiError(error, "Unable to load driver KYC submission.", requestContext(request, { driverId: access.profile.driver_id }));
    return apiError("Unable to load driver verification.", { status: 500 });
  }

  return NextResponse.json({ submission: data ?? null });
}

export async function POST(request: Request) {
  const limited = await enforceRateLimit(request, "driver-kyc-submit", { limit: 20, windowSeconds: 300 });
  if (limited) return limited;

  const access = await requireRole(request, ["driver"]);
  if (!access.profile) return NextResponse.json({ error: access.error }, { status: access.status });
  if (access.error) return NextResponse.json({ error: access.error }, { status: access.status });
  if (!access.profile.driver_id) return apiError("Driver account is not linked to a driver profile.", { status: 403 });

  const parsed = await parseJson(request, kycSchema, "Complete the driver verification fields.");
  if (parsed.response) return parsed.response;

  const supabase = getSupabaseAdmin();
  if (!supabase) return apiError("Driver verification is temporarily unavailable.", { status: 503 });
  const vehicleType = normalizeTransportationType(parsed.data.vehicleType);

  const payload = {
    driver_id: Number(access.profile.driver_id),
    user_id: access.profile.id,
    id_document_url: parsed.data.idDocumentUrl || null,
    license_url: parsed.data.licenseUrl || null,
    vehicle_type: vehicleType,
    vehicle_plate_number: parsed.data.vehiclePlateNumber.toUpperCase(),
    vehicle_model: parsed.data.vehicleModel,
    status: "PENDING",
    updated_at: new Date().toISOString()
  };

  const { data, error } = await supabase
    .from("driver_kyc_submissions")
    .insert(payload)
    .select("*")
    .single();

  if (error) {
    logApiError(error, "Unable to submit driver KYC.", requestContext(request, { driverId: access.profile.driver_id }));
    return apiError(isMissingKycTable(error) ? "Run the latest enterprise schema before submitting KYC." : "Unable to submit driver verification.", { status: isMissingKycTable(error) ? 409 : 500 });
  }

  await supabase
    .from("drivers")
    .update({
      kyc_status: "pending",
      vehicle_type: vehicleType,
      vehicle_plate_number: parsed.data.vehiclePlateNumber.toUpperCase(),
      vehicle_model: parsed.data.vehicleModel,
      updated_at: new Date().toISOString()
    })
    .eq("id", Number(access.profile.driver_id));

  await writeAuditLog(supabase, {
    actor: access.profile,
    action: "driver.kyc_submit",
    entityType: "driver",
    entityId: access.profile.driver_id,
    metadata: { submissionId: data.id },
    request
  });

  await writeOperationalEvent(supabase, {
    category: "driver",
    message: "Driver submitted KYC documents.",
    entityType: "driver_kyc_submission",
    entityId: String(data.id),
    metadata: { driverId: access.profile.driver_id },
    request
  });

  return NextResponse.json({ submission: data }, { status: 201 });
}
