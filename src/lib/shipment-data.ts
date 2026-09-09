import { demoShipment, normalizeShipment, normalizeShipmentStatus, shipmentStatusLabel, type CoreShipmentStatus, type ShipmentRecord, type ShipmentTimelineEvent } from "@/lib/shipments";
import { isDriverSchemaMismatch } from "@/lib/driver-data";
import type { getSupabaseAdmin } from "@/lib/supabase-server";

type SupabaseAdminClient = NonNullable<ReturnType<typeof getSupabaseAdmin>>;

export const shipmentWithDriverSelect =
  "*, assigned_driver:drivers!shipments_driver_id_fkey(id,name,status,phone,photo_url,latitude,longitude,current_latitude,current_longitude,is_online,last_location_at,vehicle_type,approval_status,online_since,offline_since,last_seen_at,rating)";

export const shipmentWithDriverBaseSelect =
  "*, assigned_driver:drivers!shipments_driver_id_fkey(id,name,status,phone,latitude,longitude)";

export function normalizeTrackingId(trackingId: string) {
  return trackingId.trim().toUpperCase();
}

export function makeTimelineEvent(label: string, location?: string | null, completed = true): ShipmentTimelineEvent {
  return {
    label,
    location: location?.trim() || undefined,
    completed,
    occurred_at: new Date().toISOString()
  };
}

export function appendTimelineEvent(timeline: ShipmentTimelineEvent[] | null | undefined, event: ShipmentTimelineEvent) {
  const current = Array.isArray(timeline) ? timeline : [];
  const hasDuplicate = current.some((item) => item.label === event.label && item.location === event.location);
  return hasDuplicate ? current : [...current, event];
}

export function statusLabel(status: string) {
  return shipmentStatusLabel(status);
}

export function statusTimelineEvent(status: string, location?: string | null) {
  return makeTimelineEvent(statusLabel(status), location, status !== "OUT_FOR_DELIVERY");
}

const completedProgression: CoreShipmentStatus[] = [
  "CONFIRMED",
  "DRIVER_ASSIGNED",
  "PICKED_UP",
  "IN_TRANSIT",
  "ARRIVED",
  "DELIVERED"
];

function statusProgressLocation(status: CoreShipmentStatus, pickupAddress?: string | null, deliveryAddress?: string | null) {
  if (status === "CONFIRMED" || status === "DRIVER_ASSIGNED" || status === "PICKED_UP") return pickupAddress;
  return deliveryAddress;
}

export function appendStatusProgressionEvents(
  timeline: ShipmentTimelineEvent[] | null | undefined,
  status: string | null | undefined,
  locations: { pickupAddress?: string | null; deliveryAddress?: string | null } = {}
) {
  const normalized = normalizeShipmentStatus(status);
  if (normalized === "PENDING" || normalized === "CANCELLED") {
    return appendTimelineEvent(timeline, statusTimelineEvent(normalized, locations.pickupAddress ?? locations.deliveryAddress));
  }

  const currentIndex = completedProgression.indexOf(normalized);
  if (currentIndex === -1) return timeline ?? [];

  return completedProgression.slice(0, currentIndex + 1).reduce(
    (nextTimeline, lifecycleStatus) => appendTimelineEvent(
      nextTimeline,
      statusTimelineEvent(lifecycleStatus, statusProgressLocation(lifecycleStatus, locations.pickupAddress, locations.deliveryAddress))
    ),
    timeline ?? []
  );
}

export async function fetchShipmentByTracking(
  supabase: SupabaseAdminClient,
  trackingId: string,
  options: { companyId?: string | null } = {}
) {
  const normalizedTrackingId = normalizeTrackingId(trackingId);
  let query = supabase
    .from("shipments")
    .select(shipmentWithDriverSelect)
    .eq("tracking_id", normalizedTrackingId);
  if (options.companyId) query = query.eq("company_id", options.companyId);
  let { data, error } = await query.maybeSingle();

  if (isDriverSchemaMismatch(error)) {
    let fallbackQuery = supabase
      .from("shipments")
      .select(shipmentWithDriverBaseSelect)
      .eq("tracking_id", normalizedTrackingId);
    if (options.companyId) fallbackQuery = fallbackQuery.eq("company_id", options.companyId);
    const fallback = await fallbackQuery.maybeSingle();

    data = fallback.data;
    error = fallback.error;
  }

  return { data: data as ShipmentRecord | null, error };
}

export async function fetchNormalizedShipment(
  supabase: SupabaseAdminClient | null,
  trackingId: string,
  options: { includeProof?: boolean; publicTracking?: boolean } = {}
) {
  const normalizedTrackingId = normalizeTrackingId(trackingId);

  if (normalizedTrackingId === demoShipment.tracking_id) {
    return { shipment: normalizeShipment(demoShipment, options), error: null };
  }

  if (!supabase) {
    return { shipment: null, error: "Shipment tracking is not configured." };
  }

  const { data, error } = await fetchShipmentByTracking(supabase, normalizedTrackingId);
  if (error) return { shipment: null, error };
  if (!data) return { shipment: null, error: "Shipment not found." };

  return { shipment: normalizeShipment(data, options), error: null };
}
