import { NextResponse } from "next/server";

export async function GET(_: Request, { params }: { params: Promise<{ trackingId: string }> }) {
  const { trackingId } = await params;
  return NextResponse.json({
    trackingId,
    status: "IN_TRANSIT",
    eta: "4h 20m",
    confidence: 97,
    vehicle: { id: "FLY-224", lat: 33.749, lng: -84.388, speedKph: 71 },
    events: [
      { label: "Picked up", location: "Atlanta, GA", completed: true },
      { label: "Linehaul", location: "I-85 corridor", completed: true },
      { label: "Final hub", location: "Newark, NJ", completed: false }
    ]
  });
}
