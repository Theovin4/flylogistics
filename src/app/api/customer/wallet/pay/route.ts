import { NextResponse } from "next/server";
import { z } from "zod";
import { canPayQuote, quoteStatusLabel } from "@/lib/quotes";
import { requireRole } from "@/lib/request-auth";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { enforceRateLimit, parseJson } from "@/server/api";
import { notifyAdmin } from "@/server/admin-notifications";
import { writeAuditLog } from "@/server/audit";
import { logPaymentError, requestContext } from "@/server/monitoring";
import { nextQuoteHistory, quoteAmount, updateQuoteWithWorkflowFallback, writeQuoteStatusEvent } from "@/server/quote-workflow";
import { autoCreateShipmentFromPaidQuote } from "@/server/quote-to-shipment";
import { getTenantContextForProfile } from "@/server/tenancy";
import { debitCustomerWallet, getWalletOverview, isWalletSchemaMissing } from "@/server/wallets";

export const dynamic = "force-dynamic";

const walletPaySchema = z.object({
  requestId: z.string().trim().optional(),
  requestIds: z.array(z.string().trim().min(3)).min(1).max(20).optional(),
  trackingId: z.string().trim().optional()
}).refine((value) => value.requestId || value.requestIds?.length || value.trackingId, "A quote request or shipment reference is required.");

function amountFrom(value: unknown) {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? amount : 0;
}

