import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/request-auth";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { apiError, enforceRateLimit, parseJson } from "@/server/api";
import { writeAuditLog } from "@/server/audit";
import { logApiError, requestContext } from "@/server/monitoring";
import { writeOperationalEvent } from "@/server/operational-events";

export const dynamic = "force-dynamic";

const addressSchema = z.object({
  label: z.string().trim().min(1).max(80),
  addressType: z.enum(["pickup", "delivery", "billing", "office", "warehouse"]).default("delivery"),
  address: z.string().trim().min(4).max(500),
  city: z.string().trim().max(120).optional().nullable(),
  notes: z.string().trim().max(400).optional().nullable(),
  isDefault: z.boolean().optional()
});

function isMissingCustomerTable(error: { code?: string; message?: string }) {
  return error.code === "42P01" || error.code === "42703" || error.message?.includes("customer_addresses");
}

export async function GET(request: Request) {
  const limited = await enforceRateLimit(request, "customer-addresses", { limit: 80, windowSeconds: 60 });
  if (limited) return limited;

  const access = await requireRole(request, ["customer"]);
  if (!access.profile) return NextResponse.json({ error: access.error }, { status: access.status });

  const supabase = getSupabaseAdmin();
  if (!supabase) return apiError("Saved addresses are temporarily unavailable.", { status: 503 });

  const { data, error } = await supabase
    .from("customer_addresses")
    .select("id,user_id,label,address_type,address,city,notes,is_default,created_at,updated_at")
    .eq("user_id", access.profile.id)
    .order("created_at", { ascending: false })
    .limit(30);

  if (error) {
    if (isMissingCustomerTable(error)) return NextResponse.json({ addresses: [], warning: "Saved addresses are being prepared by Fly Logistics operations." });
    logApiError(error, "Unable to load customer addresses.", requestContext(request, { userId: access.profile.id }));
    return apiError("Unable to load saved addresses.", { status: 500 });
  }

  return NextResponse.json({ addresses: data ?? [] });
}

export async function POST(request: Request) {
  const limited = await enforceRateLimit(request, "customer-addresses-create", { limit: 30, windowSeconds: 60 });
  if (limited) return limited;

  const access = await requireRole(request, ["customer"]);
  if (!access.profile) return NextResponse.json({ error: access.error }, { status: access.status });

  const parsed = await parseJson(request, addressSchema, "Please complete the saved address fields.");
  if (parsed.response) return parsed.response;

  const supabase = getSupabaseAdmin();
  if (!supabase) return apiError("Saved addresses are temporarily unavailable.", { status: 503 });

  if (parsed.data.isDefault) {
    await supabase.from("customer_addresses").update({ is_default: false }).eq("user_id", access.profile.id);
  }

  const { data, error } = await supabase
    .from("customer_addresses")
    .insert({
      user_id: access.profile.id,
      label: parsed.data.label,
      address_type: parsed.data.addressType,
      address: parsed.data.address,
      city: parsed.data.city || null,
      notes: parsed.data.notes || null,
      is_default: Boolean(parsed.data.isDefault)
    })
    .select("id,user_id,label,address_type,address,city,notes,is_default,created_at,updated_at")
    .single();

  if (error) {
    if (isMissingCustomerTable(error)) return apiError("Saved addresses are being prepared by Fly Logistics operations.", { status: 503 });
    logApiError(error, "Unable to save customer address.", requestContext(request, { userId: access.profile.id }));
    return apiError("Unable to save this address.", { status: 500 });
  }

  await writeAuditLog(supabase, {
    actor: access.profile,
    action: "customer.address_create",
    entityType: "customer_address",
    entityId: data.id,
    request
  });

  await writeOperationalEvent(supabase, {
    category: "api",
    message: "Customer saved an address.",
    entityType: "customer_address",
    entityId: data.id,
    request
  });

  return NextResponse.json(data, { status: 201 });
}
