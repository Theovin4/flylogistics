import { cleanEnv } from "@/lib/env";
import { canonicalSiteUrl, siteConfig } from "@/lib/site";
import type { QuoteRequestRecord, ShipmentRecord } from "@/lib/shipments";
import type { getSupabaseAdmin } from "@/lib/supabase-server";
import { whatsappMessages } from "@/lib/whatsapp";
import { notifyAdmin } from "@/server/admin-notifications";
import { writeAuditLog } from "@/server/audit";
import { logPaymentError } from "@/server/monitoring";
import { getCustomerNotificationPreferences } from "@/server/notifications/preferences";
import { sendCustomerNotification, smsMessages } from "@/server/notifications/service";
import { nextQuoteHistory, quoteAmount, updateQuoteWithWorkflowFallback, writeQuoteStatusEvent } from "@/server/quote-workflow";
import { autoCreateShipmentFromPaidQuote } from "@/server/quote-to-shipment";

type SupabaseAdminClient = NonNullable<ReturnType<typeof getSupabaseAdmin>>;

const FLUTTERWAVE_API_URL = "https://api.flutterwave.com/v3";

export const FLUTTERWAVE_PAYMENT_PROVIDER = "flutterwave";
export const DEFAULT_PAYMENT_STATUS = "UNPAID";

export type PaymentStatus = "UNPAID" | "PENDING" | "PAID" | "FAILED" | "CANCELLED";

type FlutterwaveResponse<T> = {
  status?: string;
  message?: string;
  data?: T;
};

type FlutterwaveCheckoutData = {
  link?: string;
};

type FlutterwaveTransactionData = {
  id?: number;
  tx_ref?: string;
  flw_ref?: string;
  status?: string;
  amount?: number | string;
  currency?: string;
  customer?: {
    id?: string | number;
    email?: string | null;
    name?: string | null;
  } | null;
  subscription_id?: string | number | null;
  subscription?: {
    id?: string | number;
    status?: string | null;
  } | null;
  plan?: string | number | { id?: string | number; name?: string | null } | null;
};

type PaymentQuote = QuoteRequestRecord & {
  payment_status?: string | null;
  payment_reference?: string | null;
  payment_amount?: number | string | null;
  payment_provider?: string | null;
};

type CreateCheckoutInput = {
  txRef: string;
  amount: number;
  currency?: string;
  redirectUrl: string;
  customer: {
    email: string;
    name: string;
    phone?: string | null;
  };
  description: string;
  paymentPurpose?: "wallet" | "shipment" | "quote" | "merchant";
  paymentPlanId?: string | null;
  metadata?: Record<string, unknown>;
};

type VerifyAndPersistInput = {
  transactionId?: string | null;
  txRef?: string | null;
  requestId?: string | null;
  callbackStatus?: string | null;
};

export type PaymentResult = {
  ok: boolean;
  status: PaymentStatus;
  message: string;
  requestId?: string;
  trackingId?: string;
  txRef?: string;
  amount?: number;
  currency?: string;
};

function getFlutterwaveSecretKey() {
  const secretKey = cleanEnv(process.env.FLUTTERWAVE_SECRET_KEY);
  if (!secretKey) {
    throw new Error("Secure checkout is temporarily unavailable.");
  }
  return secretKey;
}

function getFlyLogisticsSubaccountId() {
  return cleanEnv(process.env.FLUTTERWAVE_SUBACCOUNT_ID) ?? cleanEnv(process.env.FLUTTERWAVE_FLY_LOGISTICS_SUBACCOUNT_ID);
}

function normalizeTxRef(value: string | null | undefined) {
  return value?.trim() || undefined;
}

function parseRequestIdFromTxRef(txRef: string | undefined) {
  const match = txRef?.match(/^FLY-QUOTE-(REQ-[A-Z0-9]+)-\d+$/) ?? txRef?.match(/^FLW-(REQ-[A-Z0-9]+)-\d+$/);
  return match?.[1];
}

function normalizeAmount(value: number | string | null | undefined) {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? amount : 0;
}

function paymentLogoUrl() {
  return `${canonicalSiteUrl}/icons/meta-app-icon-1024.png`;
}

async function readFlutterwaveResponse<T>(response: Response) {
  const payload = (await response.json().catch(() => null)) as FlutterwaveResponse<T> | null;

  if (!response.ok) {
    throw new Error(payload?.message ?? "Secure checkout request failed.");
  }

  return payload ?? {};
}

