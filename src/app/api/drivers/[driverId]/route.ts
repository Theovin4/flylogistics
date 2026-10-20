import { NextResponse } from "next/server";
import { z } from "zod";
import {
  driverBaseSelect,
  missingDriverColumn,
  normalizeDriverRecord,
  normalizeTransportationType,
  optionalDriverColumns
} from "@/lib/driver-data";
import { normalizeShipmentStatus } from "@/lib/shipments";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { enforceRateLimit, parseJson } from "@/server/api";
import { writeAuditLog } from "@/server/audit";
import { logApiError, requestContext } from "@/server/monitoring";
import { writeOperationalEvent } from "@/server/operational-events";
import { getTenantContextForProfile, requireCloudFeature } from "@/server/tenancy";

type SupabaseAdminClient = NonNullable<ReturnType<typeof getSupabaseAdmin>>;

const completedShipmentStatuses = new Set(["DELIVERED", "CANCELLED"]);

function isMissingSchema(error: { code?: string; message?: string } | null | undefined) {
  const message = error?.message?.toLowerCase() ?? "";
  return error?.code === "42P01" || error?.code === "42703" || String(error?.code ?? "").startsWith("PGRST") || message.includes("could not find");
}

function isMissingAuthUser(error: { status?: number; message?: string } | null | undefined) {
  const message = error?.message?.toLowerCase() ?? "";
  return error?.status === 404 || message.includes("user not found") || message.includes("not found");
}

const updateDriverSchema = z.object({
  name: z.string().trim().min(2).max(160).optional(),
  phone: z.string().trim().max(40).optional().nullable(),
  status: z.enum(["online", "available", "in_transit", "busy", "offline"]).optional(),
  approvalStatus: z.enum(["pending", "approved", "rejected", "suspended"]).optional(),
  latitude: z.coerce.number().min(-90).max(90).optional(),
  longitude: z.coerce.number().min(-180).max(180).optional(),
  photoUrl: z.string().url().optional().or(z.literal("")),
  rating: z.coerce.number().min(0).max(5).optional(),
  vehicleType: z.string().trim().max(80).optional().nullable(),
  vehiclePlateNumber: z.string().trim().max(80).optional().nullable(),
  vehicleModel: z.string().trim().max(120).optional().nullable()
});

async function updateDriverWithSchemaFallback(
  supabase: SupabaseAdminClient,
  driverId: number,
  payload: Record<string, unknown>,
  companyId?: string | null
) {
  const nextPayload = { ...payload };
  const removedColumns: string[] = [];

  for (let attempt = 0; attempt <= optionalDriverColumns.size; attempt += 1) {
    let query = supabase
      .from("drivers")
      .update(nextPayload)
      .eq("id", driverId);
    if (companyId) query = query.eq("company_id", companyId);
    const result = await query.select(driverBaseSelect).maybeSingle();

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
    error: new Error("Unable to update driver after retrying schema-compatible payload."),
    removedColumns
  };
}

