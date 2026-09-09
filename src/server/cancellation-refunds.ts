import type { getSupabaseAdmin } from "@/lib/supabase-server";
import { applyWalletTransaction, getOrCreateCustomerWallet, type WalletTransaction } from "@/server/wallets";
import { logShipmentWorkflowError } from "@/server/monitoring";
import { writeOperationalEvent } from "@/server/operational-events";

type SupabaseAdminClient = NonNullable<ReturnType<typeof getSupabaseAdmin>>;

type CancellationRefundShipment = {
  id: number | string;
  tracking_id: string;
  status: string | null;
  customer_email?: string | null;
  company_id?: string | null;
  payment_amount?: number | string | null;
  quoted_price?: number | string | null;
  cancellation_refund_amount?: number | string | null;
  cancellation_refund_reference?: string | null;
  cancellation_refund_due_at?: string | null;
};

function amountFrom(value: unknown) {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? amount : 0;
}

async function fetchCustomerProfileByEmail(supabase: SupabaseAdminClient, email?: string | null) {
  const normalizedEmail = String(email ?? "").trim();
  if (!normalizedEmail) return { data: null, error: null };

  const query = supabase
    .from("user_profiles")
    .select("id,email,full_name,company_id")
    .ilike("email", normalizedEmail);
  const result = await query.maybeSingle();
  if (!result.error || !["42703", "PGRST204"].includes(result.error.code ?? "")) return result;

  return supabase
    .from("user_profiles")
    .select("id,email,full_name")
    .ilike("email", normalizedEmail)
    .maybeSingle();
}

async function insertRefundTransaction(
  supabase: SupabaseAdminClient,
  input: {
    walletId: string | number;
    userId: string;
    companyId?: string | null;
    amount: number;
    currency: string;
    reference: string;
    trackingId: string;
  }
) {
  const payload: Record<string, unknown> = {
    wallet_id: input.walletId,
    user_id: input.userId,
    ...(input.companyId ? { company_id: input.companyId } : {}),
    transaction_type: "credit",
    amount: input.amount,
    currency: input.currency,
    reference: input.reference,
    description: `Automatic cancellation refund for shipment ${input.trackingId}`,
    status: "PENDING",
    payment_provider: "wallet_refund",
    metadata: {
      source: "shipment_cancellation_refund",
      tracking_id: input.trackingId,
      refund_deadline_hours: 48
    }
  };

  let inserted = await supabase
    .from("wallet_transactions")
    .insert(payload)
    .select("*")
    .single();

  if (inserted.error?.code === "23505") {
    const existing = await supabase
      .from("wallet_transactions")
      .select("*")
      .eq("reference", input.reference)
      .maybeSingle();
    return { data: existing.data as WalletTransaction | null, error: existing.error };
  }

  if (inserted.error?.message?.includes("company_id")) {
    delete payload.company_id;
    inserted = await supabase
      .from("wallet_transactions")
      .insert(payload)
      .select("*")
      .single();
  }

  return { data: inserted.data as WalletTransaction | null, error: inserted.error };
}

async function markRefundReviewRequired(
  supabase: SupabaseAdminClient,
  shipment: CancellationRefundShipment,
  reason: string
) {
  await supabase
    .from("shipments")
    .update({
      cancellation_refund_status: "REVIEW_REQUIRED",
      customer_status_message: "This cancelled shipment is under refund review by Fly Logistics operations.",
      updated_at: new Date().toISOString()
    })
    .eq("tracking_id", shipment.tracking_id);

  await writeOperationalEvent(supabase, {
    category: "payment",
    severity: "warning",
    message: "Cancellation refund requires admin review.",
    entityType: "shipment",
    entityId: shipment.tracking_id,
    metadata: { reason, customerEmail: shipment.customer_email }
  });
}

export async function processDueCancellationRefunds(supabase: SupabaseAdminClient) {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("shipments")
    .select("id,tracking_id,status,customer_email,company_id,payment_amount,quoted_price,cancellation_refund_amount,cancellation_refund_reference,cancellation_refund_due_at")
    .eq("status", "CANCELLED")
    .eq("cancellation_refund_status", "PENDING")
    .lte("cancellation_refund_due_at", now)
    .limit(50);

  if (error) throw error;

  const results: Array<{ trackingId: string; status: string; reason?: string }> = [];

  for (const shipment of (data ?? []) as CancellationRefundShipment[]) {
    const trackingId = shipment.tracking_id;
    const reference = shipment.cancellation_refund_reference || `FLY-REFUND-${trackingId}`;
    const amount = amountFrom(shipment.cancellation_refund_amount ?? shipment.payment_amount ?? shipment.quoted_price);

    try {
      if (amount <= 0) {
        await supabase
          .from("shipments")
          .update({
            cancellation_refund_status: "NOT_REQUIRED",
            cancellation_refund_due_at: null,
            updated_at: new Date().toISOString()
          })
          .eq("tracking_id", trackingId);
        results.push({ trackingId, status: "not_required", reason: "No refundable amount." });
        continue;
      }

      const profile = await fetchCustomerProfileByEmail(supabase, shipment.customer_email);
      if (profile.error) throw profile.error;
      if (!profile.data?.id) {
        await markRefundReviewRequired(supabase, shipment, "No matching customer account wallet was found.");
        results.push({ trackingId, status: "review_required", reason: "No matching customer profile." });
        continue;
      }

      const companyId = shipment.company_id ?? (profile.data as { company_id?: string | null }).company_id ?? null;
      const walletResult = await getOrCreateCustomerWallet(supabase, profile.data.id, companyId);
      if (walletResult.error) throw walletResult.error;
      if (!walletResult.wallet) {
        await markRefundReviewRequired(supabase, shipment, "Customer wallet could not be prepared.");
        results.push({ trackingId, status: "review_required", reason: "Wallet unavailable." });
        continue;
      }

      const transaction = await insertRefundTransaction(supabase, {
        walletId: walletResult.wallet.id,
        userId: profile.data.id,
        companyId,
        amount,
        currency: walletResult.wallet.currency ?? "NGN",
        reference,
        trackingId
      });
      if (transaction.error) throw transaction.error;
      if (!transaction.data) throw new Error("Unable to create refund wallet transaction.");

      const applied = await applyWalletTransaction(supabase, transaction.data, "COMPLETED", reference);
      if (applied.error) throw applied.error;

      await supabase
        .from("shipments")
        .update({
          cancellation_refund_status: "REFUNDED",
          cancellation_refunded_at: new Date().toISOString(),
          cancellation_refund_reference: reference,
          customer_status_message: "This cancelled shipment has been refunded to your Fly Logistics wallet.",
          updated_at: new Date().toISOString()
        })
        .eq("tracking_id", trackingId)
        .eq("status", "CANCELLED");

      await writeOperationalEvent(supabase, {
        category: "payment",
        message: "Cancellation refund credited to customer wallet.",
        entityType: "shipment",
        entityId: trackingId,
        metadata: { amount, reference, customerEmail: shipment.customer_email }
      });

      results.push({ trackingId, status: "refunded" });
    } catch (error) {
      logShipmentWorkflowError(error, "Cancellation refund processing failed.", { trackingId, reference });
      await writeOperationalEvent(supabase, {
        category: "payment",
        severity: "error",
        message: "Cancellation refund processing failed.",
        entityType: "shipment",
        entityId: trackingId,
        metadata: { reason: error instanceof Error ? error.message : "Unknown refund error", reference }
      });
      results.push({ trackingId, status: "failed", reason: error instanceof Error ? error.message : "Unknown refund error" });
    }
  }

  return { ok: true, checkedAt: now, processed: results.length, results };
}
