import { NextResponse } from "next/server";
import { z } from "zod";
import {
  driverBaseSelect,
  driverExtendedSelect,
  isDriverSchemaMismatch,
  missingDriverColumn,
  normalizeDriverRecord,
  normalizeTransportationType,
  optionalDriverColumns
} from "@/lib/driver-data";
import { requireRole } from "@/lib/request-auth";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { getCloudBillingPlan, isCloudPlanLimitReached } from "@/lib/cloud-plans";
import { enforceRateLimit, parseJson } from "@/server/api";
import { writeAuditLog } from "@/server/audit";
import { logApiError, requestContext } from "@/server/monitoring";
import { writeOperationalEvent } from "@/server/operational-events";
import { getTenantContextForProfile, withCompanyId } from "@/server/tenancy";

type SupabaseAdminClient = NonNullable<ReturnType<typeof getSupabaseAdmin>>;

const createDriverSchema = z.object({
  name: z.string().trim().min(2).max(160),
  phone: z.string().trim().min(5).max(40),
  status: z.string().trim().min(2).max(40).default("offline"),
  approvalStatus: z.enum(["pending", "approved", "rejected", "suspended"]).default("approved"),
  latitude: z.coerce.number().min(-90).max(90).optional(),
  longitude: z.coerce.number().min(-180).max(180).optional(),
  vehicleType: z.string().trim().min(2).max(40),
  photoUrl: z.string().url().optional().or(z.literal(""))
});

async function insertDriverWithSchemaFallback(supabase: SupabaseAdminClient, payload: Record<string, unknown>) {
  const nextPayload = { ...payload };
  const removedColumns: string[] = [];

  for (let attempt = 0; attempt <= optionalDriverColumns.size; attempt += 1) {
    const result = await supabase.from("drivers").insert(nextPayload).select(driverBaseSelect).single();

    if (!result.error) {
      return {
        data: (result.data ?? null) as Record<string, unknown> | null,
        error: null,
        removedColumns
      };
    }

    const missingColumn = missingDriverColumn(result.error);
    if (!missingColumn || !optionalDriverColumns.has(missingColumn) || !(missingColumn in nextPayload)) {
      return {
        data: null,
        error: result.error,
        removedColumns
      };
    }

    delete nextPayload[missingColumn];
    removedColumns.push(missingColumn);
  }

  return {
    data: null,
    error: new Error("Unable to create driver after retrying schema-compatible payload."),
    removedColumns
  };
}

export async function GET(request: Request) {
  const limited = await enforceRateLimit(request, "drivers", { limit: 80, windowSeconds: 60 });
  if (limited) return limited;

  const access = await requireRole(request, ["admin", "dispatcher", "driver"]);
  if (!access.profile) return NextResponse.json({ error: access.error }, { status: access.status });
  if (access.error) return NextResponse.json({ error: access.error }, { status: access.status });

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Driver directory is temporarily unavailable." }, { status: 503 });
  const tenant = await getTenantContextForProfile(supabase, access.profile);

  const buildQuery = (select: string) => {
    let query = supabase.from("drivers").select(select).order("id", { ascending: true });
    if (tenant.schemaReady && tenant.companyId) query = query.eq("company_id", tenant.companyId);

    if (access.profile.role === "driver") {
      query = query.eq("id", Number(access.profile.driver_id));
    }

    return query;
  };

  if (access.profile.role === "driver" && !access.profile.driver_id) {
    return NextResponse.json({ error: "Driver account is not linked to a driver record." }, { status: 403 });
  }

  let { data, error } = await buildQuery(driverExtendedSelect);

  if (isDriverSchemaMismatch(error)) {
    const fallback = await buildQuery(driverBaseSelect);
    data = fallback.data;
    error = fallback.error;
  }

  if (error) {
    logApiError(error, "Unable to load drivers.", requestContext(request, { role: access.profile.role }));
    return NextResponse.json({ error: "Unable to load drivers." }, { status: 500 });
  }

  const drivers = Array.isArray(data)
    ? data.map((driver) => normalizeDriverRecord(driver as unknown as Record<string, unknown>))
    : [];

  return NextResponse.json(drivers);
}