export function makeFlutterwaveReference(requestId: string) {
  return `FLY-QUOTE-${requestId.trim().toUpperCase()}-${Date.now()}`;
}

export function makeFlutterwaveBatchReference() {
  return `FLY-SHIPMENT-BATCH-${Date.now()}`;
}

function isFlutterwaveBatchReference(txRef: string | undefined) {
  return /^FLY-SHIPMENT-BATCH-\d+$/i.test(String(txRef ?? ""));
}

export async function createFlutterwaveCheckout(input: CreateCheckoutInput) {
  if (input.amount <= 0) {
    throw new Error("Payment amount must be greater than zero.");
  }

  const subaccountId = getFlyLogisticsSubaccountId();
  const purposeTitle =
    input.paymentPurpose === "wallet"
      ? "Fly Logistics Wallet"
      : input.paymentPurpose === "merchant"
        ? "Fly Logistics Merchant Payment"
        : "Fly Logistics Shipment Payment";
  const checkoutPayload: Record<string, unknown> = {
    tx_ref: input.txRef,
    amount: input.amount,
    currency: input.currency ?? "NGN",
    redirect_url: input.redirectUrl,
    customer: {
      email: input.customer.email,
      name: input.customer.name,
      phonenumber: input.customer.phone ?? undefined
    },
    customizations: {
      title: purposeTitle,
      description: input.description,
      logo: paymentLogoUrl()
    },
    meta: {
      brand: "Fly Logistics",
      brand_color: "#ff7a00",
      payment_destination: "fly_logistics_subaccount",
      payment_purpose: input.paymentPurpose ?? "shipment",
      ...(input.metadata ?? {})
    }
  };

  if (input.paymentPlanId) {
    checkoutPayload.payment_plan = input.paymentPlanId;
  }

  if (subaccountId) {
    checkoutPayload.subaccounts = [
      {
        id: subaccountId
      }
    ];
  }

  const response = await fetch(`${FLUTTERWAVE_API_URL}/payments`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getFlutterwaveSecretKey()}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(checkoutPayload)
  });

  const paymentResponse = await readFlutterwaveResponse<FlutterwaveCheckoutData>(response);

  if (paymentResponse.status !== "success" || !paymentResponse.data?.link) {
    throw new Error(paymentResponse.message ?? "Unable to create secure checkout.");
  }

  return {
    checkoutUrl: paymentResponse.data.link,
    txRef: input.txRef,
    amount: input.amount,
    currency: input.currency ?? "NGN"
  };
}

async function recoverShipmentForPaymentReference(supabase: SupabaseAdminClient, paymentReference?: string | null) {
  if (!paymentReference) return null;
  const { data, error } = await supabase
    .from("shipments")
    .select("*")
    .eq("payment_reference", paymentReference)
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) {
    logPaymentError(error, "Unable to recover shipment after automatic shipment creation threw.", { txRef: paymentReference });
    return null;
  }
  return data?.[0] ?? null;
}

function paymentResultFromShipment(
  shipment: ShipmentRecord,
  input: {
    message?: string;
    requestId?: string | null;
    txRef?: string | null;
    amount?: number | null;
    currency?: string | null;
  } = {}
): PaymentResult {
  const amount = normalizeAmount(input.amount ?? shipment.payment_amount ?? shipment.quoted_price);
  const carrierNeedsReview = /failed|error/i.test(String(shipment.carrier_status ?? shipment.carrier_error ?? ""));
  return {
    ok: true,
    status: "PAID",
    message: input.message ?? (carrierNeedsReview
      ? `Order placed successfully. Your Fly Logistics tracking number is ${shipment.tracking_id}. Our operations team is processing your shipment.`
      : `Order placed successfully. Your Fly Logistics tracking number is ${shipment.tracking_id}. You can track your order anytime on Fly Logistics.`),
    requestId: input.requestId ?? undefined,
    trackingId: shipment.tracking_id,
    txRef: normalizeTxRef(input.txRef ?? shipment.payment_reference),
    amount,
    currency: input.currency ?? "NGN"
  };
}

