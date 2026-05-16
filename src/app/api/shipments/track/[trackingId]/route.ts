import { NextResponse } from "next/server";
import { demoShipment, normalizeShipment, type ShipmentRecord } from "@/lib/shipments";
import { getSupabaseAdmin } from "@/lib/supabase-server";

export async function GET(_: Request, { params }: { params: Promise<{ trackingId: string }> }) {
  const { trackingId } = await params;
  const supabase = getSupabaseAdmin();

  if (!supabase) {
    if (trackingId.toUpperCase() === demoShipment.tracking_id) {
      return NextResponse.json(normalizeShipment(demoShipment));
    }
    return NextResponse.json({ error: "Shipment tracking is not configured." }, { status: 503 });
  }

  const { data, error } = await supabase
    .from("shipments")
    .select("*, assigned_driver:drivers(id,name,status,phone,photo_url,latitude,longitude)")
    .eq("tracking_id", trackingId.toUpperCase())
    .maybeSingle();

  if (error) {
    console.error(error);
    if (trackingId.toUpperCase() === demoShipment.tracking_id) {
      return NextResponse.json(normalizeShipment(demoShipment));
    }
    return NextResponse.json({ error: "Unable to load shipment." }, { status: 500 });
  }

  if (!data) {
    if (trackingId.toUpperCase() === demoShipment.tracking_id) {
      return NextResponse.json(normalizeShipment(demoShipment));
    }
    return NextResponse.json({ error: "Shipment not found." }, { status: 404 });
  }

  return NextResponse.json(normalizeShipment(data as ShipmentRecord));
}
