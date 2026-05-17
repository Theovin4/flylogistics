import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/request-auth";
import { getSupabaseAdmin } from "@/lib/supabase-server";

const locationSchema = z.object({
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
  status: z.string().trim().min(2).max(40).optional()
});

export async function PATCH(request: Request, { params }: { params: Promise<{ driverId: string }> }) {
  const { driverId } = await params;
  const access = await requireRole(request, ["admin", "dispatcher", "driver"]);
  if (!access.profile) return NextResponse.json({ error: access.error }, { status: access.status });
  if (access.error) return NextResponse.json({ error: access.error }, { status: access.status });

  const numericDriverId = Number(driverId);
  if (!Number.isInteger(numericDriverId) || numericDriverId <= 0) {
    return NextResponse.json({ error: "Invalid driver ID." }, { status: 400 });
  }

  if (access.profile.role === "driver" && String(access.profile.driver_id ?? "") !== String(numericDriverId)) {
    return NextResponse.json({ error: "Driver account is not linked to this driver record." }, { status: 403 });
  }

  const parsed = locationSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "A valid latitude and longitude are required." }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase service role is not configured." }, { status: 503 });

  const updates = {
    latitude: parsed.data.latitude,
    longitude: parsed.data.longitude,
    ...(parsed.data.status ? { status: parsed.data.status } : {})
  };

  const { data: driver, error: driverError } = await supabase
    .from("drivers")
    .update(updates)
    .eq("id", numericDriverId)
    .select("id,name,status,phone,photo_url,latitude,longitude")
    .single();

  if (driverError) {
    console.error(driverError);
    return NextResponse.json({ error: "Unable to update driver location." }, { status: 500 });
  }

  const { data: shipments, error: shipmentError } = await supabase
    .from("shipments")
    .update({
      current_lat: parsed.data.latitude,
      current_lng: parsed.data.longitude,
      updated_at: new Date().toISOString()
    })
    .eq("driver_id", numericDriverId)
    .not("status", "in", "(DELIVERED,CANCELLED)")
    .select("tracking_id,status,driver_id,current_lat,current_lng");

  if (shipmentError) {
    console.error(shipmentError);
  }

  return NextResponse.json({
    driver,
    updatedShipments: shipments ?? [],
    warning: shipmentError ? "Driver updated, but assigned shipment positions could not be synced." : undefined
  });
}
