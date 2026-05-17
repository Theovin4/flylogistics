import { demoShipment, normalizeShipment, type ShipmentRecord, type ShipmentTimelineEvent } from "@/lib/shipments";
import type { getSupabaseAdmin } from "@/lib/supabase-server";

type SupabaseAdminClient = NonNullable<ReturnType<typeof getSupabaseAdmin>>;

export const shipmentWithDriverSelect =
  "*, assigned_driver:drivers!shipments_driver_id_fkey(id,name,status,phone,photo_url,latitude,longitude)";

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
  return status.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function statusTimelineEvent(status: string, location?: string | null) {
  return makeTimelineEvent(statusLabel(status), location, status !== "OUT_FOR_DELIVERY");
}

export async function fetchShipmentByTracking(
  supabase: SupabaseAdminClient,
  trackingId: string
) {
  const normalizedTrackingId = normalizeTrackingId(trackingId);
  const { data, error } = await supabase
    .from("shipments")
    .select(shipmentWithDriverSelect)
    .eq("tracking_id", normalizedTrackingId)
    .maybeSingle();

  return { data: data as ShipmentRecord | null, error };
}

export async function fetchNormalizedShipment(
  supabase: SupabaseAdminClient | null,
  trackingId: string
) {
  const normalizedTrackingId = normalizeTrackingId(trackingId);

  if (normalizedTrackingId === demoShipment.tracking_id) {
    return { shipment: normalizeShipment(demoShipment), error: null };
  }

  if (!supabase) {
    return { shipment: null, error: "Shipment tracking is not configured." };
  }

  const { data, error } = await fetchShipmentByTracking(supabase, normalizedTrackingId);
  if (error) return { shipment: null, error };
  if (!data) return { shipment: null, error: "Shipment not found." };

  return { shipment: normalizeShipment(data), error: null };
}
