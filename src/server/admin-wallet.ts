import { cleanEnv } from "@/lib/env";
import type { getSupabaseAdmin } from "@/lib/supabase-server";
import {
  applyWalletTransaction,
  debitCustomerWallet,
  getOrCreateCustomerWallet,
  isWalletSchemaMissing,
  type WalletTransaction
} from "@/server/wallets";
import { logPaymentError } from "@/server/monitoring";
import { writeOperationalEvent } from "@/server/operational-events";

type SupabaseAdminClient = NonNullable<ReturnType<typeof getSupabaseAdmin>>;

async function resolveAdminWalletUserId(supabase: SupabaseAdminClient) {
  const configured = cleanEnv(process.env.FLY_ADMIN_WALLET_USER_ID);
  if (configured) return configured;

  const { data, error } = await supabase
    .from("user_profiles")
    .select("id,email,role")
    .eq("role", "admin")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    logPaymentError(error, "Unable to resolve admin wallet user.", {});
    return null;
  }

  return data?.id ? String(data.id) : null;
}

export async function debitAdminWalletForCarrier(
  supabase: SupabaseAdminClient,
  input: {
    amount: number | null | undefined;
    trackingId: string;
    provider: string;
    carrierReference?: string | null;
  }
) {
  const amount = Number(input.amount ?? 0);
  if (!Number.isFinite(amount) || amount <= 0) {
    await writeOperationalEvent(supabase, {
      category: "payment",
      severity: "warning",
      message: "Carrier fulfilment did not return a debit amount for admin wallet.",
      entityType: "shipment",
      entityId: input.trackingId,
      metadata: { provider: input.provider, carrierReference: input.carrierReference ?? null }
    });
    return { ok: false, reason: "missing_amount" as const };
  }

  const adminUserId = await resolveAdminWalletUserId(supabase);
  if (!adminUserId) {
    await writeOperationalEvent(supabase, {
      category: "payment",
      severity: "warning",
      message: "Admin wallet debit skipped because no admin wallet user was configured.",
      entityType: "shipment",
      entityId: input.trackingId,
      metadata: { provider: input.provider, amount, requiredEnv: "FLY_ADMIN_WALLET_USER_ID" }
    });
    return { ok: false, reason: "missing_admin_wallet_user" as const };
  }

  const wallet = await getOrCreateCustomerWallet(supabase, adminUserId);
  if (wallet.error && isWalletSchemaMissing(wallet.error)) {
    await writeOperationalEvent(supabase, {
      category: "payment",
      severity: "warning",
      message: "Admin wallet debit skipped because wallet tables are not fully installed.",
      entityType: "shipment",
      entityId: input.trackingId,
      metadata: { provider: input.provider, amount }
    });
    return { ok: false, reason: "wallet_schema_missing" as const };
  }
  if (wallet.error || !wallet.wallet) {
    logPaymentError(wallet.error, "Unable to load admin wallet for carrier debit.", { trackingId: input.trackingId });
    return { ok: false, reason: "wallet_unavailable" as const };
  }

  const reference = `FLY-CARRIER-DEBIT-${input.provider.toUpperCase()}-${input.trackingId}-${Date.now()}`;
  const debit = await debitCustomerWallet(supabase, {
    wallet: wallet.wallet,
    userId: adminUserId,
    amount,
    reference,
    description: `${input.provider} fulfilment fee for ${input.trackingId}`,
    metadata: {
      provider: input.provider,
      trackingId: input.trackingId,
      carrierReference: input.carrierReference ?? null,
      source: "automatic_carrier_fulfilment"
    }
  });

  if (debit.error) {
    await writeOperationalEvent(supabase, {
      category: "payment",
      severity: "warning",
      message: "Admin wallet carrier debit failed.",
      entityType: "shipment",
      entityId: input.trackingId,
      metadata: { provider: input.provider, amount, reason: debit.error.message }
    });
    return { ok: false, reason: "debit_failed" as const };
  }

  await writeOperationalEvent(supabase, {
    category: "payment",
    message: "Admin wallet debited for carrier fulfilment.",
    entityType: "shipment",
    entityId: input.trackingId,
    metadata: { provider: input.provider, amount, reference, carrierReference: input.carrierReference ?? null }
  });

  return { ok: true, reference };
}

