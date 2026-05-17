import { NextResponse } from "next/server";
import { z } from "zod";
import {
  makeTrackingId,
  shipmentStatuses,
  type QuoteRequestRecord,
  type ShipmentRecord
} from "@/lib/shipments";
import { makeTimelineEvent, shipmentWithDriverSelect, statusTimelineEvent } from "@/lib/shipment-data";
import { requireRole } from "@/lib/request-auth";
import { getSupabaseAdmin } from "@/lib/supabase-server";

const convertQuoteSchema = z.object({
  trackingId: z.string().trim().optional(),
  driverId: z.string().trim().optional(),
  status: z.enum(shipmentStatuses).optional(),
  eta: z.string().trim().optional()
});

export async function POST(request: Request, { params }: { params: Promise<{ requestId: string }> }) {
  const { requestId } = await params;
  const access = await requireRole(request, ["admin", "dispatcher"]);
  if (!access.profile) return NextResponse.json({ error: access.error }, { status: access.status });
  if (access.error) return NextResponse.json({ error: access.error }, { status: access.status });

  const body = await request.json().catch(() => ({}));
  const parsed = convertQuoteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid quote conversion request." }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase service role is not configured." }, { status: 503 });

  const normalizedRequestId = requestId.trim().toUpperCase();
  const { data: quote, error: quoteError } = await supabase
    .from("quote_requests")
    .select("*")
    .eq("request_id", normalizedRequestId)
    .maybeSingle();

  if (quoteError) {
    console.error(quoteError);
    return NextResponse.json({ error: "Unable to load quote request." }, { status: 500 });
  }

  if (!quote) {
    return NextResponse.json({ error: "Quote request not found." }, { status: 404 });
  }

  const quoteRequest = quote as QuoteRequestRecord;
  if (quoteRequest.status === "CONVERTED") {
    return NextResponse.json({ error: "This quote request has already been converted." }, { status: 409 });
  }

  const trackingId = parsed.data.trackingId?.toUpperCase() || makeTrackingId();
  const selectedStatus = parsed.data.status ?? (parsed.data.driverId ? "ASSIGNED" : "BOOKED");
  const eta = parsed.data.eta || `${quoteRequest.estimated_eta_hours}h`;
  const timeline = [
    makeTimelineEvent("Quote request converted", quoteRequest.pickup_address),
    makeTimelineEvent("Shipment created", quoteRequest.pickup_address),
    ...(parsed.data.driverId ? [makeTimelineEvent("Driver assigned", quoteRequest.pickup_address)] : []),
    ...(selectedStatus !== "BOOKED" ? [statusTimelineEvent(selectedStatus, quoteRequest.delivery_address)] : [])
  ];

  const payload = {
    tracking_id: trackingId,
    customer_name: quoteRequest.customer_name,
    customer_email: quoteRequest.customer_email,
    customer_phone: quoteRequest.customer_phone ?? null,
    pickup_address: quoteRequest.pickup_address,
    delivery_address: quoteRequest.delivery_address,
    package_type: quoteRequest.package_type,
    weight_kg: quoteRequest.weight_kg,
    urgency: quoteRequest.urgency,
    quoted_price: quoteRequest.estimated_price,
    status: selectedStatus,
    driver_id: parsed.data.driverId ? Number(parsed.data.driverId) : null,
    eta,
    timeline
  };

  const { data: shipment, error: shipmentError } = await supabase
    .from("shipments")
    .insert(payload)
    .select(shipmentWithDriverSelect)
    .single();

  if (shipmentError) {
    console.error(shipmentError);
    return NextResponse.json({ error: "Unable to create shipment from quote request." }, { status: 500 });
  }

  const { error: updateError } = await supabase
    .from("quote_requests")
    .update({ status: "CONVERTED" })
    .eq("request_id", normalizedRequestId);

  if (updateError) {
    console.error(updateError);
  }

  return NextResponse.json({ shipment: shipment as ShipmentRecord, quote: { ...quoteRequest, status: "CONVERTED" } }, { status: 201 });
}
