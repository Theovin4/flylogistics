import { NextResponse } from "next/server";
import { demoShipment } from "@/lib/shipments";
import { fetchNormalizedShipment } from "@/lib/shipment-data";
import { getSupabaseAdmin } from "@/lib/supabase-server";

export async function GET(_: Request, { params }: { params: Promise<{ trackingId: string }> }) {
  const { trackingId } = await params;
  const supabase = getSupabaseAdmin();

  const { shipment, error } = await fetchNormalizedShipment(supabase, trackingId);
  if (shipment) return NextResponse.json(shipment);

  if (trackingId.toUpperCase() === demoShipment.tracking_id) {
    return NextResponse.json(shipment);
  }

  if (typeof error === "string") {
    return NextResponse.json({ error }, { status: error.includes("configured") ? 503 : 404 });
  }

  console.error(error);
  return NextResponse.json({ error: "Unable to load shipment.", details: error?.message, code: error?.code }, { status: 500 });
}
