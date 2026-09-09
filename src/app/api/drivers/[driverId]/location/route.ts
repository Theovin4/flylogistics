import { NextResponse } from "next/server";
import { z } from "zod";
import {
  driverBaseSelect,
  missingDriverColumn,
  normalizeDriverRecord,
  optionalDriverColumns
} from "@/lib/driver-data";
import { requireRole } from "@/lib/request-auth";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { enforceRateLimit, parseJson } from "@/server/api";
import { writeAuditLog } from "@/server/audit";
import { logApiError, requestContext } from "@/server/monitoring";
import { writeOperationalEvent } from "@/server/operational-events";

const locationSchema = z.object({
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
  status: z.string().trim().min(2).max(40).optional()
});

type SupabaseAdminClient = NonNullable<ReturnType<typeof getSupabaseAdmin>>;

async function verifyDriverCanUpdateLocation(supabase: SupabaseAdminClient, driverId: number) {
  let result = await supabase
    .from("drivers")
    .select("id,approval_status")
    .eq("id", driverId)
    .maybeSingle();

  if (missingDriverColumn(result.error) === "approval_status") {
    result = await supabase.from("drivers").select("id").eq("id", driverId).maybeSingle();
    return { ...result, approved: Boolean(result.data), schemaFallback: true };
  }

  return { ...result, approved: result.data?.approval_status === "approved", schemaFallback: false };
}

async function updateDriverLocationWithSchemaFallback(
  supabase: SupabaseAdminClient,
  driverId: number,
  payload: Record<string, unknown>
) {
  const nextPayload = { ...payload };
  const removedColumns: string[] = [];

  for (let attempt = 0; attempt <= optionalDriverColumns.size; attempt += 1) {
    const result = await supabase
      .from("drivers")
      .update(nextPayload)
      .eq("id", driverId)
      .select(driverBaseSelect)
      .single();

    if (!result.error) return { ...result, removedColumns };

    const missingColumn = missingDriverColumn(result.error);
    if (!missingColumn || !optionalDriverColumns.has(missingColumn) || !(missingColumn in nextPayload)) {
      return { ...result, removedColumns };
    }

    delete nextPayload[missingColumn];
    removedColumns.push(missingColumn);
  }

  return {
    data: null,
    error: new Error("Unable to update driver location after retrying schema-compatible payload."),
    removedColumns
  };
}

export async function PATCH(request: Request, { params }: { params: Promise<{ driverId: string }> }) {
  const limited = await enforceRateLimit(request, "driver-location-update", { limit: 120, windowSeconds: 60 });
  if (limited) return limited;

  const { driverId } = await params;
  const access = await requireRole(request, ["admin", "dispatcher", "driver"]);
  if (!access.profile) return NextResponse.json({ error: access.error }, { status: access.status });
  if (access.error) return NextResponse.json({ error: access.error }, { status: access.status });

  const numericDriverId = Number(driverId);
  if (!Number.isInteger(numericDriverId) || numericDriverId <= 0) {
    return NextResponse.json({ error: "Invalid driver ID." }, { status: 400 });
  }

  if (access.profile.role === "driver" && String(access.profile.driver_id ?? "") !== String(numericDriverId)) {
    return NextResponse.json({ error: "Driver account is not linked to this driver record." }, { status: 403 });
  }

  const parsed = await parseJson(request, locationSchema, "A valid latitude and longitude are required.");
  if (parsed.response) return parsed.response;

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Driver location updates are temporarily unavailable." }, { status: 503 });

  if (access.profile.role === "driver") {
    const currentDriver = await verifyDriverCanUpdateLocation(supabase, numericDriverId);

    if (currentDriver.error) {
      logApiError(currentDriver.error, "Unable to verify driver approval before location update.", requestContext(request, { driverId: numericDriverId }));
      return NextResponse.json({ error: "Unable to verify driver account status." }, { status: 500 });
    }

    if (!currentDriver.data || !currentDriver.approved) {
      return NextResponse.json({ error: "Driver account must be approved before updating live location." }, { status: 403 });
    }
  }

  const now = new Date().toISOString();
  const normalizedStatus = parsed.data.status?.toLowerCase();
  const isOnline = normalizedStatus ? !["offline", "suspended", "rejected"].includes(normalizedStatus) : true;
  const updates: Record<string, unknown> = {
    latitude: parsed.data.latitude,
    longitude: parsed.data.longitude,
    current_latitude: parsed.data.latitude,
    current_longitude: parsed.data.longitude,
    is_online: isOnline,
    last_location_at: now,
    ...(parsed.data.status ? { status: parsed.data.status } : {}),
    ...(isOnline ? { online_since: now, offline_since: null } : { offline_since: now }),
    last_seen_at: now,
    updated_at: now
  };

  const { data: driverData, error: driverError, removedColumns } = await updateDriverLocationWithSchemaFallback(supabase, numericDriverId, updates);

  if (driverError) {
    logApiError(driverError, "Unable to update driver location.", requestContext(request, { driverId: numericDriverId }));
    return NextResponse.json({ error: "Unable to update driver location." }, { status: 500 });
  }

  const driver = normalizeDriverRecord({
    ...(driverData ?? {}),
    latitude: parsed.data.latitude,
    longitude: parsed.data.longitude,
    current_latitude: parsed.data.latitude,
    current_longitude: parsed.data.longitude,
    is_online: isOnline,
    last_location_at: now,
    approval_status: "approved",
    ...(parsed.data.status ? { status: parsed.data.status } : {}),
    ...(isOnline ? { online_since: now, offline_since: null } : { offline_since: now }),
    last_seen_at: now,
    updated_at: now
  });

  const { data: shipments, error: shipmentError } = await supabase
    .from("shipments")
    .update({
      current_lat: parsed.data.latitude,
      current_lng: parsed.data.longitude,
      updated_at: new Date().toISOString()
    })
    .eq("driver_id", numericDriverId)
    .not("status", "in", "(DELIVERED,CANCELLED)")
    .select("tracking_id,status,driver_id,current_lat,current_lng");

  if (shipmentError) {
    logApiError(shipmentError, "Driver location updated but shipment position sync failed.", requestContext(request, { driverId: numericDriverId }));
  }

  await writeAuditLog(supabase, {
    actor: access.profile,
    action: "driver.location_update",
    entityType: "driver",
    entityId: numericDriverId,
    metadata: {
      latitude: parsed.data.latitude,
      longitude: parsed.data.longitude,
      status: parsed.data.status,
      syncedShipments: shipments?.length ?? 0,
      schemaFallbackRemovedColumns: removedColumns
    },
    request
  });

  await writeOperationalEvent(supabase, {
    category: "shipment",
    severity: shipmentError ? "warning" : "info",
    message: "Driver location update synced to assigned shipments.",
    entityType: "driver",
    entityId: numericDriverId,
    metadata: {
      status: parsed.data.status,
      syncedShipments: shipments?.length ?? 0,
      shipmentSyncError: shipmentError?.message,
      schemaFallbackRemovedColumns: removedColumns
    },
    request
  });

  return NextResponse.json({
    driver,
    updatedShipments: shipments ?? [],
    warning: shipmentError ? "Driver updated, but assigned shipment positions could not be synced." : undefined
  });
}