export async function PATCH(request: Request, { params }: { params: Promise<{ driverId: string }> }) {
  const limited = await enforceRateLimit(request, "drivers-update", { limit: 60, windowSeconds: 60 });
  if (limited) return limited;

  const { driverId } = await params;
  const access = await requireCloudFeature(request, "team_management", ["owner", "admin"]);
  if (!access.profile) return NextResponse.json({ error: access.error }, { status: access.status });
  if (access.error) return NextResponse.json({ error: access.error }, { status: access.status });

  const numericDriverId = Number(driverId);
  if (!Number.isInteger(numericDriverId) || numericDriverId <= 0) {
    return NextResponse.json({ error: "Invalid driver ID." }, { status: 400 });
  }

  const parsed = await parseJson(request, updateDriverSchema, "Invalid driver update.");
  if (parsed.response) return parsed.response;

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Driver management is temporarily unavailable." }, { status: 503 });
  const tenant = await getTenantContextForProfile(supabase, access.profile);

  const now = new Date().toISOString();
  const requestedStatus = parsed.data.status;
  const approvalStatus = parsed.data.approvalStatus;
  const online = requestedStatus ? !["offline"].includes(requestedStatus) : undefined;
  const updates: Record<string, unknown> = {
    ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
    ...(parsed.data.phone !== undefined ? { phone: parsed.data.phone || null } : {}),
    ...(parsed.data.latitude !== undefined ? { latitude: parsed.data.latitude } : {}),
    ...(parsed.data.longitude !== undefined ? { longitude: parsed.data.longitude } : {}),
    ...(parsed.data.photoUrl !== undefined ? { photo_url: parsed.data.photoUrl || null } : {}),
    ...(parsed.data.rating !== undefined ? { rating: parsed.data.rating } : {}),
    ...(parsed.data.vehicleType !== undefined ? { vehicle_type: parsed.data.vehicleType ? normalizeTransportationType(parsed.data.vehicleType) : null } : {}),
    ...(parsed.data.vehiclePlateNumber !== undefined ? { vehicle_plate_number: parsed.data.vehiclePlateNumber || null } : {}),
    ...(parsed.data.vehicleModel !== undefined ? { vehicle_model: parsed.data.vehicleModel || null } : {}),
    ...(approvalStatus !== undefined ? { approval_status: approvalStatus } : {}),
    ...(requestedStatus !== undefined ? { status: requestedStatus } : {}),
    ...(["rejected", "suspended"].includes(approvalStatus ?? "") ? { status: "offline", offline_since: now } : {}),
    ...(online === true ? { online_since: now, offline_since: null } : {}),
    ...(online === false ? { offline_since: now } : {}),
    last_seen_at: now,
    updated_at: now
  };

  const { data, error, removedColumns } = await updateDriverWithSchemaFallback(
    supabase,
    numericDriverId,
    updates,
    tenant.schemaReady ? tenant.companyId : null
  );

  if (error) {
    logApiError(error, "Unable to update driver.", requestContext(request, { driverId: numericDriverId }));
    return NextResponse.json({ error: "Unable to update driver." }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: "Driver not found." }, { status: 404 });

  const updatedDriver = normalizeDriverRecord({
    ...(parsed.data.photoUrl !== undefined ? { photo_url: parsed.data.photoUrl || null } : {}),
    ...(parsed.data.vehicleType !== undefined ? { vehicle_type: parsed.data.vehicleType ? normalizeTransportationType(parsed.data.vehicleType) : null } : {}),
    ...(parsed.data.vehiclePlateNumber !== undefined ? { vehicle_plate_number: parsed.data.vehiclePlateNumber || null } : {}),
    ...(parsed.data.vehicleModel !== undefined ? { vehicle_model: parsed.data.vehicleModel || null } : {}),
    ...(approvalStatus !== undefined ? { approval_status: approvalStatus } : {}),
    ...(requestedStatus !== undefined ? { status: requestedStatus } : {}),
    updated_at: now,
    ...(data ?? {})
  });

  await writeAuditLog(supabase, {
    actor: access.profile,
    action: "driver.update",
    entityType: "driver",
    entityId: numericDriverId,
    metadata: {
      approvalStatus: updatedDriver.approval_status,
      status: updatedDriver.status,
      schemaFallbackRemovedColumns: removedColumns
    },
    request
  });

  await writeOperationalEvent(supabase, {
    category: "dispatch",
    severity: updatedDriver.approval_status === "suspended" ? "warning" : "info",
    message: "Driver profile updated by admin.",
    entityType: "driver",
    entityId: numericDriverId,
    metadata: {
      approvalStatus: updatedDriver.approval_status,
      status: updatedDriver.status,
      schemaFallbackRemovedColumns: removedColumns
    },
    request
  });

  return NextResponse.json(updatedDriver);
}

