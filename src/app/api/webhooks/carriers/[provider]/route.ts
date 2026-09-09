import { NextResponse } from "next/server";
import { cleanEnv } from "@/lib/env";
import { normalizeCarrierProvider } from "@/lib/carriers";
import { appendTimelineEvent } from "@/lib/shipment-data";
import type { ShipmentRecord, ShipmentStatus } from "@/lib/shipments";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { customerTrackingMessageForCarrierStatus, makeFlyTrackingTimelineEvent, mapCarrierStatusToFlyStatus } from "@/lib/tracking-status";
import { enforceRateLimit, MAX_JSON_BODY_BYTES } from "@/server/api";
import { logApiError, logWarn, requestContext } from "@/server/monitoring";
import { writeOperationalEvent } from "@/server/operational-events";
import { verifySharedWebhookSecret } from "@/server/webhook-security";

export const runtime = "nodejs";

type JsonRecord = Record<string, unknown>;

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

function statusTimestamp(status: ShipmentStatus | null) {
  const now = new Date().toISOString();
  switch (status) {
    case "PICKED_UP":
      return { picked_up_at: now };
    case "IN_TRANSIT":
      return { in_transit_at: now };
    case "ARRIVED":
      return { arrived_at: now };
    case "DELIVERED":
      return { delivered_at: now };
    case "CANCELLED":
      return { failed_at: now, failed_reason: "Shipment cancelled by fulfilment update." };
    default:
      return {};
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  const limited = await enforceRateLimit(request, "carrier-webhook", { limit: 120, windowSeconds: 60 });
  if (limited) return limited;

  const { provider: providerParam } = await params;
  const provider = normalizeCarrierProvider(providerParam);
  const webhookSecret = cleanEnv(process.env.CARRIER_WEBHOOK_SECRET) ?? cleanEnv(process.env.WEBHOOK_SECRET);
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_JSON_BODY_BYTES) {
    logWarn("Rejected oversized carrier webhook payload.", requestContext(request, { provider, contentLength, maxBytes: MAX_JSON_BODY_BYTES }));
    return NextResponse.json({ error: "Webhook payload is too large." }, { status: 413 });
  }

  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody, "utf8") > MAX_JSON_BODY_BYTES) {
    logWarn("Rejected oversized carrier webhook body.", requestContext(request, { provider, maxBytes: MAX_JSON_BODY_BYTES }));
    return NextResponse.json({ error: "Webhook payload is too large." }, { status: 413 });
  }

  const verification = verifySharedWebhookSecret({
    request,
    rawBody,
    secret: webhookSecret,
    providerName: "Carrier"
  });
  if (!verification.ok) {
    logWarn("Rejected carrier webhook.", requestContext(request, { provider, reason: verification.error }));
    return NextResponse.json({ error: verification.error }, { status: verification.status ?? 401 });
  }

  let body: unknown = {};
  try {
    body = rawBody ? JSON.parse(rawBody) as unknown : {};
  } catch {
    logWarn("Rejected carrier webhook with invalid JSON.", requestContext(request, { provider }));
    return NextResponse.json({ error: "Invalid carrier webhook payload." }, { status: 400 });
  }
  const root = asRecord(body);
  const data = nested(root, "data") ?? nested(root, "shipment") ?? root;
  const metadata = nested(data, "metadata");
  const status = stringAt(data, ["status", "status_code", "tracking_status", "shipment_state"]) ??
    stringAt(nested(data, "current_status"), ["code", "name"]) ??
    stringAt(nested(data, "status"), ["code", "name"]);
  const flyTrackingId = stringAt(metadata, ["fly_tracking_id"]) ?? stringAt(data, ["fly_tracking_id", "tracking_id", "trackingId", "platform_order_number"]);
  const carrierShipmentId = stringAt(data, ["easyship_shipment_id", "shipment_id", "id", "_id"]);
  const carrierTrackingId = stringAt(data, ["code", "tracking_number", "tracking_code", "carrier_tracking_id"]);

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: true, queued: false });

  let updatedTrackingId: string | null = null;
  if (flyTrackingId || carrierShipmentId || carrierTrackingId) {
    let findQuery = supabase.from("shipments").select("*");
    if (flyTrackingId) findQuery = findQuery.eq("tracking_id", flyTrackingId.toUpperCase());
    else if (carrierShipmentId) findQuery = findQuery.eq("carrier_shipment_id", carrierShipmentId);
    else if (carrierTrackingId) findQuery = findQuery.eq("carrier_tracking_id", carrierTrackingId);

    const found = await findQuery.maybeSingle();
    const currentShipment = found.data as ShipmentRecord | null;
    const mappedStatus = mapCarrierStatusToFlyStatus(status);
    const timeline = currentShipment
      ? appendTimelineEvent(
          currentShipment.timeline,
          makeFlyTrackingTimelineEvent(mappedStatus, currentShipment.delivery_address, status)
        )
      : undefined;
    const updatePayload = {
      carrier_provider: provider,
      carrier_status: status ?? "webhook_received",
      ...(carrierTrackingId ? { carrier_tracking_id: carrierTrackingId } : {}),
      carrier_raw_response: body ?? {},
      ...(timeline ? { timeline } : {}),
      ...(mappedStatus ? {
        status: mappedStatus,
        customer_status_message: customerTrackingMessageForCarrierStatus(mappedStatus, status),
        ...statusTimestamp(mappedStatus)
      } : {}),
      updated_at: new Date().toISOString()
    };
    const { data: shipment, error } = found.error || !currentShipment
      ? { data: null, error: found.error }
      : await supabase
          .from("shipments")
          .update(updatePayload)
          .eq("tracking_id", currentShipment.tracking_id)
          .select("tracking_id")
          .maybeSingle();
    if (error) {
      logApiError(error, "Unable to process carrier webhook.", requestContext(request, { provider, flyTrackingId, carrierShipmentId, carrierTrackingId }));
    }
    updatedTrackingId = typeof shipment?.tracking_id === "string" ? shipment.tracking_id : null;
  }

  await writeOperationalEvent(supabase, {
    category: "shipment",
    severity: updatedTrackingId ? "info" : "warning",
    message: updatedTrackingId ? "Carrier webhook processed." : "Carrier webhook received without a matching shipment.",
    entityType: "shipment",
    entityId: updatedTrackingId ?? flyTrackingId ?? carrierShipmentId ?? carrierTrackingId,
    metadata: { provider, status, matched: Boolean(updatedTrackingId) },
    request
  });

  return NextResponse.json({ ok: true, matched: Boolean(updatedTrackingId) });
}
