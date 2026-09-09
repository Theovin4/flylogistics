import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { cleanEnv } from "@/lib/env";
import { appendTimelineEvent } from "@/lib/shipment-data";
import type { ShipmentRecord, ShipmentStatus } from "@/lib/shipments";
import { customerTrackingMessageForCarrierStatus, makeFlyTrackingTimelineEvent } from "@/lib/tracking-status";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { logApiError, logInfo, logWarn, requestContext } from "@/server/monitoring";
import { writeOperationalEvent } from "@/server/operational-events";
import { sendShipmentLifecycleEmail } from "@/server/shipment-emails";

export const dynamic = "force-dynamic";

type JsonRecord = Record<string, unknown>;

type SendboxEvent = {
  eventType: string;
  normalizedEvent: string;
  carrierStatus: string;
  flyTrackingId: string | null;
  carrierShipmentId: string | null;
  carrierTrackingId: string | null;
  location: string | null;
};

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : null;
}

function nested(record: JsonRecord | null, key: string) {
  return asRecord(record?.[key]);
}

function stringAt(record: JsonRecord | null, keys: string[]) {
  for (const key of keys) {
    const value = record?.[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return null;
}

function bearerValue(header: string | null) {
  return header?.replace(/^bearer\s+/i, "").trim() ?? null;
}

function safeEqual(left: string | null | undefined, right: string) {
  if (!left) return false;
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function signatureDigest(rawBody: string, secret: string) {
  return createHmac("sha256", secret).update(rawBody).digest("hex");
}

function verifySendboxRequest(request: Request, rawBody: string) {
  const secret = cleanEnv(process.env.CARRIER_WEBHOOK_SECRET);
  if (!secret) return { ok: false, status: 503, error: "Carrier webhook secret is not configured." };

  const sharedSecret =
    request.headers.get("x-fly-webhook-secret") ??
    request.headers.get("x-webhook-secret") ??
    request.headers.get("x-sendbox-webhook-secret") ??
    request.headers.get("x-sendbox-secret") ??
    bearerValue(request.headers.get("authorization"));

  if (safeEqual(sharedSecret, secret)) return { ok: true };

  const providedSignature =
    request.headers.get("x-sendbox-signature") ??
    request.headers.get("x-sendbox-signature-256") ??
    request.headers.get("x-hub-signature-256");

  const normalizedSignature = providedSignature?.replace(/^sha256=/i, "").trim();
  const expectedSignature = signatureDigest(rawBody, secret);
  if (safeEqual(normalizedSignature, expectedSignature)) return { ok: true };

  return { ok: false, status: 401, error: "Invalid Sendbox webhook signature." };
}

function parseJsonBody(rawBody: string) {
  if (!rawBody) return {};
  try {
    return JSON.parse(rawBody) as unknown;
  } catch {
    return null;
  }
}

function normalizeEventText(value: string | null | undefined) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

function normalizeSendboxEvent(eventType: string | null, carrierStatus: string | null) {
  const combined = `${normalizeEventText(eventType)}_${normalizeEventText(carrierStatus)}`;
  if (combined.includes("cancel")) return "shipment_cancelled";
  if (combined.includes("deliver")) return "shipment_delivered";
  if (combined.includes("transit") || combined.includes("moving") || combined.includes("dispatched")) return "shipment_in_transit";
  if (combined.includes("picked") || combined.includes("pickup")) return "shipment_picked_up";
  if (combined.includes("created") || combined.includes("booked") || combined.includes("confirmed")) return "shipment_created";
  return normalizeEventText(eventType) || "tracking_updated";
}

function shipmentStatusForEvent(eventName: string): ShipmentStatus | null {
  switch (eventName) {
    case "shipment_created":
      return "CONFIRMED";
    case "shipment_picked_up":
      return "PICKED_UP";
    case "shipment_in_transit":
      return "IN_TRANSIT";
    case "shipment_delivered":
      return "DELIVERED";
    case "shipment_cancelled":
      return "CANCELLED";
    default:
      return null;
  }
}

function parseSendboxEvent(body: unknown): SendboxEvent {
  const root = asRecord(body);
  const data = nested(root, "data") ?? nested(root, "shipment") ?? nested(root, "tracking") ?? nested(root, "package") ?? root;
  const metadata = nested(data, "metadata") ?? nested(root, "metadata");
  const statusRecord = nested(data, "status") ?? nested(data, "current_status") ?? nested(root, "status");
  const locationRecord = nested(data, "location") ?? nested(data, "current_location") ?? nested(root, "location");
  const trackingRecord = nested(data, "tracking") ?? nested(root, "tracking");
  const eventType = stringAt(root, ["event", "event_type", "type", "name"]) ?? stringAt(data, ["event", "event_type", "type"]);
  const carrierStatus =
    stringAt(data, ["status", "status_code", "tracking_status", "shipment_state", "state"]) ??
    stringAt(statusRecord, ["code", "name", "status", "description"]) ??
    eventType ??
    "webhook_received";
  const normalizedEvent = normalizeSendboxEvent(eventType, carrierStatus);

  return {
    eventType: eventType ?? normalizedEvent,
    normalizedEvent,
    carrierStatus,
    flyTrackingId:
      stringAt(metadata, ["fly_tracking_id", "tracking_id", "trackingId", "platform_order_number"]) ??
      stringAt(data, ["fly_tracking_id", "platform_order_number", "order_number", "reference", "tracking_id", "trackingId"]),
    carrierShipmentId: stringAt(data, ["shipment_id", "id", "_id", "package_id"]) ?? stringAt(root, ["shipment_id", "id"]),
    carrierTrackingId:
      stringAt(data, ["code", "tracking_number", "tracking_code", "carrier_tracking_id", "waybill_number"]) ??
      stringAt(trackingRecord, ["code", "tracking_number", "tracking_code"]),
    location:
      stringAt(data, ["location", "current_location", "city", "state"]) ??
      stringAt(locationRecord, ["name", "address", "city", "state", "description"])
  };
}

async function findShipment(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  event: SendboxEvent
) {
  if (event.flyTrackingId) {
    const byFlyTracking = await supabase
      .from("shipments")
      .select("*")
      .eq("tracking_id", event.flyTrackingId.toUpperCase())
      .maybeSingle();
    if (byFlyTracking.error || byFlyTracking.data) return byFlyTracking;
  }

  if (event.carrierShipmentId) {
    const byCarrierShipment = await supabase
      .from("shipments")
      .select("*")
      .eq("carrier_shipment_id", event.carrierShipmentId)
      .maybeSingle();
    if (byCarrierShipment.error || byCarrierShipment.data) return byCarrierShipment;
  }

  if (event.carrierTrackingId) {
    return supabase
      .from("shipments")
      .select("*")
      .eq("carrier_tracking_id", event.carrierTrackingId)
      .maybeSingle();
  }

  return { data: null, error: null };
}

function statusTimestamp(status: ShipmentStatus | null) {
  const now = new Date().toISOString();
  switch (status) {
    case "PICKED_UP":
      return { picked_up_at: now };
    case "IN_TRANSIT":
      return { in_transit_at: now };
    case "DELIVERED":
      return { delivered_at: now };
    case "CANCELLED":
      return { failed_at: now, failed_reason: "Carrier cancelled shipment." };
    default:
      return {};
  }
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const verification = verifySendboxRequest(request, rawBody);
  if (!verification.ok) {
    logWarn("Rejected Sendbox webhook.", requestContext(request, { reason: verification.error }));
    return NextResponse.json({ error: verification.error }, { status: verification.status ?? 401 });
  }

  const body = parseJsonBody(rawBody);
  if (body === null) {
    logWarn("Rejected Sendbox webhook with invalid JSON.", requestContext(request));
    return NextResponse.json({ error: "Invalid Sendbox webhook payload." }, { status: 400 });
  }
  const event = parseSendboxEvent(body);
  const nextStatus = shipmentStatusForEvent(event.normalizedEvent);
  const supabase = getSupabaseAdmin();

  logInfo("Received Sendbox webhook.", requestContext(request, {
    eventType: event.eventType,
    normalizedEvent: event.normalizedEvent,
    flyTrackingId: event.flyTrackingId,
    carrierShipmentId: event.carrierShipmentId,
    carrierTrackingId: event.carrierTrackingId
  }));

  if (!supabase) {
    return NextResponse.json({ ok: true, matched: false, stored: false, webhook: "sendbox" });
  }

  try {
    const { data: shipment, error } = await findShipment(supabase, event);
    if (error) throw error;

    let matchedTrackingId: string | null = null;
    if (shipment) {
      const currentShipment = shipment as ShipmentRecord;
      matchedTrackingId = currentShipment.tracking_id;
      const timeline = appendTimelineEvent(
        currentShipment.timeline,
        makeFlyTrackingTimelineEvent(nextStatus, event.location ?? currentShipment.delivery_address, event.carrierStatus)
      );
      const update = {
        carrier_provider: "sendbox",
        carrier_status: event.carrierStatus,
        carrier_raw_response: body ?? {},
        ...(event.carrierShipmentId ? { carrier_shipment_id: event.carrierShipmentId } : {}),
        ...(event.carrierTrackingId ? { carrier_tracking_id: event.carrierTrackingId } : {}),
        ...(nextStatus ? { status: nextStatus, customer_status_message: customerTrackingMessageForCarrierStatus(nextStatus, event.carrierStatus), timeline, ...statusTimestamp(nextStatus) } : { timeline }),
        updated_at: new Date().toISOString()
      };

      const updated = await supabase
        .from("shipments")
        .update(update)
        .eq("tracking_id", currentShipment.tracking_id)
        .select("*")
        .maybeSingle();

      if (updated.error) throw updated.error;
      if (updated.data && nextStatus === "IN_TRANSIT" && currentShipment.status !== "IN_TRANSIT") {
        await sendShipmentLifecycleEmail(supabase, updated.data as ShipmentRecord, "in_transit", request);
      }
      if (updated.data && nextStatus === "DELIVERED" && currentShipment.status !== "DELIVERED") {
        await sendShipmentLifecycleEmail(supabase, updated.data as ShipmentRecord, "delivered", request);
      }
    }

    await writeOperationalEvent(supabase, {
      category: "shipment",
      severity: matchedTrackingId ? "info" : "warning",
      message: matchedTrackingId ? "Sendbox webhook processed and shipment updated." : "Sendbox webhook received without a matching shipment.",
      entityType: "shipment",
      entityId: matchedTrackingId ?? event.flyTrackingId ?? event.carrierShipmentId ?? event.carrierTrackingId,
      metadata: {
        provider: "sendbox",
        eventType: event.eventType,
        normalizedEvent: event.normalizedEvent,
        carrierStatus: event.carrierStatus,
        mappedStatus: nextStatus,
        matched: Boolean(matchedTrackingId),
        flyTrackingId: event.flyTrackingId,
        carrierShipmentId: event.carrierShipmentId,
        carrierTrackingId: event.carrierTrackingId,
        payload: body
      },
      request
    });

    return NextResponse.json({ ok: true, matched: Boolean(matchedTrackingId), trackingId: matchedTrackingId, webhook: "sendbox" });
  } catch (error) {
    logApiError(error, "Unable to process Sendbox webhook.", requestContext(request, {
      eventType: event.eventType,
      normalizedEvent: event.normalizedEvent,
      flyTrackingId: event.flyTrackingId,
      carrierShipmentId: event.carrierShipmentId,
      carrierTrackingId: event.carrierTrackingId
    }));

    await writeOperationalEvent(supabase, {
      category: "shipment",
      severity: "error",
      message: "Sendbox webhook processing failed.",
      entityType: "shipment",
      entityId: event.flyTrackingId ?? event.carrierShipmentId ?? event.carrierTrackingId,
      metadata: {
        provider: "sendbox",
        eventType: event.eventType,
        normalizedEvent: event.normalizedEvent,
        carrierStatus: event.carrierStatus,
        error: error instanceof Error ? error.message : "Unknown webhook error"
      },
      request
    });

    return NextResponse.json({ error: "Unable to process Sendbox webhook." }, { status: 500 });
  }
}
