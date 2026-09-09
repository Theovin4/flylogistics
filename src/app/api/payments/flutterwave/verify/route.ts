import { NextResponse } from "next/server";
import { z } from "zod";
import { whatsappMessages } from "@/lib/whatsapp";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { recoverFlutterwavePaymentResult, verifyAndPersistFlutterwavePayment } from "@/server/payments/flutterwave";
import { enforceRateLimit, parseJson } from "@/server/api";
import { logPaymentError, requestContext } from "@/server/monitoring";
import { sendCustomerNotification, smsMessages } from "@/server/notifications/service";
import { getCustomerNotificationPreferences } from "@/server/notifications/preferences";
import { writeOperationalEvent } from "@/server/operational-events";
import { isWalletFundingReference, verifyAndCreditWalletPayment } from "@/server/wallets";

export const dynamic = "force-dynamic";

const verifySchema = z.object({
  transaction_id: z.string().trim().optional(),
  transactionId: z.string().trim().optional(),
  tx_ref: z.string().trim().optional(),
  txRef: z.string().trim().optional(),
  requestId: z.string().trim().optional(),
  status: z.string().trim().optional(),
  callbackStatus: z.string().trim().optional()
});

function readSearchParams(request: Request) {
  const params = new URL(request.url).searchParams;
  return {
    transactionId: params.get("transaction_id") ?? params.get("transactionId"),
    txRef: params.get("tx_ref"),
    requestId: params.get("requestId"),
    callbackStatus: params.get("status")
  };
}

async function verifyPayment(input: {
  transactionId?: string | null;
  txRef?: string | null;
  requestId?: string | null;
  callbackStatus?: string | null;
}, request: Request) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Payment verification is temporarily unavailable." }, { status: 503 });
  }

  try {
    if (isWalletFundingReference(input.txRef)) {
      const walletResult = await verifyAndCreditWalletPayment(supabase, {
        transactionId: input.transactionId,
        txRef: input.txRef,
        callbackStatus: input.callbackStatus
      });
      await writeOperationalEvent(supabase, {
        category: "payment",
        severity: walletResult.ok ? "info" : "warning",
        message: walletResult.ok ? "Wallet funding verified successfully." : "Wallet funding verification did not pass.",
        entityType: "customer_wallet",
        entityId: walletResult.reference ?? input.txRef,
        metadata: { status: walletResult.status, amount: walletResult.amount, currency: walletResult.currency, provider: "flutterwave" },
        request
      });
      return NextResponse.json(walletResult, { status: walletResult.ok ? 200 : 400 });
    }

    const result = await verifyAndPersistFlutterwavePayment(supabase, input);
    let customerNotification: { ok: boolean; provider: string; mode: string } | null = null;
    if (result.ok && result.requestId && !result.message.toLowerCase().includes("already")) {
      const { data: quote, error: quoteError } = await supabase
        .from("quote_requests")
        .select("*")
        .eq("request_id", result.requestId)
        .maybeSingle();

      if (quoteError) {
        logPaymentError(quoteError, "Payment verified but quote lookup for WhatsApp confirmation failed.", requestContext(request, { requestId: result.requestId }));
      } else if (quote?.customer_phone || quote?.customer_email) {
        const preferences = await getCustomerNotificationPreferences(supabase, quote.customer_email);
        const notification = await sendCustomerNotification({
          to: quote.customer_phone,
          message: whatsappMessages.paymentConfirmation(quote),
          workflow: "payment_confirmation",
          entityType: "quote_request",
          entityId: result.requestId,
          metadata: { txRef: result.txRef, amount: result.amount, provider: "flutterwave" },
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
      message: result.ok ? "Payment verified successfully." : "Payment verification did not pass.",
      entityType: "quote_request",
      entityId: result.requestId ?? input.requestId ?? input.txRef,
      metadata: { status: result.status, txRef: result.txRef ?? input.txRef, amount: result.amount, currency: result.currency, customerNotification },
      request
    });
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  } catch (err) {
    logPaymentError(err, "Unable to verify Flutterwave payment.", requestContext(request, { txRef: input.txRef, requestId: input.requestId }));
    const recovered = await recoverFlutterwavePaymentResult(
      supabase,
      input,
      "Payment verified successfully. The shipment was recovered and is ready to track."
    );
    if (recovered) {
      await writeOperationalEvent(supabase, {
        category: "payment",
        severity: "info",
        message: "Payment verification recovered after downstream fulfilment/logging error.",
        entityType: "quote_request",
        entityId: recovered.requestId ?? input.requestId ?? input.txRef,
        metadata: { status: recovered.status, txRef: recovered.txRef ?? input.txRef, trackingId: recovered.trackingId, amount: recovered.amount },
        request
      });
      return NextResponse.json(recovered);
    }
    const message = err instanceof Error ? err.message : "Unable to verify payment.";
    return NextResponse.json({ error: message }, { status: message.includes("temporarily unavailable") ? 503 : 500 });
  }
}

export async function GET(request: Request) {
  const limited = await enforceRateLimit(request, "flutterwave-verify", { limit: 40, windowSeconds: 60 });
  if (limited) return limited;

  return verifyPayment(readSearchParams(request), request);
}

export async function POST(request: Request) {
  const limited = await enforceRateLimit(request, "flutterwave-verify", { limit: 40, windowSeconds: 60 });
  if (limited) return limited;

  const parsed = await parseJson(request, verifySchema, "Invalid payment verification payload.");
  if (parsed.response) return parsed.response;
  const body = parsed.data;

  return verifyPayment(
    {
      transactionId: body.transaction_id ?? body.transactionId,
      txRef: body.tx_ref ?? body.txRef,
      requestId: body.requestId,
      callbackStatus: body.status ?? body.callbackStatus
    },
    request
  );
}
