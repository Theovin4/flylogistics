import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/request-auth";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { enforceRateLimit, parseJson } from "@/server/api";
import { notifyAdmin } from "@/server/admin-notifications";
import { sendEmailNotification } from "@/server/notifications/email";
import { getCryptoQuote } from "@/server/payments/crypto";
import { quoteAmount } from "@/server/quote-workflow";
import { getTenantContextForProfile } from "@/server/tenancy";

export const dynamic = "force-dynamic";

const schema = z.object({
  requestIds: z.array(z.string().trim().min(3)).min(1).max(20).optional(),
  walletAmount: z.coerce.number().min(100).max(5_000_000).optional(),
  network: z.enum(["TRC20", "BEP20", "SOL", "BTC"])
}).refine((value) => value.requestIds?.length || value.walletAmount, "Select bookings or enter a wallet amount.");

export async function POST(request: Request) {
  const limited = await enforceRateLimit(request, "crypto-checkout", { limit: 10, windowSeconds: 60 });
  if (limited) return limited;
  const access = await requireRole(request, ["customer"]);
  if (!access.profile || access.error) return NextResponse.json({ error: access.error }, { status: access.status });
  const parsed = await parseJson(request, schema, "Enter valid crypto payment details.");
  if (parsed.response) return parsed.response;
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Crypto checkout is temporarily unavailable." }, { status: 503 });
  const tenant = await getTenantContextForProfile(supabase, access.profile);
  const requestIds = [...new Set((parsed.data.requestIds ?? []).map((id) => id.toUpperCase()))];
  let amountNgn = Number(parsed.data.walletAmount ?? 0);

  if (requestIds.length) {
    if (!access.profile.email) return NextResponse.json({ error: "Your account email is required." }, { status: 409 });
    let query = supabase.from("quote_requests").select("*").in("request_id", requestIds).ilike("customer_email", access.profile.email);
    if (tenant.schemaReady && tenant.companyId) query = query.eq("company_id", tenant.companyId);
    const quotes = await query;
    if (quotes.error) return NextResponse.json({ error: "Unable to load your bookings." }, { status: 500 });
    if ((quotes.data ?? []).length !== requestIds.length) return NextResponse.json({ error: "One or more bookings were not found." }, { status: 404 });
    if ((quotes.data ?? []).some((quote) => String(quote.payment_status).toUpperCase() === "PAID")) return NextResponse.json({ error: "A selected booking is already paid." }, { status: 409 });
    amountNgn = (quotes.data ?? []).reduce((sum, quote) => sum + quoteAmount(quote), 0);
  }
  if (!(amountNgn > 0)) return NextResponse.json({ error: "Payment amount is invalid." }, { status: 400 });

  const quote = await getCryptoQuote(amountNgn, parsed.data.network);
  const inserted = await supabase.from("crypto_payment_requests").insert({
    company_id: tenant.companyId, user_id: access.profile.id,
    payment_kind: requestIds.length ? "booking" : "wallet", request_ids: requestIds,
    asset: quote.asset, network: quote.network, deposit_address: quote.address,
    amount_ngn: quote.amountNgn, market_rate_ngn: quote.marketRateNgn,
    applied_rate_ngn: quote.appliedRateNgn, surcharge_percent: quote.surchargePercent,
    crypto_amount: quote.cryptoAmount
  }).select("*").single();
  if (inserted.error) return NextResponse.json({ error: "Crypto payment storage is not installed. Run the supplied migration first." }, { status: 503 });
  await notifyAdmin(supabase, {
    title: "New crypto payment request",
    message: `${access.profile.email ?? "A customer"} prepared a ${inserted.data.payment_kind} crypto payment for NGN ${Number(inserted.data.amount_ngn).toLocaleString("en-NG")} using ${inserted.data.asset} on ${inserted.data.network}. Payment proof has not been submitted yet.`,
    severity: "info",
    entityType: "crypto_payment",
    entityId: inserted.data.id,
    metadata: {
      paymentKind: inserted.data.payment_kind,
      amountNgn: inserted.data.amount_ngn,
      asset: inserted.data.asset,
      network: inserted.data.network,
      requestIds
    },
    request
  });
  if (access.profile.email) {
    await sendEmailNotification({
      emailTo: access.profile.email,
      workflow: "crypto_payment_prepared",
      entityType: "crypto_payment",
      entityId: inserted.data.id,
      subject: "Fly Logistics crypto payment instructions",
      title: "Your crypto payment is ready",
      message: `Send exactly ${inserted.data.crypto_amount} ${inserted.data.asset} using the ${inserted.data.network} network, then submit the transaction hash in your Fly Logistics account. Your payment remains pending until our secure verification is complete.`,
      ctaLabel: "Review payment instructions",
      ctaUrl: `${new URL(request.url).origin}/customer${inserted.data.payment_kind === "wallet" ? "#customer-wallet" : "#customer-payments"}`,
      metadata: { paymentKind: inserted.data.payment_kind, amountNgn: inserted.data.amount_ngn }
    });
  }
  return NextResponse.json({ payment: inserted.data });
}