async function safeAutoCreateShipmentFromPaidQuote(
  supabase: SupabaseAdminClient,
  quote: QuoteRequestRecord,
  options: Parameters<typeof autoCreateShipmentFromPaidQuote>[2]
): Promise<Awaited<ReturnType<typeof autoCreateShipmentFromPaidQuote>>> {
  try {
    return await autoCreateShipmentFromPaidQuote(supabase, quote, options);
  } catch (error) {
    logPaymentError(error, "Payment was verified but automatic shipment creation threw; keeping payment successful and leaving fulfilment retryable.", {
      requestId: quote.request_id,
      txRef: quote.payment_reference
    });

    const recovered = await recoverShipmentForPaymentReference(supabase, quote.payment_reference);
    return {
      shipment: recovered,
      created: false,
      error,
      skippedReason: recovered ? "Recovered existing shipment after automatic creation error." : null
    } as Awaited<ReturnType<typeof autoCreateShipmentFromPaidQuote>>;
  }
}

export async function recoverFlutterwavePaymentResult(
  supabase: SupabaseAdminClient,
  input: VerifyAndPersistInput,
  message = "Payment verified successfully. Your shipment has been recovered and is ready to track."
): Promise<PaymentResult | null> {
  const txRef = normalizeTxRef(input.txRef);
  const requestId = input.requestId?.trim().toUpperCase();
  let verifiedTxRef = txRef;
  let verifiedAmount: number | null = null;
  let verifiedCurrency: string | null = null;

  if (input.transactionId) {
    const transaction = await verifyFlutterwaveTransaction(input.transactionId).catch((error) => {
      logPaymentError(error, "Payment recovery could not re-verify Flutterwave transaction.", { txRef, requestId });
      return null;
    });
    if (transaction?.status === "successful") {
      verifiedTxRef = normalizeTxRef(transaction.tx_ref) ?? txRef;
      verifiedAmount = normalizeAmount(transaction.amount);
      verifiedCurrency = transaction.currency ?? "NGN";
    }
  }

  const quote = await findQuoteForPayment(supabase, verifiedTxRef, requestId).catch((error) => {
    logPaymentError(error, "Payment recovery could not load quote request.", { txRef: verifiedTxRef, requestId });
    return null;
  });

  const shipmentByPaymentReference = await recoverShipmentForPaymentReference(supabase, verifiedTxRef ?? quote?.payment_reference);
  if (shipmentByPaymentReference) {
    return paymentResultFromShipment(shipmentByPaymentReference as ShipmentRecord, {
      message,
      requestId: quote?.request_id ?? requestId,
      txRef: verifiedTxRef ?? quote?.payment_reference,
      amount: verifiedAmount,
      currency: verifiedCurrency
    });
  }

  if (quote?.payment_status === "PAID") {
    const shipment = await safeAutoCreateShipmentFromPaidQuote(supabase, quote, {
      note: "Recovered paid booking during payment confirmation."
    });
    if (shipment.shipment) {
      return paymentResultFromShipment(shipment.shipment, {
        message,
        requestId: quote.request_id,
        txRef: verifiedTxRef ?? quote.payment_reference,
        amount: verifiedAmount ?? normalizeAmount(quote.payment_amount ?? quote.quoted_price ?? quote.estimated_price),
        currency: verifiedCurrency
      });
    }
  }

  return null;
}

async function notifyCustomerPaymentConfirmed(supabase: SupabaseAdminClient, quote: PaymentQuote, txRef: string, amount: number) {
  if (!quote.customer_phone && !quote.customer_email) return null;

  try {
    const preferences = await getCustomerNotificationPreferences(supabase, quote.customer_email);
    const result = await sendCustomerNotification({
      to: quote.customer_phone,
      emailTo: quote.customer_email,
      message: whatsappMessages.paymentConfirmation({
        ...quote,
        payment_amount: amount,
        payment_reference: txRef,
        payment_provider: FLUTTERWAVE_PAYMENT_PROVIDER
      }),
      workflow: "payment_confirmation",
      entityType: "quote_request",
      entityId: quote.request_id,
      metadata: { txRef, amount, provider: FLUTTERWAVE_PAYMENT_PROVIDER },
      preferences,
      smsFallback: true,
      smsMessage: smsMessages.paymentConfirmed(quote.request_id),
      emailSubject: `Fly Logistics payment confirmed - ${quote.request_id}`,
      emailTitle: "Payment confirmed",
      emailCtaUrl: `${siteConfig.url}/customer`,
      emailCtaLabel: "Open customer dashboard",
      inAppTitle: "Payment confirmed",
      inAppBody: `Your payment for ${quote.request_id} has been confirmed. Fly Logistics is preparing your shipment.`
    });

    return {
      ok: result.ok,
      email: result.results.email?.status ?? null,
      whatsapp: result.results.whatsapp?.status ?? null,
      sms: result.results.sms?.status ?? null,
      inApp: result.results.inApp?.status ?? null
    };
  } catch (error) {
    logPaymentError(error, "Payment confirmed but customer notification failed.", { requestId: quote.request_id, txRef });
    return { ok: false, error: error instanceof Error ? error.message : "Customer notification failed." };
  }
}

