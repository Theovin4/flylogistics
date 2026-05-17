import { NextResponse } from "next/server";
import { z } from "zod";
import { shipmentStatuses } from "@/lib/shipments";
import {
  appendTimelineEvent,
  fetchShipmentByTracking,
  makeTimelineEvent,
  shipmentWithDriverSelect,
  statusTimelineEvent
} from "@/lib/shipment-data";
import { requireRole } from "@/lib/request-auth";
import { getSupabaseAdmin } from "@/lib/supabase-server";

const updateShipmentSchema = z.object({
  status: z.enum(shipmentStatuses).optional(),
  driverId: z.string().trim().optional(),
  currentLat: z.coerce.number().optional(),
  currentLng: z.coerce.number().optional(),
  eta: z.string().trim().optional(),
  timelineLabel: z.string().trim().min(2).max(120).optional(),
  timelineLocation: z.string().trim().max(160).optional(),
  timelineCompleted: z.boolean().optional()
});

export async function PATCH(request: Request, { params }: { params: Promise<{ trackingId: string }> }) {
  const { trackingId } = await params;
  const access = await requireRole(request, ["admin", "dispatcher", "driver"]);
  if (!access.profile) return NextResponse.json({ error: access.error }, { status: access.status });
  if (access.error) return NextResponse.json({ error: access.error }, { status: access.status });

  const parsed = updateShipmentSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid shipment update." }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase service role is not configured." }, { status: 503 });

  const current = await fetchShipmentByTracking(supabase, trackingId);
  if (current.error) {
    console.error(current.error);
    return NextResponse.json({ error: "Unable to load shipment before update." }, { status: 500 });
  }
  if (!current.data) {
    return NextResponse.json({ error: "Shipment not found." }, { status: 404 });
  }

  let timeline = current.data.timeline ?? [];
  if (parsed.data.status && parsed.data.status !== current.data.status) {
    timeline = appendTimelineEvent(timeline, statusTimelineEvent(parsed.data.status, current.data.delivery_address));
  }
  if (parsed.data.driverId !== undefined && String(parsed.data.driverId || "") !== String(current.data.driver_id ?? "")) {
    timeline = appendTimelineEvent(
      timeline,
      makeTimelineEvent(parsed.data.driverId ? "Driver assigned" : "Driver unassigned", current.data.pickup_address)
    );
  }
  if (parsed.data.timelineLabel) {
    timeline = appendTimelineEvent(
      timeline,
      makeTimelineEvent(parsed.data.timelineLabel, parsed.data.timelineLocation, parsed.data.timelineCompleted ?? true)
    );
  }

  const updates = {
    ...(parsed.data.status ? { status: parsed.data.status } : {}),
    ...(parsed.data.driverId !== undefined ? { driver_id: parsed.data.driverId ? Number(parsed.data.driverId) : null } : {}),
    ...(parsed.data.currentLat !== undefined ? { current_lat: parsed.data.currentLat } : {}),
    ...(parsed.data.currentLng !== undefined ? { current_lng: parsed.data.currentLng } : {}),
    ...(parsed.data.eta !== undefined ? { eta: parsed.data.eta } : {}),
    timeline,
    updated_at: new Date().toISOString()
  };

  const { data, error } = await supabase
    .from("shipments")
    .update(updates)
    .eq("tracking_id", trackingId.toUpperCase())
    .select(shipmentWithDriverSelect)
    .single();

  if (error) {
    console.error(error);
    return NextResponse.json({ error: "Unable to update shipment." }, { status: 500 });
  }

  return NextResponse.json(data);
}
