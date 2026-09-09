import { NextResponse } from "next/server";
import { z } from "zod";
import {
  driverBaseSelect,
  driverExtendedSelect,
  isDriverSchemaMismatch,
  missingDriverColumn,
  normalizeDriverRecord,
  optionalDriverColumns
} from "@/lib/driver-data";
import { normalizeShipmentStatus, type ShipmentRecord } from "@/lib/shipments";
import { requireRole } from "@/lib/request-auth";
import { shipmentWithDriverBaseSelect, shipmentWithDriverSelect } from "@/lib/shipment-data";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { enforceRateLimit, parseJson } from "@/server/api";
import { writeAuditLog } from "@/server/audit";
import { logApiError, requestContext } from "@/server/monitoring";
import { writeOperationalEvent } from "@/server/operational-events";

type SupabaseAdminClient = NonNullable<ReturnType<typeof getSupabaseAdmin>>;

const driverStatusSchema = z.object({
  status: z.enum(["online", "available", "in_transit", "busy", "offline"])
});

function onlineDurationSeconds(onlineSince?: string | null) {
  if (!onlineSince) return 0;
  const started = new Date(onlineSince).getTime();
  if (!Number.isFinite(started)) return 0;
  return Math.max(0, Math.floor((Date.now() - started) / 1000));
}

function numberValue(value: unknown) {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? amount : 0;
}

function hoursBetween(start?: string | null, end?: string | null) {
  if (!start || !end) return null;
  const startMs = new Date(start).getTime();
  const endMs = new Date(end).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) return null;
  return Math.round(((endMs - startMs) / 36_000) / 10);
}

function performanceGrade(score: number) {
  if (score >= 95) return "Elite";
  if (score >= 88) return "Excellent";
  if (score >= 78) return "Reliable";
  if (score >= 65) return "Needs support";
  return "At risk";
}

function makeStats(shipments: ShipmentRecord[], driver: { rating?: number | string | null; online_since?: string | null } | null) {
  const activeStatuses = new Set(["PENDING", "CONFIRMED", "DRIVER_ASSIGNED", "PICKED_UP", "IN_TRANSIT", "ARRIVED"]);
  const completedDeliveries = shipments.filter((shipment) => normalizeShipmentStatus(shipment.status) === "DELIVERED").length;
  const activeDeliveries = shipments.filter((shipment) => activeStatuses.has(normalizeShipmentStatus(shipment.status))).length;
  const failedDeliveries = shipments.filter((shipment) => ["CANCELLED"].includes(normalizeShipmentStatus(shipment.status)) || String(shipment.status).toUpperCase() === "EXCEPTION").length;
  const acceptedAssignments = shipments.filter((shipment) =>
    ["DRIVER_ASSIGNED", "PICKED_UP", "IN_TRANSIT", "ARRIVED", "DELIVERED"].includes(normalizeShipmentStatus(shipment.status))
  ).length;
  const rejectedAssignments = shipments.filter((shipment) =>
    shipment.timeline?.some((event) => event.label.toLowerCase().includes("driver rejected"))
  ).length;
  const assignmentTotal = acceptedAssignments + rejectedAssignments;
  const acceptanceRate = assignmentTotal > 0 ? Math.round((acceptedAssignments / assignmentTotal) * 100) : 100;
  const closedTotal = completedDeliveries + failedDeliveries;
  const deliverySuccessRate = closedTotal > 0 ? Math.round((completedDeliveries / closedTotal) * 100) : 100;
  const rating = Number(driver?.rating ?? 4.8);
  const performanceScore = Math.round((deliverySuccessRate * 0.45) + (acceptanceRate * 0.35) + (Math.min(5, Number.isFinite(rating) ? rating : 4.8) / 5) * 20);
  const completedHours = shipments
    .filter((shipment) => normalizeShipmentStatus(shipment.status) === "DELIVERED")
    .map((shipment) => hoursBetween(shipment.created_at, shipment.updated_at))
    .filter((value): value is number => value !== null);
  const activeRouteStates = Array.from(new Set(shipments
    .filter((shipment) => activeStatuses.has(normalizeShipmentStatus(shipment.status)))
    .map((shipment) => shipment.destination_state ?? shipment.delivery_address?.split(",").at(-1)?.trim())
    .filter(Boolean)
  )).slice(0, 5);
  const averageCompletionHours = completedHours.length
    ? Math.round((completedHours.reduce((sum, value) => sum + value, 0) / completedHours.length) * 10) / 10
    : null;
  const averageEtaHours = shipments.length
    ? Math.round((shipments.reduce((sum, shipment) => sum + numberValue(shipment.eta_hours), 0) / shipments.length) * 10) / 10
    : null;
  const payoutTotal = shipments.reduce((sum, shipment) => sum + numberValue(shipment.driver_payout_amount), 0);

  return {
    completedDeliveries,
    activeDeliveries,
    failedDeliveries,
    acceptedAssignments,
    rejectedAssignments,
    acceptanceRate,
    deliverySuccessRate,
    performanceScore,
    performanceGrade: performanceGrade(performanceScore),
    rating,
    onlineDurationSeconds: onlineDurationSeconds(driver?.online_since),
    payoutTotal,
    averageCompletionHours,
    averageEtaHours,
    activeRouteStates,
    routeFocus: activeRouteStates.length ? activeRouteStates.join(", ") : "No active route"
  };
}