export async function verifyFlutterwaveTransaction(transactionId: string) {
  const response = await fetch(`${FLUTTERWAVE_API_URL}/transactions/${encodeURIComponent(transactionId)}/verify`, {
    headers: {
      Authorization: `Bearer ${getFlutterwaveSecretKey()}`
    }
  });

  const payload = await readFlutterwaveResponse<FlutterwaveTransactionData>(response);

  if (payload.status !== "success" || !payload.data) {
    throw new Error(payload.message ?? "Unable to verify this payment.");
  }

  return payload.data;
}

async function findQuoteForPayment(
  supabase: SupabaseAdminClient,
  txRef: string | undefined,
  requestId: string | undefined
) {
  if (txRef) {
    const { data, error } = await supabase
      .from("quote_requests")
      .select("*")
      .eq("payment_reference", txRef)
      .maybeSingle();

    if (error) throw error;
    if (data) return data as PaymentQuote;
  }

  const derivedRequestId = requestId?.trim().toUpperCase() || parseRequestIdFromTxRef(txRef);
  if (!derivedRequestId) return null;

  const { data, error } = await supabase
    .from("quote_requests")
    .select("*")
    .eq("request_id", derivedRequestId)
    .maybeSingle();

  if (error) throw error;
  return (data as PaymentQuote | null) ?? null;
}

async function findQuotesForBatchPayment(supabase: SupabaseAdminClient, txRef: string | undefined) {
  if (!txRef || !isFlutterwaveBatchReference(txRef)) return [];

  const { data, error } = await supabase
    .from("quote_requests")
    .select("*")
    .eq("payment_reference", txRef)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return (data ?? []) as PaymentQuote[];
}

async function persistPaymentStatus(
  supabase: SupabaseAdminClient,
  quote: PaymentQuote,
  status: PaymentStatus,
  txRef: string,
  amount: number
) {
  const update = {
    payment_status: status,
    payment_reference: txRef,
    payment_amount: amount,
    payment_provider: FLUTTERWAVE_PAYMENT_PROVIDER,
    ...(status === "PAID"
      ? {
          status: "PAID",
          paid_at: new Date().toISOString(),
          quote_status_history: nextQuoteHistory(quote, "PAID", null, "Flutterwave payment verified.")
        }
      : {})
  };

  const quoteCompanyId = (quote as Record<string, unknown>).company_id;
  const { data, error } = await updateQuoteWithWorkflowFallback(supabase, quote.request_id, update, {
    companyId: typeof quoteCompanyId === "string" ? quoteCompanyId : null
  });

  if (error) throw error;

  if (status === "PAID") {
    await writeQuoteStatusEvent(supabase, {
      requestId: quote.request_id,
      previousStatus: quote.status,
      nextStatus: "PAID",
      note: "Flutterwave payment verified.",
      metadata: { txRef, amount }
    });
  }

  await writeAuditLog(supabase, {
    action: `payment.flutterwave.${status.toLowerCase()}`,
    entityType: "quote_request",
    entityId: quote.request_id,
    metadata: {
      txRef,
      amount,
      provider: FLUTTERWAVE_PAYMENT_PROVIDER,
      destination: "fly_logistics_subaccount"
    }
  });

  if (status === "PAID") {
    const customerNotification = await notifyCustomerPaymentConfirmed(supabase, { ...quote, payment_status: status, payment_reference: txRef, payment_amount: amount }, txRef, amount);

    await notifyAdmin(supabase, {
      title: "Paid shipment order",
      message: `${quote.customer_name ?? quote.customer_email ?? "A customer"} paid ${quote.request_id} through Fly Logistics checkout. Amount ${amount}.`,
      entityType: "quote_request",
      entityId: quote.request_id,
      metadata: { txRef, amount, paymentProvider: FLUTTERWAVE_PAYMENT_PROVIDER, customerNotification }
    });
  }

  const { error: shipmentError } = await supabase
    .from("shipments")
    .update(update)
    .eq("payment_reference", txRef);

  if (shipmentError) logPaymentError(shipmentError, "Quote payment updated but shipment payment sync failed.", { txRef });

  return data as PaymentQuote;
}

