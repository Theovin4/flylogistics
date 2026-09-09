import { createHmac, timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { cleanEnv } from "@/lib/env";
import { whatsappMessages } from "@/lib/whatsapp";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { isCloudBillingReference, processCloudBillingWebhook } from "@/server/cloud-billing";
import { verifyAndPersistFlutterwavePayment } from "@/server/payments/flutterwave";
import { logError, logInfo, logWarn, requestContext } from "@/server/monitoring";
import { sendCustomerNotification, smsMessages } from "@/server/notifications/service";
import { getCustomerNotificationPreferences } from "@/server/notifications/preferences";
import { writeOperationalEvent } from "@/server/operational-events";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type FlutterwaveWebhookPayload = {
  id?: string;
  type?: string;
  event?: string;
  data?: {
    id?: string | number;
    tx_ref?: string;
    reference?: string;
    status?: string;
    amount?: number | string;
    currency?: string;
    customer?: {
      id?: string | number;
      email?: string | null;
    };
    subscription_id?: string | number | null;
    subscription?: {
      id?: string | number | null;
      status?: string | null;
    } | null;
  };
};

function getWebhookSecret() {
  return cleanEnv(process.env.FLUTTERWAVE_WEBHOOK_SECRET_HASH) ?? cleanEnv(process.env.WEBHOOK_SECRET);
}

function secureCompare(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function isValidSignature(rawBody: string, signature: string | null, secret: string | undefined) {
  if (!secret) return process.env.NODE_ENV !== "production";
  if (!signature) return false;

  const expectedHmac = createHmac("sha256", secret).update(rawBody).digest("base64");
  if (secureCompare(expectedHmac, signature)) return true;

  // Supports older Flutterwave dashboards that send the plain secret hash.
  return secureCompare(secret, signature);
}

function transactionInput(payload: FlutterwaveWebhookPayload) {
  const data = payload.data ?? {};
  return {
    transactionId: data.id === undefined || data.id === null ? undefined : String(data.id),
    txRef: data.tx_ref ?? data.reference,
    callbackStatus: data.status
  };
}

function cloudBillingWebhookInput(payload: FlutterwaveWebhookPayload) {
  const data = payload.data ?? {};
  return {
    eventType: payload.type ?? payload.event,
    transactionId: data.id === undefined || data.id === null ? undefined : String(data.id),
    txRef: data.tx_ref ?? data.reference,
    callbackStatus: data.subscription?.status ?? data.status,
    amount: data.amount,
    currency: data.currency,
    flutterwaveCustomerId: data.customer?.id,
    flutterwaveSubscriptionId: data.subscription_id ?? data.subscription?.id
  };
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("flutterwave-signature") ?? request.headers.get("verif-hash");
  const secret = getWebhookSecret();

  if (!isValidSignature(rawBody, signature, secret)) {
    logWarn("Rejected Flutterwave webhook with invalid signature.", requestContext(request));
    return NextResponse.json({ error: "Invalid Flutterwave webhook signature." }, { status: 401 });
  }

  let payload: FlutterwaveWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as FlutterwaveWebhookPayload;
  } catch (error) {
    logError(error, "Invalid Flutterwave webhook JSON.", requestContext(request));
    return NextResponse.json({ error: "Invalid webhook payload." }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Payment webhook storage is temporarily unavailable." }, { status: 503 });
  }

  try {
    const cloudInput = cloudBillingWebhookInput(payload);
    if (isCloudBillingReference(cloudInput.txRef) || cloudInput.flutterwaveSubscriptionId) {
      const cloudResult = await processCloudBillingWebhook(supabase, cloudInput);
      if (cloudResult.handled) {
        logInfo("Processed Flutterwave Cloud billing webhook.", requestContext(request, { eventId: payload.id, eventType: payload.type ?? payload.event, result: cloudResult }));
        return NextResponse.json({ received: true, result: cloudResult }, { status: 200 });
      }
    }

    const result = await verifyAndPersistFlutterwavePayment(supabase, transactionInput(payload));
    let customerNotification: { ok: boolean; provider: string; mode: string } | null = null;
    if (result.ok && result.requestId && !result.message.toLowerCase().includes("already")) {
      const { data: quote, error: quoteError } = await supabase
        .from("quote_requests")
        .select("*")
        .eq("request_id", result.requestId)
        .maybeSingle();

      if (quoteError) {
        logError(quoteError, "Payment webhook verified but quote lookup for WhatsApp confirmation failed.", requestContext(request, { requestId: result.requestId }));
      } else if (quote?.customer_phone || quote?.customer_email) {
        const preferences = await getCustomerNotificationPreferences(supabase, quote.customer_email);
        const notification = await sendCustomerNotification({
          to: quote.customer_phone,
          message: whatsappMessages.paymentConfirmation(quote),
          workflow: "payment_confirmation",
          entityType: "quote_request",
          entityId: result.requestId,
          metadata: { txRef: result.txRef, amount: result.amount, provider: "flutterwave", source: "webhook" },
          smsFallback: true,
          smsMessage: smsMessages.paymentConfirmed(result.requestId),
          preferences
        });
        customerNotification = {
          ok: notification.ok,
          provider: notification.results.whatsapp?.provider ?? notification.results.sms?.provider ?? "multi_channel",
          mode: notification.results.whatsapp?.mode ?? notification.results.sms?.mode ?? "failed"
        };
      }
    }
    await writeOperationalEvent(supabase, {
      category: "payment",
      severity: result.ok ? "info" : "warning",
      message: "Processed Flutterwave webhook payment event.",
      entityType: "quote_request",
      entityId: result.requestId ?? payload.data?.tx_ref,
      metadata: { eventId: payload.id, eventType: payload.type ?? payload.event, status: result.status, txRef: result.txRef, customerNotification },
      request
    });
    logInfo("Processed Flutterwave webhook.", requestContext(request, { eventId: payload.id, eventType: payload.type ?? payload.event, result }));
    return NextResponse.json({ received: true, result }, { status: 200 });
  } catch (error) {
    logError(error, "Unable to process Flutterwave webhook.", requestContext(request, { eventId: payload.id, eventType: payload.type ?? payload.event }));
    return NextResponse.json({ error: "Unable to process Flutterwave webhook." }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ ok: true, webhook: "flutterwave" });
}
