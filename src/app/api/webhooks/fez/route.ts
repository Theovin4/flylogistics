import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { cleanEnv } from "@/lib/env";
import { appendTimelineEvent } from "@/lib/shipment-data";
import type { ShipmentRecord, ShipmentStatus } from "@/lib/shipments";
import { customerTrackingMessageForCarrierStatus, makeFlyTrackingTimelineEvent, mapCarrierStatusToFlyStatus } from "@/lib/tracking-status";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { updateShipmentCarrierFields } from "@/server/carrier-storage";
import { logApiError, logInfo, logWarn, requestContext } from "@/server/monitoring";
import { writeOperationalEvent } from "@/server/operational-events";
import { sendShipmentLifecycleEmail } from "@/server/shipment-emails";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : null;
}

function stringField(record: JsonRecord | null, key: string) {
  const value = record?.[key];
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number") return String(value);
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

function verifyFezRequest(request: Request, rawBody: string) {
  const secret = cleanEnv(process.env.FEZ_WEBHOOK_SECRET) ?? cleanEnv(process.env.CARRIER_WEBHOOK_SECRET);
  if (!secret) {
    return process.env.NODE_ENV === "production"
      ? { ok: false, status: 503, error: "FEZ webhook secret is not configured." }
      : { ok: true };
  }

  const url = new URL(request.url);
  const sharedSecret =
    request.headers.get("x-fez-webhook-secret") ??
    request.headers.get("x-fly-webhook-secret") ??
    request.headers.get("x-webhook-secret") ??
    bearerValue(request.headers.get("authorization")) ??
    url.searchParams.get("secret") ??
    url.searchParams.get("token");

  if (safeEqual(sharedSecret, secret)) return { ok: true };

  const providedSignature =
    request.headers.get("x-fez-signature") ??
    request.headers.get("x-fez-signature-256") ??
    request.headers.get("x-hub-signature-256");
  const normalizedSignature = providedSignature?.replace(/^sha256=/i, "").trim();
  if (safeEqual(normalizedSignature, signatureDigest(rawBody, secret))) return { ok: true };

  return { ok: false, status: 401, error: "Invalid FEZ webhook signature." };
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
      return { failed_at: now, failed_reason: "Carrier cancelled shipment." };
    default:
      return {};
  }
}

async function findFezShipment(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  orderNumber: string
) {
  for (const column of ["carrier_order_id", "carrier_order_no", "carrier_tracking_id", "carrier_waybill_no", "carrier_shipment_id"]) {
    const result = await supabase
      .from("shipments")
      .select("*")
      .eq("carrier_provider", "fez_logistics")
      .eq(column, orderNumber)
      .maybeSingle();
    if (result.data) return result;
    if (result.error && !["42703", "PGRST204"].includes(result.error.code ?? "")) return result;
  }

  return { data: null, error: null };
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const verification = verifyFezRequest(request, rawBody);
  if (!verification.ok) {
    logWarn("Rejected FEZ webhook.", requestContext(request, { reason: verification.error }));
    return NextResponse.json({ error: verification.error }, { status: verification.status ?? 401 });
  }

  let body: unknown = null;
  try {
    body = rawBody ? JSON.parse(rawBody) : null;
  } catch {
    logWarn("Rejected FEZ webhook with invalid JSON.", requestContext(request));
    return NextResponse.json({ error: "Invalid FEZ webhook payload." }, { status: 400 });
  }
  const payload = asRecord(body);
  const orderNumber = stringField(payload, "orderNumber");
  const status = stringField(payload, "status");

  if (!orderNumber || !status) {
    logWarn("Rejected FEZ webhook with missing required fields.", requestContext(request, {
      hasOrderNumber: Boolean(orderNumber),
      hasStatus: Boolean(status)
    }));
    return NextResponse.json({ error: "FEZ webhook requires orderNumber and status." }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const mappedStatus = mapCarrierStatusToFlyStatus(status);

  logInfo("Received FEZ webhook.", requestContext(request, {
    orderNumber,
    status,
    mappedStatus
  }));

  if (!supabase) {
    return NextResponse.json({ ok: true, matched: false, stored: false, webhook: "fez_logistics" });
  }

  try {
    const { data: shipment, error } = await findFezShipment(supabase, orderNumber);
    if (error) throw error;

    let matchedTrackingId: string | null = null;

    if (shipment) {
      const currentShipment = shipment as ShipmentRecord;
      matchedTrackingId = currentShipment.tracking_id;
      const timeline = appendTimelineEvent(
        currentShipment.timeline,
        makeFlyTrackingTimelineEvent(mappedStatus, currentShipment.delivery_address, status)
      );
      const now = new Date().toISOString();

      const update = {
        carrier: "fez",
        carrier_provider: "fez_logistics",
        carrier_order_id: orderNumber,
        carrier_order_no: orderNumber,
        carrier_tracking_id: currentShipment.carrier_tracking_id ?? orderNumber,
        carrier_waybill_no: currentShipment.carrier_waybill_no ?? currentShipment.carrier_tracking_id ?? orderNumber,
        carrier_status: status,
        carrier_response: { orderNumber, status },
        carrier_error: null,
        carrier_raw_response: { orderNumber, status },
        carrier_synced_at: now,
        external_tracking_enabled: false,
        ...(mappedStatus ? { status: mappedStatus, customer_status_message: customerTrackingMessageForCarrierStatus(mappedStatus, status), timeline, ...statusTimestamp(mappedStatus) } : { timeline }),
        updated_at: now
      };

      const updated = await updateShipmentCarrierFields(supabase, currentShipment.tracking_id, update);
      if (updated.error) throw updated.error;
      if (updated.data && mappedStatus === "IN_TRANSIT" && currentShipment.status !== "IN_TRANSIT") {
        await sendShipmentLifecycleEmail(supabase, updated.data, "in_transit", request);
      }
      if (updated.data && mappedStatus === "DELIVERED" && currentShipment.status !== "DELIVERED") {
        await sendShipmentLifecycleEmail(supabase, updated.data, "delivered", request);
      }
    }

    await writeOperationalEvent(supabase, {
      category: "shipment",
      severity: matchedTrackingId ? "info" : "warning",
      message: matchedTrackingId ? "FEZ webhook processed and shipment updated." : "FEZ webhook received without a matching shipment.",
      entityType: "shipment",
      entityId: matchedTrackingId ?? orderNumber,
      metadata: {
        provider: "fez_logistics",
        orderNumber,
        carrierStatus: status,
        mappedStatus,
        matched: Boolean(matchedTrackingId),
        payload: { orderNumber, status }
      },
      request
    });

    return NextResponse.json({ ok: true, matched: Boolean(matchedTrackingId), webhook: "fez_logistics" });
  } catch (error) {
    logApiError(error, "Unable to process FEZ webhook.", requestContext(request, { orderNumber, status, mappedStatus }));

    await writeOperationalEvent(supabase, {
      category: "shipment",
      severity: "error",
      message: "FEZ webhook processing failed.",
      entityType: "shipment",
      entityId: orderNumber,
      metadata: {
        provider: "fez_logistics",
        orderNumber,
        carrierStatus: status,
        mappedStatus,
        error: error instanceof Error ? error.message : "Unknown webhook error"
      },
      request
    });

    return NextResponse.json({ error: "Unable to process FEZ webhook." }, { status: 500 });
  }
}
