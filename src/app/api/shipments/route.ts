import { NextResponse } from "next/server";
import { z } from "zod";
import { makeTrackingId, shipmentStatuses, type ShipmentRecord } from "@/lib/shipments";
import { getSupabaseAdmin } from "@/lib/supabase-server";

const shipmentSchema = z.object({
  trackingId: z.string().trim().optional(),
  customerName: z.string().trim().min(2),
  customerEmail: z.string().trim().email().optional().or(z.literal("")),
  customerPhone: z.string().trim().optional(),
  pickupAddress: z.string().trim().min(4),
  deliveryAddress: z.string().trim().min(4),
  packageType: z.string().trim().min(2),
  weightKg: z.coerce.number().positive().optional(),
  urgency: z.string().trim().default("standard"),
  status: z.enum(shipmentStatuses).default("BOOKED"),
  driverId: z.string().trim().optional(),
  currentLat: z.coerce.number().optional(),
  currentLng: z.coerce.number().optional(),
  eta: z.string().trim().optional()
});

export async function GET() {
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json([]);

  const { data, error } = await supabase
    .from("shipments")
    .select("*, assigned_driver:drivers(id,name,status,phone,photo_url,latitude,longitude)")
    .order("created_at", { ascending: false })
    .limit(25);

  if (error) {
    console.error(error);
    return NextResponse.json({ error: "Unable to load shipments." }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}

export async function POST(request: Request) {
  const parsed = shipmentSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Please complete the shipment form." }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase service role is not configured." }, { status: 503 });
  }

  const trackingId = parsed.data.trackingId?.toUpperCase() || makeTrackingId();
  const payload = {
    tracking_id: trackingId,
    customer_name: parsed.data.customerName,
    customer_email: parsed.data.customerEmail || null,
    customer_phone: parsed.data.customerPhone || null,
    pickup_address: parsed.data.pickupAddress,
    delivery_address: parsed.data.deliveryAddress,
    package_type: parsed.data.packageType,
    weight_kg: parsed.data.weightKg ?? null,
    urgency: parsed.data.urgency,
    status: parsed.data.status,
    driver_id: parsed.data.driverId ? Number(parsed.data.driverId) : null,
    current_lat: parsed.data.currentLat ?? null,
    current_lng: parsed.data.currentLng ?? null,
    eta: parsed.data.eta ?? null,
    timeline: [
      { label: "Shipment created", location: parsed.data.pickupAddress, completed: true },
      { label: parsed.data.status.replaceAll("_", " "), location: parsed.data.deliveryAddress, completed: parsed.data.status === "DELIVERED" }
    ]
  };

  const { data, error } = await supabase.from("shipments").insert(payload).select("*").single();
  if (error) {
    console.error(error);
    return NextResponse.json({ error: "Unable to create shipment." }, { status: 500 });
  }

  return NextResponse.json(data as ShipmentRecord, { status: 201 });
}
