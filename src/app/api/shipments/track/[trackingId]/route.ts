import { NextResponse } from "next/server";
import { z } from "zod";
import { demoShipment, normalizeShipment } from "@/lib/shipments";
import { fetchNormalizedShipment } from "@/lib/shipment-data";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { apiError, enforceRateLimit, handleApiError } from "@/server/api";
import { refreshCarrierTrackingForFlyNumber } from "@/server/carrier-tracking";
import { logWarn, requestContext } from "@/server/monitoring";

const trackingIdSchema = z.string().trim().min(6).max(80).regex(/^[a-z0-9-]+$/i);
const publicTrackingHeaders = { "Cache-Control": "public, s-maxage=20, stale-while-revalidate=60" };
const publicTrackingMissHeaders = { "Cache-Control": "public, s-maxage=10, stale-while-revalidate=30" };

export async function GET(request: Request, { params }: { params: Promise<{ trackingId: string }> }) {
  const limited = await enforceRateLimit(request, "shipment-tracking", { limit: 60, windowSeconds: 60 });
  if (limited) return limited;

  const { trackingId } = await params;
  const parsedTrackingId = trackingIdSchema.safeParse(trackingId);
  if (!parsedTrackingId.success) return apiError("Invalid tracking ID.", { status: 400 });

  const supabase = getSupabaseAdmin();

  try {
    const refreshed = await refreshCarrierTrackingForFlyNumber(supabase, parsedTrackingId.data, request);
    if (refreshed.data) {
      return NextResponse.json(normalizeShipment(refreshed.data, { includeProof: false, publicTracking: true }), {
        headers: publicTrackingHeaders
      });
    }
  } catch (error) {
    logWarn("Carrier refresh failed before shipment tracking response; falling back to local shipment.", requestContext(request, {
      trackingId: parsedTrackingId.data,
      error: error instanceof Error ? error.message : String(error)
    }));
  }

  const { shipment, error } = await fetchNormalizedShipment(supabase, parsedTrackingId.data, { includeProof: false, publicTracking: true });
  if (shipment) return NextResponse.json(shipment, { headers: publicTrackingHeaders });

  if (parsedTrackingId.data.toUpperCase() === demoShipment.tracking_id) {
    return NextResponse.json(normalizeShipment(demoShipment, { includeProof: false, publicTracking: true }), {
      headers: publicTrackingHeaders
    });
  }

  if (typeof error === "string") {
    return NextResponse.json({ error }, { status: error.includes("configured") ? 503 : 404, headers: publicTrackingMissHeaders });
  }

  return handleApiError(error, request, "Unable to load shipment.");
}