export async function DELETE(request: Request, { params }: { params: Promise<{ driverId: string }> }) {
  const limited = await enforceRateLimit(request, "drivers-delete", { limit: 20, windowSeconds: 60 });
  if (limited) return limited;

  const { driverId } = await params;
  const access = await requireCloudFeature(request, "team_management", ["owner", "admin"]);
  if (!access.profile) return NextResponse.json({ error: access.error }, { status: access.status });
  if (access.error) return NextResponse.json({ error: access.error }, { status: access.status });

  const numericDriverId = Number(driverId);
  if (!Number.isInteger(numericDriverId) || numericDriverId <= 0) {
    return NextResponse.json({ error: "Invalid driver ID." }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Driver management is temporarily unavailable." }, { status: 503 });
  const tenant = await getTenantContextForProfile(supabase, access.profile);

  let currentQuery = supabase
    .from("drivers")
    .select("id,name,status,account_user_id")
    .eq("id", numericDriverId);
  if (tenant.schemaReady && tenant.companyId) currentQuery = currentQuery.eq("company_id", tenant.companyId);
  let current = await currentQuery.maybeSingle();

  if (missingDriverColumn(current.error) === "account_user_id") {
    let fallbackCurrent = supabase
      .from("drivers")
      .select("id,name,status")
      .eq("id", numericDriverId);
    if (tenant.schemaReady && tenant.companyId) fallbackCurrent = fallbackCurrent.eq("company_id", tenant.companyId);
    current = await fallbackCurrent.maybeSingle();
  }

  if (current.error) {
    logApiError(current.error, "Unable to inspect driver before deletion.", requestContext(request, { driverId: numericDriverId }));
    return NextResponse.json({ error: "Unable to inspect driver before deletion." }, { status: 500 });
  }

  if (!current.data) {
    return NextResponse.json({ error: "Driver not found." }, { status: 404 });
  }

  let assignedShipmentsQuery = supabase
    .from("shipments")
    .select("tracking_id,status")
    .eq("driver_id", numericDriverId)
    .limit(100);
  if (tenant.schemaReady && tenant.companyId) assignedShipmentsQuery = assignedShipmentsQuery.eq("company_id", tenant.companyId);
  const assignedShipments = await assignedShipmentsQuery;

  if (assignedShipments.error) {
    logApiError(assignedShipments.error, "Unable to inspect active shipments before driver deletion.", requestContext(request, { driverId: numericDriverId }));
    return NextResponse.json({ error: "Unable to inspect assigned shipments before deletion." }, { status: 500 });
  }

  const activeShipments = (assignedShipments.data ?? []).filter((shipment) => !completedShipmentStatuses.has(normalizeShipmentStatus(shipment.status)));
  if (activeShipments.length > 0) {
    return NextResponse.json({
      error: "Reassign or complete this driver's active shipments before deleting the driver profile.",
      activeShipments
    }, { status: 409 });
  }

  const linkedUserId = "account_user_id" in current.data ? current.data.account_user_id : null;
  if (linkedUserId && linkedUserId === access.profile.id) {
    return NextResponse.json({ error: "You cannot delete the driver profile linked to your own active admin session." }, { status: 409 });
  }

  await writeAuditLog(supabase, {
    actor: access.profile,
    action: "driver.delete",
    entityType: "driver",
    entityId: numericDriverId,
    metadata: {
      name: current.data.name,
      status: current.data.status,
      accountUserId: linkedUserId
    },
    request
  });

  await writeOperationalEvent(supabase, {
    category: "dispatch",
    severity: "warning",
    message: "Driver profile deleted by admin.",
    entityType: "driver",
    entityId: numericDriverId,
    metadata: {
      name: current.data.name,
      status: current.data.status,
      accountUserId: linkedUserId
    },
    request
  });

  let detachShipmentsQuery = supabase.from("shipments").update({ driver_id: null }).eq("driver_id", numericDriverId);
  if (tenant.schemaReady && tenant.companyId) detachShipmentsQuery = detachShipmentsQuery.eq("company_id", tenant.companyId);
  const detachedShipments = await detachShipmentsQuery;
  if (detachedShipments.error && !isMissingSchema(detachedShipments.error)) {
    logApiError(detachedShipments.error, "Unable to detach completed shipments before driver deletion.", requestContext(request, { driverId: numericDriverId }));
    return NextResponse.json({ error: "Unable to detach completed shipments before deleting the driver." }, { status: 500 });
  }

  const detachedProfiles = await supabase.from("user_profiles").update({ driver_id: null }).eq("driver_id", numericDriverId);
  if (detachedProfiles.error && !isMissingSchema(detachedProfiles.error)) {
    logApiError(detachedProfiles.error, "Unable to detach user profile before driver deletion.", requestContext(request, { driverId: numericDriverId }));
    return NextResponse.json({ error: "Unable to detach the linked user profile before deleting the driver." }, { status: 500 });
  }

  let deleteDriverQuery = supabase.from("drivers").delete().eq("id", numericDriverId);
  if (tenant.schemaReady && tenant.companyId) deleteDriverQuery = deleteDriverQuery.eq("company_id", tenant.companyId);
  const deleted = await deleteDriverQuery;
  if (deleted.error) {
    logApiError(deleted.error, "Unable to delete driver profile.", requestContext(request, { driverId: numericDriverId }));
    return NextResponse.json({ error: "Unable to delete driver profile." }, { status: 500 });
  }

  let deletedLinkedAccount = false;
  if (linkedUserId) {
    const authDeleted = await supabase.auth.admin.deleteUser(String(linkedUserId));
    if (authDeleted.error && !isMissingAuthUser(authDeleted.error)) {
      logApiError(authDeleted.error, "Driver profile deleted, but linked auth account deletion failed.", requestContext(request, { driverId: numericDriverId, userId: linkedUserId }));
      return NextResponse.json({
        ok: true,
        driverId: numericDriverId,
        warning: "Driver profile was deleted, but the linked login account could not be deleted."
      });
    }

    await supabase.from("user_profiles").delete().eq("id", String(linkedUserId));
    deletedLinkedAccount = !authDeleted.error;
  }

  return NextResponse.json({ ok: true, driverId: numericDriverId, deletedLinkedAccount });
}
