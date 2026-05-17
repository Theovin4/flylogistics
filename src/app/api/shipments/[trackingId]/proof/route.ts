import { NextResponse } from "next/server";
import { z } from "zod";
import { appendTimelineEvent, fetchShipmentByTracking, makeTimelineEvent, shipmentWithDriverSelect } from "@/lib/shipment-data";
import { requireRole } from "@/lib/request-auth";
import { getSupabaseAdmin } from "@/lib/supabase-server";

const proofSchema = z.object({
  proofImageUrl: z.string().url()
});

export async function PATCH(request: Request, { params }: { params: Promise<{ trackingId: string }> }) {
  const { trackingId } = await params;
  const access = await requireRole(request, ["admin", "dispatcher", "driver"]);
  if (!access.profile) return NextResponse.json({ error: access.error }, { status: access.status });
  if (access.error) return NextResponse.json({ error: access.error }, { status: access.status });

  const parsed = proofSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ error: "A valid proof image URL is required." }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase service role is not configured." }, { status: 503 });

  const current = await fetchShipmentByTracking(supabase, trackingId);
  if (current.error) {
    console.error(current.error);
    return NextResponse.json({ error: "Unable to load shipment before proof upload." }, { status: 500 });
  }
  if (!current.data) {
    return NextResponse.json({ error: "Shipment not found." }, { status: 404 });
  }

  const { data, error } = await supabase
    .from("shipments")
    .update({
      proof_image_url: parsed.data.proofImageUrl,
      status: "DELIVERED",
      timeline: appendTimelineEvent(current.data.timeline, makeTimelineEvent("Proof of delivery uploaded", current.data.delivery_address)),
      updated_at: new Date().toISOString()
    })
    .eq("tracking_id", trackingId.toUpperCase())
    .select(shipmentWithDriverSelect)
    .single();

  if (error) {
    console.error(error);
    return NextResponse.json({ error: "Unable to save proof of delivery." }, { status: 500 });
  }

  return NextResponse.json(data);
}
