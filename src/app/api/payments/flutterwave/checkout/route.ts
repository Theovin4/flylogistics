import { NextResponse } from "next/server";
import { z } from "zod";
import { canPayQuote, quoteStatusLabel } from "@/lib/quotes";
import type { QuoteRequestRecord } from "@/lib/shipments";
import { requireRole } from "@/lib/request-auth";
import { canonicalSiteUrl } from "@/lib/site";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import {
  createFlutterwaveCheckout,
  FLUTTERWAVE_PAYMENT_PROVIDER,
  makeFlutterwaveBatchReference,
  makeFlutterwaveReference
} from "@/server/payments/flutterwave";
import { enforceRateLimit, parseJson } from "@/server/api";
import { logPaymentError, requestContext } from "@/server/monitoring";
import { quoteAmount } from "@/server/quote-workflow";

export const dynamic = "force-dynamic";

const checkoutSchema = z.object({
  requestId: z.string().trim().min(3).optional(),
  requestIds: z.array(z.string().trim().min(3)).min(1).max(20).optional()
}).refine((value) => value.requestId || value.requestIds?.length, "Quote request reference is required.");

type PaymentQuote = QuoteRequestRecord & {
  payment_status?: string | null;
  payment_reference?: string | null;
  payment_amount?: number | string | null;
  payment_provider?: string | null;
};

export async function POST(request: Request) {
  const limited = await enforceRateLimit(request, "flutterwave-checkout", { limit: 20, windowSeconds: 60 });
  if (limited) return limited;

  const access = await requireRole(request, ["customer"]);
  if (!access.profile) return NextResponse.json({ error: "Sign in to your customer account before paying for a shipment." }, { status: access.status });
  if (access.error) return NextResponse.json({ error: access.error }, { status: access.status });
  if (!access.profile.email) return NextResponse.json({ error: "Your customer account needs an email before checkout." }, { status: 409 });

  const parsed = await parseJson(request, checkoutSchema, "Quote request reference is required.");
  if (parsed.response) return parsed.response;

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Secure checkout is temporarily unavailable." }, { status: 503 });
  }

  const requestIds = Array.from(new Set((parsed.data.requestIds?.length ? parsed.data.requestIds : [parsed.data.requestId])
    .filter(Boolean)
    .map((id) => id!.toUpperCase())));

  if (requestIds.length > 1) {
    const { data, error } = await supabase
      .from("quote_requests")
      .select("*")
      .in("request_id", requestIds)
      .ilike("customer_email", access.profile.email)
      .order("created_at", { ascending: true });

    if (error) {
      logPaymentError(error, "Unable to load quote requests for Flutterwave bundle checkout.", requestContext(request, { requestIds }));
      return NextResponse.json({ error: "Unable to load quote requests." }, { status: 500 });
    }

    const quotes = (data ?? []) as PaymentQuote[];
    if (quotes.length !== requestIds.length) {
      return NextResponse.json({ error: "One or more selected bookings could not be found for this customer." }, { status: 404 });
    }

    const blocked = quotes.find((quote) => quote.payment_status === "PAID" || !canPayQuote(quote.status, quote.payment_status, quote.quote_valid_until));
    if (blocked) {
      return NextResponse.json({
        error: `Booking ${blocked.request_id} is not ready for payment. Current quote status: ${quoteStatusLabel(blocked.status)}.`
      }, { status: 409 });
    }

    const amount = quotes.reduce((sum, quote) => sum + quoteAmount(quote), 0);
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: "Selected bookings do not have a valid payment amount." }, { status: 400 });
    }

    const txRef = makeFlutterwaveBatchReference();

    try {
      const checkout = await createFlutterwaveCheckout({
        txRef,
        amount,
        currency: "NGN",
        redirectUrl: `${canonicalSiteUrl}/payment/flutterwave/callback`,
        customer: {
          email: access.profile.email,
          name: access.profile.full_name ?? quotes[0]?.customer_name ?? "Fly Logistics Customer",
          phone: access.profile.phone ?? quotes[0]?.customer_phone
        },
        description: `Fly Logistics shipment payment bundle (${quotes.length} bookings)`,
        paymentPurpose: "shipment"
      });

      const { error: updateError } = await supabase
        .from("quote_requests")
        .update({
          payment_status: "PENDING",
          payment_reference: txRef,
          payment_provider: FLUTTERWAVE_PAYMENT_PROVIDER
        })
        .in("request_id", requestIds);

      if (updateError) {
        logPaymentError(updateError, "Unable to persist Flutterwave bundle checkout reference.", requestContext(request, { requestIds, txRef }));
        return NextResponse.json({ error: "Unable to prepare payment for these bookings." }, { status: 500 });
      }

      return NextResponse.json({ ...checkout, requestIds, totalAmount: amount });
    } catch (err) {
      logPaymentError(err, "Unable to start Flutterwave bundle checkout.", requestContext(request, { requestIds }));
      const message = err instanceof Error ? err.message : "Unable to start secure checkout.";
      return NextResponse.json({ error: message }, { status: message.includes("temporarily unavailable") ? 503 : 502 });
    }
  }

  const requestId = requestIds[0];
  const { data, error } = await supabase
    .from("quote_requests")
    .select("*")
    .eq("request_id", requestId)
    .ilike("customer_email", access.profile.email)
    .maybeSingle();

  if (error) {
    logPaymentError(error, "Unable to load quote request for Flutterwave checkout.", requestContext(request, { requestId }));
    return NextResponse.json({ error: "Unable to load quote request." }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: "Quote request not found." }, { status: 404 });
  }

  const quote = data as PaymentQuote;
  if (quote.payment_status === "PAID") {
    return NextResponse.json({ error: "This quote request has already been paid." }, { status: 409 });
  }

  if (!canPayQuote(quote.status, quote.payment_status, quote.quote_valid_until)) {
    return NextResponse.json({
      error: `This quote is not ready for payment yet. Current quote status: ${quoteStatusLabel(quote.status)}.`
    }, { status: 409 });
  }

  const amount = quoteAmount(quote);
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: "Quote request does not have a valid payment amount." }, { status: 400 });
  }

  const txRef = makeFlutterwaveReference(quote.request_id);

  try {
    const checkout = await createFlutterwaveCheckout({
      txRef,
      amount,
      currency: "NGN",
      redirectUrl: `${canonicalSiteUrl}/payment/flutterwave/callback`,
      customer: {
        email: quote.customer_email,
        name: quote.customer_name,
        phone: quote.customer_phone
      },
      description: `Fly Logistics shipment payment ${quote.request_id}`,
      paymentPurpose: "shipment"
    });

    const { error: updateError } = await supabase
      .from("quote_requests")
      .update({
        payment_status: "PENDING",
        payment_reference: txRef,
        payment_amount: amount,
        payment_provider: FLUTTERWAVE_PAYMENT_PROVIDER
      })
      .eq("request_id", quote.request_id);

    if (updateError) {
      logPaymentError(updateError, "Unable to persist Flutterwave checkout reference.", requestContext(request, { requestId: quote.request_id, txRef }));
      return NextResponse.json({ error: "Unable to prepare payment for this quote request." }, { status: 500 });
    }

    return NextResponse.json(checkout);
  } catch (err) {
    logPaymentError(err, "Unable to start Flutterwave checkout.", requestContext(request, { requestId: quote.request_id }));
    const message = err instanceof Error ? err.message : "Unable to start secure checkout.";
    return NextResponse.json({ error: message }, { status: message.includes("temporarily unavailable") ? 503 : 502 });
  }
}