export async function POST(request: Request) {
  const limited = await enforceRateLimit(request, "drivers-create", { limit: 30, windowSeconds: 60 });
  if (limited) return limited;

  const access = await requireRole(request, ["admin"]);
  if (!access.profile) return NextResponse.json({ error: access.error }, { status: access.status });
  if (access.error) return NextResponse.json({ error: access.error }, { status: access.status });

  const parsed = await parseJson(request, createDriverSchema, "Please complete the driver profile.");
  if (parsed.response) return parsed.response;

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Driver creation is temporarily unavailable." }, { status: 503 });

  const now = new Date().toISOString();
  const effectiveStatus = parsed.data.approvalStatus === "approved" ? (parsed.data.status ?? "offline") : "offline";
  const online = !["offline", "rejected", "suspended"].includes(effectiveStatus.toLowerCase());
  const latitude = parsed.data.latitude ?? 6.5244;
  const longitude = parsed.data.longitude ?? 3.3792;
  const tenant = await getTenantContextForProfile(supabase, access.profile);

  if (tenant.schemaReady && tenant.companyId && tenant.company) {
    const plan = getCloudBillingPlan(tenant.company.subscription_plan ?? tenant.company.plan);
    if (plan.maxDrivers !== null) {
      const driverCount = await supabase
        .from("drivers")
        .select("id", { count: "exact", head: true })
        .eq("company_id", tenant.companyId);

      if (!driverCount.error && isCloudPlanLimitReached(driverCount.count ?? 0, plan.maxDrivers)) {
        return NextResponse.json(
          { error: `${plan.name} plan allows up to ${plan.maxDrivers} drivers. Upgrade your Fly Logistics Cloud plan to add more drivers.` },
          { status: 403 }
        );
      }
    }
  }

  const { data, error, removedColumns } = await insertDriverWithSchemaFallback(supabase, withCompanyId({
    name: parsed.data.name,
    phone: parsed.data.phone || null,
    status: effectiveStatus,
    latitude,
    longitude,
    current_latitude: latitude,
    current_longitude: longitude,
    is_online: online,
    last_location_at: now,
    vehicle_type: normalizeTransportationType(parsed.data.vehicleType),
    photo_url: parsed.data.photoUrl || null,
    approval_status: parsed.data.approvalStatus,
    online_since: online ? now : null,
    offline_since: online ? null : now,
    last_seen_at: now,
    updated_at: now
  }, tenant.companyId));

  if (error) {
    logApiError(error, "Unable to create driver.", requestContext(request, { role: access.profile.role }));
    return NextResponse.json({ error: "Unable to create driver." }, { status: 500 });
  }

  const createdDriver = normalizeDriverRecord({
    photo_url: parsed.data.photoUrl || null,
    approval_status: parsed.data.approvalStatus,
    current_latitude: latitude,
    current_longitude: longitude,
    is_online: online,
    last_location_at: now,
    vehicle_type: normalizeTransportationType(parsed.data.vehicleType),
    online_since: online ? now : null,
    offline_since: online ? null : now,
    last_seen_at: now,
    updated_at: now,
    ...(data ?? {})
  });

  const driverId =
    typeof createdDriver.id === "number" || typeof createdDriver.id === "string" ? createdDriver.id : null;

  await writeAuditLog(supabase, {
    actor: access.profile,
    action: "driver.create",
    entityType: "driver",
    entityId: driverId,
    metadata: {
      approvalStatus: createdDriver.approval_status,
      status: createdDriver.status,
      schemaFallbackRemovedColumns: removedColumns
    },
    request
  });

  await writeOperationalEvent(supabase, {
    category: "dispatch",
    message: "Driver profile created by admin.",
    entityType: "driver",
    entityId: driverId,
    metadata: {
      approvalStatus: createdDriver.approval_status,
      status: createdDriver.status,
      schemaFallbackRemovedColumns: removedColumns
    },
    request
  });

  return NextResponse.json(createdDriver, { status: 201 });
}
