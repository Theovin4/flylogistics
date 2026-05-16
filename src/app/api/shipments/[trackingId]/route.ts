import { NextResponse } from "next/server";
import { z } from "zod";
import { shipmentStatuses } from "@/lib/shipments";
import { getSupabaseAdmin } from "@/lib/supabase-server";

const updateShipmentSchema = z.object({
  status: z.enum(shipmentStatuses).optional(),
  driverId: z.string().trim().optional(),
  currentLat: z.coerce.number().optional(),
  currentLng: z.coerce.number().optional(),
  eta: z.string().trim().optional()
});

export async function PATCH(request: Request, { params }: { params: Promise<{ trackingId: string }> }) {
  const { trackingId } = await params;
  const parsed = updateShipmentSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid shipment update." }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase service role is not configured." }, { status: 503 });

  const updates = {
    ...(parsed.data.status ? { status: parsed.data.status } : {}),
    ...(parsed.data.driverId !== undefined ? { driver_id: parsed.data.driverId ? Number(parsed.data.driverId) : null } : {}),
    ...(parsed.data.currentLat !== undefined ? { current_lat: parsed.data.currentLat } : {}),
    ...(parsed.data.currentLng !== undefined ? { current_lng: parsed.data.currentLng } : {}),
    ...(parsed.data.eta !== undefined ? { eta: parsed.data.eta } : {})
  };

  const { data, error } = await supabase
    .from("shipments")
    .update(updates)
    .eq("tracking_id", trackingId.toUpperCase())
    .select("*, assigned_driver:drivers(id,name,status,phone,photo_url,latitude,longitude)")
    .single();

  if (error) {
    console.error(error);
    return NextResponse.json({ error: "Unable to update shipment." }, { status: 500 });
  }

  return NextResponse.json(data);
}