export async function adjustAdminWalletForShipmentFee(
  supabase: SupabaseAdminClient,
  input: {
    amount: number | null | undefined;
    trackingId: string;
    transactionType: "credit" | "debit";
    description?: string | null;
    metadata?: Record<string, unknown>;
  }
) {
  const amount = Number(input.amount ?? 0);
  if (!Number.isFinite(amount) || amount <= 0) {
    await writeOperationalEvent(supabase, {
      category: "payment",
      severity: "warning",
      message: "Admin wallet shipment-fee adjustment skipped because no amount was provided.",
      entityType: "shipment",
      entityId: input.trackingId,
      metadata: { transactionType: input.transactionType }
    });
    return { ok: false, reason: "missing_amount" as const };
  }

  const adminUserId = await resolveAdminWalletUserId(supabase);
  if (!adminUserId) {
    await writeOperationalEvent(supabase, {
      category: "payment",
      severity: "warning",
      message: "Admin wallet shipment-fee adjustment skipped because no admin wallet user was configured.",
      entityType: "shipment",
      entityId: input.trackingId,
      metadata: { amount, transactionType: input.transactionType, requiredEnv: "FLY_ADMIN_WALLET_USER_ID" }
    });
    return { ok: false, reason: "missing_admin_wallet_user" as const };
  }

  const wallet = await getOrCreateCustomerWallet(supabase, adminUserId);
  if (wallet.error && isWalletSchemaMissing(wallet.error)) {
    await writeOperationalEvent(supabase, {
      category: "payment",
      severity: "warning",
      message: "Admin wallet shipment-fee adjustment skipped because wallet tables are not fully installed.",
      entityType: "shipment",
      entityId: input.trackingId,
      metadata: { amount, transactionType: input.transactionType }
    });
    return { ok: false, reason: "wallet_schema_missing" as const };
  }
  if (wallet.error || !wallet.wallet) {
    logPaymentError(wallet.error, "Unable to load admin wallet for shipment-fee adjustment.", { trackingId: input.trackingId });
    return { ok: false, reason: "wallet_unavailable" as const };
  }

  if (input.transactionType === "debit") {
    const debit = await debitCustomerWallet(supabase, {
      wallet: wallet.wallet,
      userId: adminUserId,
      amount,
      reference: `FLY-SHIPMENT-FEE-DEBIT-${input.trackingId}-${Date.now()}`,
      description: input.description ?? `Shipment fee debit for ${input.trackingId}`,
      metadata: {
        trackingId: input.trackingId,
        source: "admin_shipment_create",
        ...(input.metadata ?? {})
      }
    });

    if (debit.error) {
      await writeOperationalEvent(supabase, {
        category: "payment",
        severity: "warning",
        message: "Admin wallet shipment-fee debit failed.",
        entityType: "shipment",
        entityId: input.trackingId,
        metadata: { amount, reason: debit.error.message }
      });
      return { ok: false, reason: "debit_failed" as const };
    }

    await writeOperationalEvent(supabase, {
      category: "payment",
      message: "Admin wallet debited for shipment fee adjustment.",
      entityType: "shipment",
      entityId: input.trackingId,
      metadata: { amount, reference: debit.transaction?.reference ?? null }
    });

    return { ok: true, reference: debit.transaction?.reference ?? null };
  }

  const reference = `FLY-SHIPMENT-FEE-CREDIT-${input.trackingId}-${Date.now()}`;
  const inserted = await supabase
    .from("wallet_transactions")
    .insert({
      wallet_id: wallet.wallet.id,
      user_id: adminUserId,
      transaction_type: "credit",
      amount,
      currency: wallet.wallet.currency ?? "NGN",
      reference,
      description: input.description ?? `Shipment fee received for ${input.trackingId}`,
      status: "PENDING",
      payment_provider: "admin",
      metadata: {
        trackingId: input.trackingId,
        source: "admin_shipment_create",
        ...(input.metadata ?? {})
      }
    })
    .select("*")
    .single();

  if (inserted.error || !inserted.data) {
    logPaymentError(inserted.error, "Unable to create admin wallet shipment-fee credit.", { trackingId: input.trackingId });
    return { ok: false, reason: "credit_create_failed" as const };
  }

  const applied = await applyWalletTransaction(supabase, inserted.data as WalletTransaction, "COMPLETED", reference);
  if (applied.error) {
    await writeOperationalEvent(supabase, {
      category: "payment",
      severity: "warning",
      message: "Admin wallet shipment-fee credit failed.",
      entityType: "shipment",
      entityId: input.trackingId,
      metadata: { amount, reason: applied.error.message, reference }
    });
    return { ok: false, reason: "credit_failed" as const };
  }

  await writeOperationalEvent(supabase, {
    category: "payment",
    message: "Admin wallet credited for shipment fee.",
    entityType: "shipment",
    entityId: input.trackingId,
    metadata: { amount, reference }
  });

  return { ok: true, reference };
}
