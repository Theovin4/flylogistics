import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { shipmentWithDriverSelect } from "@/lib/shipment-data";
import { normalizeShipment, type ShipmentRecord } from "@/lib/shipments";
import { enforceRateLimit } from "@/server/api";
import { getPublicTenantProfileById } from "@/server/public-tenant-profile";

const slugSchema = z.string().trim().min(2).max(80).regex(/^[a-z0-9-]+$/i);
const trackingSchema = z.string().trim().min(6).max(80).regex(/^[a-z0-9-]+$/i);

export async function GET(request: Request, { params }: { params: Promise<{ tenantSlug: string; trackingId: string }> }) {
  const limited = await enforceRateLimit(request, "cloud-public-tracking", { limit: 50, windowSeconds: 60 });
  if (limited) return limited;
  const raw = await params;
  const slug = slugSchema.safeParse(raw.tenantSlug);
  const tracking = trackingSchema.safeParse(raw.trackingId);
  if (!slug.success || !tracking.success) return NextResponse.json({ error: "Enter a valid tracking number." }, { status: 400 });
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Tracking is temporarily unavailable." }, { status: 503 });
  const shipmentIdentity = await supabase.from("shipments").select("id,company_id").eq("tracking_id", tracking.data.toUpperCase()).maybeSingle();
  if (shipmentIdentity.error || !shipmentIdentity.data?.company_id) return NextResponse.json({ error: "Tracking number not found for this company." }, { status: 404 });
  const company = await getPublicTenantProfileById(supabase, String(shipmentIdentity.data.company_id));
  if (company.error || !company.profile || company.profile.slug !== slug.data) return NextResponse.json({ error: "Tracking number not found for this company." }, { status: 404 });
  const shipment = await supabase.from("shipments").select(shipmentWithDriverSelect).eq("id", shipmentIdentity.data.id).eq("company_id", shipmentIdentity.data.company_id).maybeSingle();
  if (shipment.error || !shipment.data) return NextResponse.json({ error: "Tracking number not found for this company." }, { status: 404 });
  return NextResponse.json({ company: company.profile, shipment: normalizeShipment(shipment.data as unknown as ShipmentRecord, { includeProof: false, publicTracking: true }) }, { headers: { "Cache-Control": "public, s-maxage=15, stale-while-revalidate=45" } });
}