async function fetchDriverProfile(supabase: SupabaseAdminClient, driverId: number) {
  let result = await supabase.from("drivers").select(driverExtendedSelect).eq("id", driverId).maybeSingle();

  if (isDriverSchemaMismatch(result.error)) {
    result = await supabase.from("drivers").select(driverBaseSelect).eq("id", driverId).maybeSingle();
  }

  return result;
}

async function fetchDriverShipments(supabase: SupabaseAdminClient, driverId: number) {
  let result = await supabase
    .from("shipments")
    .select(shipmentWithDriverSelect)
    .eq("driver_id", driverId)
    .order("updated_at", { ascending: false })
    .limit(75);

  if (isDriverSchemaMismatch(result.error)) {
    result = await supabase
      .from("shipments")
      .select(shipmentWithDriverBaseSelect)
      .eq("driver_id", driverId)
      .order("updated_at", { ascending: false })
      .limit(75);
  }

  return result;
}

async function verifyApprovedDriver(supabase: SupabaseAdminClient, driverId: number) {
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

async function updateDriverAvailabilityWithSchemaFallback(
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
    error: new Error("Unable to update driver availability after retrying schema-compatible payload."),
    removedColumns
  };
}

export async function GET(request: Request) {
  const limited = await enforceRateLimit(request, "driver-operations", { limit: 120, windowSeconds: 60 });
  if (limited) return limited;

  const access = await requireRole(request, ["driver"]);
  if (!access.profile) return NextResponse.json({ error: access.error }, { status: access.status });
  if (access.error) return NextResponse.json({ error: access.error }, { status: access.status });

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Driver operations are temporarily unavailable." }, { status: 503 });

  if (!access.profile.driver_id) {
    return NextResponse.json({
      profile: access.profile,
      driver: null,
      shipments: [],
      stats: makeStats([], null),
      message: "This driver account is not linked to a driver profile yet."
    });
  }

  const driverId = Number(access.profile.driver_id);
  const [driverResult, shipmentsResult] = await Promise.all([
    fetchDriverProfile(supabase, driverId),
    fetchDriverShipments(supabase, driverId)
  ]);

  if (driverResult.error) {
    logApiError(driverResult.error, "Unable to load driver operations profile.", requestContext(request, { driverId }));
    return NextResponse.json({ error: "Unable to load driver profile." }, { status: 500 });
  }

  if (shipmentsResult.error) {
    logApiError(shipmentsResult.error, "Unable to load assigned driver shipments.", requestContext(request, { driverId }));
    return NextResponse.json({ error: "Unable to load assigned shipments." }, { status: 500 });
  }

  const shipments = (shipmentsResult.data ?? []) as ShipmentRecord[];
  const driver = driverResult.data ? normalizeDriverRecord(driverResult.data as Record<string, unknown>) : null;

  return NextResponse.json({
    profile: access.profile,
    driver,
    shipments,
    stats: makeStats(shipments, driver),
    message: !driver ? "This driver account is not linked to an active driver record." : undefined
  });
}

export async function PATCH(request: Request) {
  const limited = await enforceRateLimit(request, "driver-operations-status", { limit: 80, windowSeconds: 60 });
  if (limited) return limited;

  const access = await requireRole(request, ["driver"]);
  if (!access.profile) return NextResponse.json({ error: access.error }, { status: access.status });
  if (access.error) return NextResponse.json({ error: access.error }, { status: access.status });

  const parsed = await parseJson(request, driverStatusSchema, "Choose a valid driver status.");
  if (parsed.response) return parsed.response;

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Driver operations are temporarily unavailable." }, { status: 503 });
  if (!access.profile.driver_id) return NextResponse.json({ error: "Driver account is not linked to a driver record." }, { status: 403 });

  const driverId = Number(access.profile.driver_id);
  const current = await verifyApprovedDriver(supabase, driverId);

  if (current.error) {
    logApiError(current.error, "Unable to verify driver status update.", requestContext(request, { driverId }));
    return NextResponse.json({ error: "Unable to verify driver account status." }, { status: 500 });
  }

  if (!current.data || !current.approved) {
    return NextResponse.json({ error: "Driver account must be approved before changing availability." }, { status: 403 });
  }

  const now = new Date().toISOString();
  const online = parsed.data.status !== "offline";
  const { data, error, removedColumns } = await updateDriverAvailabilityWithSchemaFallback(supabase, driverId, {
    status: parsed.data.status,
    is_online: online,
    ...(online ? { online_since: now, offline_since: null } : { offline_since: now }),
    last_seen_at: now,
    updated_at: now
  });

  if (error) {
    logApiError(error, "Unable to update driver availability.", requestContext(request, { driverId }));
    return NextResponse.json({ error: "Unable to update driver availability." }, { status: 500 });
  }

  const driver = normalizeDriverRecord({
    approval_status: "approved",
    is_online: online,
    ...(online ? { online_since: now, offline_since: null } : { offline_since: now }),
    last_seen_at: now,
    updated_at: now,
    ...(data ?? {})
  });

  await writeAuditLog(supabase, {
    actor: access.profile,
    action: "driver.availability_update",
    entityType: "driver",
    entityId: driverId,
    metadata: { status: driver.status, schemaFallbackRemovedColumns: removedColumns },
    request
  });

  await writeOperationalEvent(supabase, {
    category: "dispatch",
    message: "Driver availability changed.",
    entityType: "driver",
    entityId: driverId,
    metadata: { status: driver.status, schemaFallbackRemovedColumns: removedColumns },
    request
  });

  return NextResponse.json(driver);
}
