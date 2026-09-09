import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/request-auth";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { parseJson } from "@/server/api";
import { notifyAdmin } from "@/server/admin-notifications";
import { sendEmailNotification } from "@/server/notifications/email";
import { writeAuditLog } from "@/server/audit";
import { autoCreateShipmentFromPaidQuote } from "@/server/quote-to-shipment";
import { nextQuoteHistory, quoteAmount, updateQuoteWithWorkflowFallback, writeQuoteStatusEvent } from "@/server/quote-workflow";
import { applyWalletTransaction, createPendingWalletCredit, getOrCreateCustomerWallet, type WalletTransaction } from "@/server/wallets";

export const dynamic = "force-dynamic";
const schema = z.object({ id: z.string().uuid(), action: z.enum(["approve", "reject", "cancel"]), reason: z.string().trim().max(300).optional() });

export async function GET(request: Request) {
  const access = await requireRole(request, ["admin", "finance"]);
  if (!access.profile || access.error) return NextResponse.json({ error: access.error }, { status: access.status });
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Crypto payments are unavailable." }, { status: 503 });
  const rows = await supabase.from("crypto_payment_requests").select("*").order("created_at", { ascending: false }).limit(100);
  if (rows.error) return NextResponse.json({ error: "Crypto payment storage is not installed." }, { status: 503 });
  return NextResponse.json({ payments: rows.data ?? [] });
}