export async function verifyAndPersistFlutterwavePayment(
  supabase: SupabaseAdminClient,
  input: VerifyAndPersistInput
): Promise<PaymentResult> {
  const txRef = normalizeTxRef(input.txRef);
  const requestId = input.requestId?.trim().toUpperCase();
  const callbackStatus = input.callbackStatus?.trim().toLowerCase();
  const batchQuotes = await findQuotesForBatchPayment(supabase, txRef);

  if (batchQuotes.length > 0) {
    const expectedAmount = batchQuotes.reduce((sum, quote) => sum + quoteAmount(quote), 0);
    const alreadyPaid = batchQuotes.every((quote) => quote.payment_status === "PAID");

    if (alreadyPaid) {
      const shipments = await Promise.all(
        batchQuotes.map((quote) => safeAutoCreateShipmentFromPaidQuote(supabase, quote, {
          note: "Existing paid booking bundle checked during payment callback."
        }))
      );
      const trackingIds = shipments.map((item) => item.shipment?.tracking_id).filter(Boolean);

      return {
        ok: true,
        status: "PAID",
        message: `${batchQuotes.length} bookings are already marked as paid.`,
        requestId: `${batchQuotes.length} bookings`,
        trackingId: trackingIds[0],
        txRef,
        amount: expectedAmount,
        currency: "NGN"
      };
    }

    if (!input.transactionId) {
      if (txRef && callbackStatus && callbackStatus !== "successful") {
        await Promise.all(
          batchQuotes.map((quote) => persistPaymentStatus(
            supabase,
            quote,
            callbackStatus === "cancelled" ? "CANCELLED" : "FAILED",
            txRef,
            quoteAmount(quote)
          ))
        );
      }

      return {
        ok: false,
        status: callbackStatus === "cancelled" ? "CANCELLED" : "FAILED",
        message: callbackStatus === "cancelled" ? "Payment was cancelled." : "The payment provider did not return a transaction ID.",
        requestId: `${batchQuotes.length} bookings`,
        txRef
      };
    }

    const transaction = await verifyFlutterwaveTransaction(input.transactionId);
    const verifiedTxRef = normalizeTxRef(transaction.tx_ref);
    const paidAmount = normalizeAmount(transaction.amount);
    const currency = transaction.currency ?? "NGN";
    const hasMatchingReference = Boolean(verifiedTxRef && txRef && verifiedTxRef === txRef);
    const hasValidAmount = paidAmount >= expectedAmount;
    const isSuccessful = transaction.status === "successful" && hasMatchingReference && hasValidAmount;

    await Promise.all(
      batchQuotes.map((quote) => persistPaymentStatus(
        supabase,
        quote,
        isSuccessful ? "PAID" : "FAILED",
        verifiedTxRef ?? txRef ?? quote.request_id,
        quoteAmount(quote)
      ))
    );

    if (!isSuccessful) {
      return {
        ok: false,
        status: "FAILED",
        message: !hasMatchingReference
          ? "Payment reference did not match this booking bundle."
          : !hasValidAmount
            ? "Payment amount was lower than the booking bundle total."
            : "The payment provider did not mark this transaction as successful.",
        requestId: `${batchQuotes.length} bookings`,
        txRef: verifiedTxRef ?? txRef,
        amount: paidAmount,
        currency
      };
    }

    const shipments = await Promise.all(
      batchQuotes.map((quote) => safeAutoCreateShipmentFromPaidQuote(supabase, { ...quote, payment_status: "PAID" }, {
        note: "Automatically created after Flutterwave bundle payment verification."
      }))
    );
    shipments.forEach((shipment, index) => {
      if (shipment.error) {
        logPaymentError(shipment.error, "Flutterwave bundle payment verified but automatic shipment creation failed.", { requestId: batchQuotes[index]?.request_id });
      }
    });

    const trackingIds = shipments.map((item) => item.shipment?.tracking_id).filter(Boolean);
    return {
      ok: true,
      status: "PAID",
      message: trackingIds.length
        ? `Order placed successfully. Your Fly Logistics tracking number is ${trackingIds[0]}. You can track your order anytime on Fly Logistics.`
        : `Order placed successfully. Our operations team is processing your ${batchQuotes.length} shipments.`,
      requestId: `${batchQuotes.length} bookings`,
      trackingId: trackingIds[0],
      txRef: verifiedTxRef,
      amount: paidAmount,
      currency
    };
  }

  const quote = await findQuoteForPayment(supabase, txRef, requestId);

  if (!quote) {
    return {
      ok: false,
      status: "FAILED",
      message: "We could not match this payment to a Fly Logistics booking."
    };
  }

  if (quote.payment_status === "PAID") {
    const shipment = await safeAutoCreateShipmentFromPaidQuote(supabase, quote, {
      note: "Existing paid booking checked during payment callback."
    });
    if (shipment.error) {
      logPaymentError(shipment.error, "Paid quote exists but automatic shipment creation failed.", { requestId: quote.request_id });
    }

    return {
      ok: true,
      status: "PAID",
      message: "This booking is already marked as paid.",
      requestId: quote.request_id,
      trackingId: shipment.shipment?.tracking_id,
      txRef: quote.payment_reference ?? txRef,
      amount: normalizeAmount(quote.payment_amount ?? quote.quoted_price ?? quote.estimated_price),
      currency: "NGN"
    };
  }

  if (!input.transactionId) {
    if (txRef && callbackStatus && callbackStatus !== "successful") {
      await persistPaymentStatus(supabase, quote, callbackStatus === "cancelled" ? "CANCELLED" : "FAILED", txRef, normalizeAmount(quote.payment_amount ?? quote.quoted_price ?? quote.estimated_price));
    }

    return {
      ok: false,
      status: callbackStatus === "cancelled" ? "CANCELLED" : "FAILED",
      message: callbackStatus === "cancelled" ? "Payment was cancelled." : "The payment provider did not return a transaction ID.",
      requestId: quote.request_id,
      txRef
    };
  }

  const transaction = await verifyFlutterwaveTransaction(input.transactionId);
  const verifiedTxRef = normalizeTxRef(transaction.tx_ref);
  const expectedTxRef = quote.payment_reference ?? txRef;
  const expectedAmount = quoteAmount(quote);
  const paidAmount = normalizeAmount(transaction.amount);
  const currency = transaction.currency ?? "NGN";
  const hasMatchingReference = Boolean(verifiedTxRef && expectedTxRef && verifiedTxRef === expectedTxRef);
  const hasValidAmount = paidAmount >= expectedAmount;
  const isSuccessful = transaction.status === "successful" && hasMatchingReference && hasValidAmount;
  const nextStatus: PaymentStatus = isSuccessful ? "PAID" : "FAILED";

  const persistedQuote = await persistPaymentStatus(supabase, quote, nextStatus, verifiedTxRef ?? expectedTxRef ?? txRef ?? quote.request_id, paidAmount || expectedAmount);

  if (!isSuccessful) {
    const reason = !hasMatchingReference
      ? "Payment reference did not match this booking."
      : !hasValidAmount
        ? "Payment amount was lower than the booking total."
        : "The payment provider did not mark this transaction as successful.";

    return {
      ok: false,
      status: "FAILED",
      message: reason,
      requestId: quote.request_id,
      txRef: verifiedTxRef ?? txRef,
      amount: paidAmount,
      currency
    };
  }

  const shipment = await safeAutoCreateShipmentFromPaidQuote(supabase, persistedQuote, {
    note: "Automatically created after Flutterwave payment verification."
  });
  if (shipment.error) {
    logPaymentError(shipment.error, "Flutterwave payment verified but automatic shipment creation failed.", { requestId: quote.request_id });
  }

  const carrierNeedsReview = /failed|error/i.test(String(shipment.shipment?.carrier_status ?? shipment.shipment?.carrier_error ?? ""));
  return {
    ok: true,
    status: "PAID",
    message: shipment.shipment
      ? carrierNeedsReview
        ? `Order placed successfully. Your Fly Logistics tracking number is ${shipment.shipment.tracking_id}. Our operations team is processing your shipment.`
        : `Order placed successfully. Your Fly Logistics tracking number is ${shipment.shipment.tracking_id}. You can track your order anytime on Fly Logistics.`
      : "Order placed successfully. Our operations team is processing your shipment.",
    requestId: quote.request_id,
    trackingId: shipment.shipment?.tracking_id,
    txRef: verifiedTxRef,
    amount: paidAmount,
    currency
  };
}
