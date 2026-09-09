import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/request-auth";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { enforceRateLimit, parseJson } from "@/server/api";
import { notifyAdmin } from "@/server/admin-notifications";
import { sendEmailNotification } from "@/server/notifications/email";
import { validCryptoHash, type CryptoNetwork } from "@/server/payments/crypto";

const schema = z.object({ id: z.string().uuid(), txHash: z.string().trim().min(32).max(120) });

export async function POST(request: Request) {
  const limited = await enforceRateLimit(request, "crypto-submit", { limit: 10, windowSeconds: 60 });
  if (limited) return limited;
  const access = await requireRole(request, ["customer"]);
  if (!access.profile || access.error) return NextResponse.json({ error: access.error }, { status: access.status });
  const parsed = await parseJson(request, schema, "Enter a valid transaction hash.");
  if (parsed.response) return parsed.response;
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Crypto payment review is unavailable." }, { status: 503 });
  const payment = await supabase.from("crypto_payment_requests").select("id,network,status,payment_kind,amount_ngn,asset,request_ids").eq("id", parsed.data.id).eq("user_id", access.profile.id).maybeSingle();
  if (payment.error || !payment.data) return NextResponse.json({ error: "Payment request not found." }, { status: 404 });
  if (!["PENDING", "SUBMITTED"].includes(payment.data.status)) return NextResponse.json({ error: "This payment can no longer be changed." }, { status: 409 });
  if (!validCryptoHash(payment.data.network as CryptoNetwork, parsed.data.txHash)) return NextResponse.json({ error: `Enter a valid ${payment.data.network} transaction hash.` }, { status: 400 });
  const updated = await supabase.from("crypto_payment_requests").update({ tx_hash: parsed.data.txHash, status: "SUBMITTED", submitted_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", parsed.data.id).eq("user_id", access.profile.id).select("*").single();
  if (updated.error) return NextResponse.json({ error: updated.error.code === "23505" ? "This transaction hash has already been submitted." : "Unable to submit payment proof." }, { status: 409 });
  await notifyAdmin(supabase, {
    title: "Crypto payment proof submitted",
    message: `${access.profile.email ?? "A customer"} submitted blockchain payment proof for NGN ${Number(updated.data.amount_ngn).toLocaleString("en-NG")}. Review and verify the transaction before approving the payment or creating shipments.`,
    severity: "warning",
    entityType: "crypto_payment",
    entityId: updated.data.id,
    metadata: {
      paymentKind: updated.data.payment_kind,
      amountNgn: updated.data.amount_ngn,
      asset: updated.data.asset,
      network: updated.data.network,
      requestIds: updated.data.request_ids,
      transactionHash: updated.data.tx_hash
    },
    request
  });
  if (access.profile.email) {
    await sendEmailNotification({
      emailTo: access.profile.email,
      workflow: "crypto_payment_submitted",
      entityType: "crypto_payment",
      entityId: updated.data.id,
      subject: "Fly Logistics received your crypto payment proof",
      title: "Payment proof received",
      message: "Your transaction hash was received securely and is awaiting verification. We will notify you after approval. Wallet funds or shipment payment will not be confirmed until verification is complete.",
      ctaLabel: "View payment status",
      ctaUrl: `${new URL(request.url).origin}/customer#customer-payments`
    });
  }
  return NextResponse.json({ payment: updated.data });
}