export async function PATCH(request: Request) {
  const access = await requireRole(request, ["admin", "finance"]);
  if (!access.profile || access.error) return NextResponse.json({ error: access.error }, { status: access.status });
  const parsed = await parseJson(request, schema, "Select a valid crypto payment action.");
  if (parsed.response) return parsed.response;
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Crypto payments are unavailable." }, { status: 503 });
  const found = await supabase.from("crypto_payment_requests").select("*").eq("id", parsed.data.id).maybeSingle();
  if (found.error || !found.data) return NextResponse.json({ error: "Crypto payment request not found." }, { status: 404 });
  if (!["PENDING", "SUBMITTED"].includes(found.data.status)) return NextResponse.json({ error: "This payment has already been reviewed." }, { status: 409 });

  const nextStatus = parsed.data.action === "approve" ? "APPROVED" : parsed.data.action === "reject" ? "REJECTED" : "CANCELLED";
  if (parsed.data.action === "approve" && !found.data.tx_hash) return NextResponse.json({ error: "A transaction hash is required before approval." }, { status: 409 });

  if (parsed.data.action === "approve" && found.data.payment_kind === "wallet") {
    const wallet = await getOrCreateCustomerWallet(supabase, found.data.user_id, found.data.company_id);
    if (wallet.error || !wallet.wallet) return NextResponse.json({ error: "Unable to load customer wallet." }, { status: 500 });
    const reference = `FLY-CRYPTO-WALLET-${found.data.id}`;
    const pending = await createPendingWalletCredit(supabase, { wallet: wallet.wallet, userId: found.data.user_id, amount: Number(found.data.amount_ngn), reference, description: "Crypto wallet funding", companyId: found.data.company_id, paymentProvider: "crypto" });
    if (pending.error || !pending.data) return NextResponse.json({ error: "Unable to prepare wallet credit." }, { status: 500 });
    const applied = await applyWalletTransaction(supabase, pending.data as WalletTransaction, "COMPLETED", found.data.tx_hash);
    if (applied.error) return NextResponse.json({ error: "Unable to apply wallet credit safely." }, { status: 500 });
  }

  if (parsed.data.action === "approve" && found.data.payment_kind === "booking") {
    const requestIds = Array.isArray(found.data.request_ids) ? found.data.request_ids.map(String) : [];
    for (const requestId of requestIds) {
      const quote = await supabase.from("quote_requests").select("*").eq("request_id", requestId).maybeSingle();
      if (!quote.data || String(quote.data.payment_status).toUpperCase() === "PAID") continue;
      const updated = await updateQuoteWithWorkflowFallback(supabase, requestId, {
        status: "PAID", payment_status: "PAID", payment_reference: found.data.tx_hash,
        payment_amount: quoteAmount(quote.data), payment_provider: "crypto", paid_at: new Date().toISOString(),
        quote_status_history: nextQuoteHistory(quote.data, "PAID", access.profile, "Crypto payment approved by Fly Logistics operations.")
      }, { companyId: found.data.company_id });
      if (updated.error) return NextResponse.json({ error: `Unable to mark ${requestId} as paid.` }, { status: 500 });
      await writeQuoteStatusEvent(supabase, { requestId, previousStatus: quote.data.status, nextStatus: "PAID", actor: access.profile, note: "Crypto payment approved by operations.", metadata: { cryptoPaymentId: found.data.id } });
      if (updated.data) await autoCreateShipmentFromPaidQuote(supabase, updated.data, { actor: access.profile, request, note: "Automatically created after approved crypto payment." });
    }
  }

  const updated = await supabase.from("crypto_payment_requests").update({ status: nextStatus, rejection_reason: parsed.data.reason ?? null, reviewed_by: access.profile.id, reviewed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", found.data.id).in("status", ["PENDING", "SUBMITTED"]).select("*").single();
  if (updated.error) return NextResponse.json({ error: "Unable to finalize crypto payment review." }, { status: 500 });
  await writeAuditLog(supabase, { actor: access.profile, action: `crypto_payment.${parsed.data.action}`, entityType: "crypto_payment", entityId: found.data.id, metadata: { reason: parsed.data.reason ?? null, txHash: found.data.tx_hash }, request });
  await notifyAdmin(supabase, {
    title: `Crypto payment ${nextStatus.toLowerCase()}`,
    message: `Crypto ${found.data.payment_kind} payment for NGN ${Number(found.data.amount_ngn).toLocaleString("en-NG")} was ${nextStatus.toLowerCase()} by ${access.profile.email ?? "an authorized operator"}.${found.data.payment_kind === "booking" && parsed.data.action === "approve" ? " Paid booking shipments were created automatically and now use their Fly Logistics tracking numbers." : ""}`,
    severity: parsed.data.action === "approve" ? "info" : "warning",
    entityType: "crypto_payment",
    entityId: found.data.id,
    metadata: {
      action: parsed.data.action,
      paymentKind: found.data.payment_kind,
      amountNgn: found.data.amount_ngn,
      requestIds: found.data.request_ids,
      reviewedBy: access.profile.id
    },
    request
  });
  const customer = await supabase.from("user_profiles").select("email,full_name").eq("id", found.data.user_id).maybeSingle();
  if (customer.data?.email) {
    const approved = parsed.data.action === "approve";
    await sendEmailNotification({
      emailTo: customer.data.email,
      workflow: `crypto_payment_${nextStatus.toLowerCase()}`,
      entityType: "crypto_payment",
      entityId: found.data.id,
      subject: `Fly Logistics crypto payment ${approved ? "confirmed" : nextStatus.toLowerCase()}`,
      title: approved ? "Crypto payment confirmed" : `Crypto payment ${nextStatus.toLowerCase()}`,
      message: approved
        ? found.data.payment_kind === "wallet"
          ? `Your verified crypto payment of NGN ${Number(found.data.amount_ngn).toLocaleString("en-NG")} has been credited to your Fly Logistics wallet.`
          : "Your verified crypto shipment payment is confirmed. Your shipment and Fly Logistics tracking details are available in your account."
        : `Your crypto payment was ${nextStatus.toLowerCase()}. No wallet credit or paid shipment was created. Contact Fly Logistics support if you need help.`,
      ctaLabel: found.data.payment_kind === "wallet" ? "View wallet" : "View shipments",
      ctaUrl: `${new URL(request.url).origin}/customer${found.data.payment_kind === "wallet" ? "#customer-wallet" : "#customer-shipments"}`
    });
  }
  return NextResponse.json({ payment: updated.data });
}