export async function POST(request: Request) {
  const limited = await enforceRateLimit(request, "customer-wallet-pay", { limit: 20, windowSeconds: 60 });
  if (limited) return limited;

  const access = await requireRole(request, ["customer"]);
  if (!access.profile) return NextResponse.json({ error: access.error }, { status: access.status });
  if (access.error) return NextResponse.json({ error: access.error }, { status: access.status });

  const parsed = await parseJson(request, walletPaySchema, "Select a shipment or quote request to pay from wallet.");
  if (parsed.response) return parsed.response;

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Wallet payments are temporarily unavailable." }, { status: 503 });
  if (!access.profile.email) return NextResponse.json({ error: "Your customer account needs an email before wallet payment." }, { status: 409 });
  const tenant = await getTenantContextForProfile(supabase, access.profile);

  const walletOverview = await getWalletOverview(supabase, access.profile.id, tenant.companyId);
  if (walletOverview.error && isWalletSchemaMissing(walletOverview.error)) {
    return NextResponse.json({ error: "Wallet payments are temporarily unavailable." }, { status: 503 });
  }
  if (walletOverview.error || !walletOverview.wallet) {
    logPaymentError(walletOverview.error, "Unable to load wallet for payment.", requestContext(request, { userId: access.profile.id }));
    return NextResponse.json({ error: "Unable to load wallet." }, { status: 500 });
  }

  const requestIds = Array.from(new Set((parsed.data.requestIds?.length ? parsed.data.requestIds : parsed.data.requestId ? [parsed.data.requestId] : [])
    .map((id) => id.toUpperCase())));

  if (requestIds.length > 1) {
    let quotesQuery = supabase
      .from("quote_requests")
      .select("*")
      .in("request_id", requestIds)
      .ilike("customer_email", access.profile.email)
      .order("created_at", { ascending: true });
    if (tenant.schemaReady && tenant.companyId) quotesQuery = quotesQuery.eq("company_id", tenant.companyId);
    const { data: quotes, error } = await quotesQuery;

    if (error) {
      logPaymentError(error, "Unable to load quote bundle for wallet payment.", requestContext(request, { requestIds }));
      return NextResponse.json({ error: "Unable to load quote requests." }, { status: 500 });
    }
    if ((quotes ?? []).length !== requestIds.length) return NextResponse.json({ error: "One or more selected bookings could not be found for this customer." }, { status: 404 });

    const blocked = (quotes ?? []).find((quote) => quote.payment_status === "PAID" || !canPayQuote(quote.status, quote.payment_status, quote.quote_valid_until));
    if (blocked) {
      return NextResponse.json({ error: `Booking ${blocked.request_id} is not ready for wallet payment. Current quote status: ${quoteStatusLabel(blocked.status)}.` }, { status: 409 });
    }

    const amount = (quotes ?? []).reduce((sum, quote) => sum + quoteAmount(quote), 0);
    if (amount <= 0) return NextResponse.json({ error: "Selected bookings do not have a valid amount." }, { status: 400 });

    const reference = `FLY-WALLET-PAY-BATCH-${Date.now()}`;
    const debit = await debitCustomerWallet(supabase, {
      wallet: walletOverview.wallet,
      userId: access.profile.id,
      amount,
      reference,
      description: `Wallet payment for ${requestIds.length} bookings`,
      metadata: { requestIds, entityType: "quote_request_bundle" },
      companyId: tenant.companyId
    });
    if (debit.error) return NextResponse.json({ error: debit.error.message }, { status: 409 });

    const shipments = [];
    for (const quote of quotes ?? []) {
      const update = {
        status: "PAID",
        payment_status: "PAID",
        payment_reference: reference,
        payment_amount: quoteAmount(quote),
        payment_provider: "wallet",
        paid_at: new Date().toISOString(),
        quote_status_history: nextQuoteHistory(quote, "PAID", access.profile, "Customer paid this booking bundle with wallet.")
      };
      const updatedQuote = await updateQuoteWithWorkflowFallback(supabase, quote.request_id, update, {
        companyId: tenant.schemaReady ? tenant.companyId : null
      });

      if (updatedQuote.error) {
        logPaymentError(updatedQuote.error, "Wallet bundle debit succeeded but quote payment update failed.", requestContext(request, { requestId: quote.request_id, reference }));
        continue;
      }

      await writeQuoteStatusEvent(supabase, {
        requestId: quote.request_id,
        previousStatus: quote.status,
        nextStatus: "PAID",
        actor: access.profile,
        note: "Customer paid this booking bundle with wallet.",
        metadata: { amount: quoteAmount(quote), reference, provider: "wallet" }
      });

      if (updatedQuote.data) {
        const shipment = await autoCreateShipmentFromPaidQuote(supabase, updatedQuote.data, {
          actor: access.profile,
          request,
          note: "Automatically created after customer wallet bundle payment."
        });
        if (shipment.error) logPaymentError(shipment.error, "Wallet bundle payment succeeded but automatic shipment creation failed.", requestContext(request, { requestId: quote.request_id, reference }));
        if (shipment.shipment) shipments.push(shipment.shipment);
      }
    }

    await writeAuditLog(supabase, {
      actor: access.profile,
      action: "wallet.pay_quote_bundle",
      entityType: "quote_request_bundle",
      entityId: reference,
      metadata: { amount, reference, requestIds },
      request
    });

    await notifyAdmin(supabase, {
      title: "Paid shipment bundle",
      message: `${access.profile.email ?? "A customer"} paid ${requestIds.length} bookings from wallet. Amount ${amount}.`,
      entityType: "quote_request_bundle",
      entityId: reference,
      metadata: { requestIds, amount, provider: "wallet" },
      request
    });

    return NextResponse.json({ requestIds, shipments, reference, amount });
  }

  if (requestIds.length === 1) {
    const requestId = requestIds[0];
    let quoteQuery = supabase
      .from("quote_requests")
      .select("*")
      .eq("request_id", requestId)
      .ilike("customer_email", access.profile.email);
    if (tenant.schemaReady && tenant.companyId) quoteQuery = quoteQuery.eq("company_id", tenant.companyId);
    const { data: quote, error } = await quoteQuery.maybeSingle();

    if (error) {
      logPaymentError(error, "Unable to load quote for wallet payment.", requestContext(request, { requestId }));
      return NextResponse.json({ error: "Unable to load quote request." }, { status: 500 });
    }
    if (!quote) return NextResponse.json({ error: "Quote request not found for this customer." }, { status: 404 });
    if (quote.payment_status === "PAID") return NextResponse.json({ error: "This quote request has already been paid." }, { status: 409 });
    if (!canPayQuote(quote.status, quote.payment_status, quote.quote_valid_until)) {
      return NextResponse.json({ error: `Please accept this quote before wallet payment. Current quote status: ${quoteStatusLabel(quote.status)}.` }, { status: 409 });
    }

    const amount = quoteAmount(quote);
    if (amount <= 0) return NextResponse.json({ error: "This quote request does not have a valid amount." }, { status: 400 });

    const reference = `FLY-WALLET-PAY-QUOTE-${requestId}-${Date.now()}`;
    const debit = await debitCustomerWallet(supabase, {
      wallet: walletOverview.wallet,
      userId: access.profile.id,
      amount,
      reference,
      description: `Wallet payment for ${requestId}`,
      metadata: { requestId, entityType: "quote_request" },
      companyId: tenant.companyId
    });
    if (debit.error) return NextResponse.json({ error: debit.error.message }, { status: 409 });

    const update = {
      status: "PAID",
      payment_status: "PAID",
      payment_reference: reference,
      payment_amount: amount,
      payment_provider: "wallet",
      paid_at: new Date().toISOString(),
      quote_status_history: nextQuoteHistory(quote, "PAID", access.profile, "Customer paid this quote with wallet.")
    };
    const updatedQuote = await updateQuoteWithWorkflowFallback(supabase, requestId, update, {
      companyId: tenant.schemaReady ? tenant.companyId : null
    });

    if (updatedQuote.error) {
      logPaymentError(updatedQuote.error, "Wallet debit succeeded but quote payment update failed.", requestContext(request, { requestId, reference }));
      return NextResponse.json({ error: "Wallet debit succeeded, but the quote payment update needs operations review." }, { status: 500 });
    }

    await writeQuoteStatusEvent(supabase, {
      requestId,
      previousStatus: quote.status,
      nextStatus: "PAID",
      actor: access.profile,
      note: "Customer paid this quote with wallet.",
      metadata: { amount, reference, provider: "wallet" }
    });

    await writeAuditLog(supabase, {
      actor: access.profile,
      action: "wallet.pay_quote",
      entityType: "quote_request",
      entityId: requestId,
      metadata: { amount, reference },
      request
    });

    await notifyAdmin(supabase, {
      title: "Paid shipment order",
      message: `${access.profile.email ?? "A customer"} paid booking ${requestId} from wallet. Amount ${amount}.`,
      entityType: "quote_request",
      entityId: requestId,
      metadata: { amount, reference, provider: "wallet" },
      request
    });

    const shipment = updatedQuote.data
      ? await autoCreateShipmentFromPaidQuote(supabase, updatedQuote.data, {
          actor: access.profile,
          request,
          note: "Automatically created after customer wallet payment."
        })
      : { shipment: null, error: null };
    if (shipment.error) {
      logPaymentError(shipment.error, "Wallet payment succeeded but automatic shipment creation failed.", requestContext(request, { requestId, reference }));
    }

    return NextResponse.json({ quote: updatedQuote.data, shipment: shipment.shipment, reference, amount });
  }

  const trackingId = parsed.data.trackingId!.toUpperCase();
  let shipmentQuery = supabase
    .from("shipments")
    .select("*")
    .eq("tracking_id", trackingId)
    .ilike("customer_email", access.profile.email);
  if (tenant.schemaReady && tenant.companyId) shipmentQuery = shipmentQuery.eq("company_id", tenant.companyId);
  const { data: shipment, error } = await shipmentQuery.maybeSingle();

  if (error) {
    logPaymentError(error, "Unable to load shipment for wallet payment.", requestContext(request, { trackingId }));
    return NextResponse.json({ error: "Unable to load shipment." }, { status: 500 });
  }
  if (!shipment) return NextResponse.json({ error: "Shipment not found for this customer." }, { status: 404 });
  if (shipment.payment_status === "PAID") return NextResponse.json({ error: "This shipment has already been paid." }, { status: 409 });

  const amount = amountFrom(shipment.payment_amount ?? shipment.quoted_price);
  if (amount <= 0) return NextResponse.json({ error: "This shipment does not have a valid amount." }, { status: 400 });

  const reference = `FLY-WALLET-PAY-SHIPMENT-${trackingId}-${Date.now()}`;
  const debit = await debitCustomerWallet(supabase, {
    wallet: walletOverview.wallet,
    userId: access.profile.id,
    amount,
    reference,
    description: `Wallet payment for ${trackingId}`,
    metadata: { trackingId, entityType: "shipment" },
    companyId: tenant.companyId
  });
  if (debit.error) return NextResponse.json({ error: debit.error.message }, { status: 409 });

  let updateShipmentQuery = supabase
    .from("shipments")
    .update({
      payment_status: "PAID",
      payment_reference: reference,
      payment_amount: amount,
      payment_provider: "wallet",
      updated_at: new Date().toISOString()
    })
    .eq("tracking_id", trackingId);
  if (tenant.schemaReady && tenant.companyId) updateShipmentQuery = updateShipmentQuery.eq("company_id", tenant.companyId);
  const updatedShipment = await updateShipmentQuery.select("*").single();

  if (updatedShipment.error) {
    logPaymentError(updatedShipment.error, "Wallet debit succeeded but shipment payment update failed.", requestContext(request, { trackingId, reference }));
    return NextResponse.json({ error: "Wallet debit succeeded, but the shipment payment update needs operations review." }, { status: 500 });
  }

  await writeAuditLog(supabase, {
    actor: access.profile,
    action: "wallet.pay_shipment",
    entityType: "shipment",
    entityId: trackingId,
    metadata: { amount, reference },
    request
  });

  await notifyAdmin(supabase, {
    title: "Paid existing shipment",
    message: `${access.profile.email ?? "A customer"} paid shipment ${trackingId} from wallet. Amount ${amount}.`,
    entityType: "shipment",
    entityId: trackingId,
    metadata: { amount, reference, provider: "wallet" },
    request
  });

  return NextResponse.json({ shipment: updatedShipment.data, reference, amount });
}
