import { FLUTTERWAVE_PAYMENT_PROVIDER, verifyFlutterwaveTransaction } from "@/server/payments/flutterwave";
import type { getSupabaseAdmin } from "@/lib/supabase-server";
import { whatsappMessages } from "@/lib/whatsapp";
import { writeAuditLog } from "@/server/audit";
import { getCustomerNotificationPreferences } from "@/server/notifications/preferences";
import { sendCustomerNotification, smsMessages } from "@/server/notifications/service";

type SupabaseAdminClient = NonNullable<ReturnType<typeof getSupabaseAdmin>>;

export type CustomerWallet = {
  id: number | string;
  user_id: string;
  company_id?: string | null;
  balance: number | string;
  currency: string;
  status?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type WalletTransaction = {
  id: number | string;
  wallet_id: number | string;
  user_id: string;
  company_id?: string | null;
  transaction_type: "credit" | "debit" | string;
  amount: number | string;
  currency: string;
  reference: string;
  description?: string | null;
  status: "PENDING" | "COMPLETED" | "FAILED" | "CANCELLED" | string;
  payment_provider?: string | null;
  provider_reference?: string | null;
  metadata?: Record<string, unknown> | null;
  created_at?: string | null;
  completed_at?: string | null;
};

export type WalletPaymentResult = {
  ok: boolean;
  status: "PAID" | "FAILED" | "CANCELLED";
  message: string;
  reference?: string;
  amount?: number;
  currency?: string;
};

export function isWalletSchemaMissing(error: { code?: string; message?: string } | null | undefined) {
  return error?.code === "42P01" || error?.code === "42703";
}

export function makeWalletFundingReference(userId: string) {
  return `FLY-WALLET-${userId.slice(0, 8).toUpperCase()}-${Date.now()}`;
}

export function isWalletFundingReference(reference: string | null | undefined) {
  return /^(FLY|FLW)-WALLET-/i.test(String(reference ?? "")) || /^FLY-FORGE-WALLET-/i.test(String(reference ?? ""));
}

function normalizeAmount(value: number | string | null | undefined) {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? amount : 0;
}

function missingColumn(error: { message?: string } | null | undefined) {
  const message = error?.message ?? "";
  return message.match(/column "([^"]+)" of relation/i)?.[1] ?? message.match(/Could not find the '([^']+)' column/i)?.[1] ?? null;
}

async function fetchWalletCustomerProfile(supabase: SupabaseAdminClient, userId: string) {
  let result = await supabase
    .from("user_profiles")
    .select("email,full_name,phone,whatsapp_notifications_enabled,sms_notifications_enabled")
    .eq("id", userId)
    .maybeSingle();

  if (result.error && (result.error.code === "42703" || result.error.code === "PGRST204")) {
    result = await supabase
      .from("user_profiles")
      .select("email,full_name,phone")
      .eq("id", userId)
      .maybeSingle();
  }

  return result.data ?? null;
}

export async function getOrCreateCustomerWallet(supabase: SupabaseAdminClient, userId: string, companyId?: string | null) {
  let existingQuery = supabase
    .from("customer_wallets")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1);
  if (companyId) existingQuery = existingQuery.eq("company_id", companyId);
  const existing = await existingQuery;

  if (existing.error) return { wallet: null, error: existing.error };
  if (existing.data?.[0]) return { wallet: existing.data[0] as CustomerWallet, error: null };

  const createPayload: Record<string, unknown> = {
    user_id: userId,
    balance: 0,
    currency: "NGN",
    status: "ACTIVE",
    ...(companyId ? { company_id: companyId } : {})
  };

  let created = await supabase
    .from("customer_wallets")
    .insert(createPayload)
    .select("*")
    .single();

  if (created.error && missingColumn(created.error) === "company_id") {
    delete createPayload.company_id;
    created = await supabase
      .from("customer_wallets")
      .insert(createPayload)
      .select("*")
      .single();
  }

  if (created.error?.code === "23505") {
    let retryQuery = supabase
      .from("customer_wallets")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: true })
      .limit(1);
    if (companyId) retryQuery = retryQuery.eq("company_id", companyId);
    const retry = await retryQuery;

    return { wallet: (retry.data?.[0] as CustomerWallet | undefined) ?? null, error: retry.error };
  }

  return { wallet: created.data as CustomerWallet | null, error: created.error };
}

export async function getWalletOverview(supabase: SupabaseAdminClient, userId: string, companyId?: string | null) {
  const walletResult = await getOrCreateCustomerWallet(supabase, userId, companyId);
  if (walletResult.error || !walletResult.wallet) {
    return { wallet: null, transactions: [], error: walletResult.error };
  }

  const transactions = await supabase
    .from("wallet_transactions")
    .select("*")
    .eq("wallet_id", walletResult.wallet.id)
    .order("created_at", { ascending: false })
    .limit(50);

  return {
    wallet: walletResult.wallet,
    transactions: transactions.error ? [] : (transactions.data ?? []) as WalletTransaction[],
    error: transactions.error
  };
}

export async function createPendingWalletCredit(
  supabase: SupabaseAdminClient,
  input: {
    wallet: CustomerWallet;
    userId: string;
    amount: number;
    reference: string;
    description: string;
    companyId?: string | null;
    paymentProvider?: string | null;
  }
) {
  const payload: Record<string, unknown> = {
    wallet_id: input.wallet.id,
    user_id: input.userId,
    ...(input.companyId ? { company_id: input.companyId } : {}),
    transaction_type: "credit",
    amount: input.amount,
    currency: input.wallet.currency ?? "NGN",
    reference: input.reference,
    description: input.description,
    status: "PENDING",
    payment_provider: input.paymentProvider ?? FLUTTERWAVE_PAYMENT_PROVIDER,
    metadata: { source: "customer_wallet_funding" }
  };
  const optionalColumns = new Set(["description", "payment_provider", "metadata", "company_id"]);

  for (let attempt = 0; attempt <= optionalColumns.size; attempt += 1) {
    const result = await supabase
      .from("wallet_transactions")
      .insert(payload)
      .select("*")
      .single();

    if (!result.error) return result;

    const column = missingColumn(result.error);
    if (!column || !optionalColumns.has(column) || !(column in payload)) return result;
    delete payload[column];
  }

  return {
    data: null,
    error: new Error("Unable to store pending wallet credit after retrying optional wallet fields.")
  };
}

export async function applyWalletTransaction(
  supabase: SupabaseAdminClient,
  transaction: WalletTransaction,
  status: "COMPLETED" | "FAILED" | "CANCELLED",
  providerReference?: string | null
) {
  const rpc = await supabase.rpc("apply_customer_wallet_transaction", {
    p_reference: transaction.reference,
    p_status: status,
    p_provider_reference: providerReference ?? null
  });

  if (!rpc.error) return { error: null };
  if (!["42883", "42P01", "42703", "PGRST202"].includes(rpc.error.code ?? "")) return { error: rpc.error };

  const updateTransaction = await supabase
    .from("wallet_transactions")
    .update({
      status,
      provider_reference: providerReference ?? null,
      completed_at: status === "COMPLETED" ? new Date().toISOString() : null
    })
    .eq("id", transaction.id)
    .eq("status", "PENDING")
    .select("*")
    .maybeSingle();

  if (updateTransaction.error) return { error: updateTransaction.error };
  if (!updateTransaction.data || status !== "COMPLETED") return { error: null };

  const wallet = await supabase
    .from("customer_wallets")
    .select("*")
    .eq("id", transaction.wallet_id)
    .maybeSingle();

  if (wallet.error) return { error: wallet.error };
  if (!wallet.data) return { error: new Error("Wallet not found.") };

  const currentBalance = normalizeAmount(wallet.data.balance);
  const amount = normalizeAmount(transaction.amount);
  const nextBalance = transaction.transaction_type === "debit" ? currentBalance - amount : currentBalance + amount;
  if (nextBalance < 0) return { error: new Error("Insufficient wallet balance.") };

  const walletUpdate = await supabase
    .from("customer_wallets")
    .update({ balance: nextBalance, updated_at: new Date().toISOString() })
    .eq("id", transaction.wallet_id);

  return { error: walletUpdate.error };
}

export async function verifyAndCreditWalletPayment(
  supabase: SupabaseAdminClient,
  input: {
    transactionId?: string | null;
    txRef?: string | null;
    callbackStatus?: string | null;
  }
): Promise<WalletPaymentResult> {
  const txRef = input.txRef?.trim();
  if (!txRef) {
    return { ok: false, status: "FAILED", message: "Wallet payment reference is missing." };
  }

  const { data, error } = await supabase
    .from("wallet_transactions")
    .select("*")
    .eq("reference", txRef)
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    return { ok: false, status: "FAILED", message: "We could not match this wallet payment to a customer wallet.", reference: txRef };
  }

  const transaction = data as WalletTransaction;
  if (transaction.status === "COMPLETED") {
    return {
      ok: true,
      status: "PAID",
      message: "This wallet funding has already been credited.",
      reference: txRef,
      amount: normalizeAmount(transaction.amount),
      currency: transaction.currency
    };
  }

  if (!input.transactionId) {
    const cancelled = input.callbackStatus?.toLowerCase() === "cancelled";
    await applyWalletTransaction(supabase, transaction, cancelled ? "CANCELLED" : "FAILED", null);
    return {
      ok: false,
      status: cancelled ? "CANCELLED" : "FAILED",
      message: cancelled ? "Wallet funding was cancelled." : "The payment provider did not return a transaction ID.",
      reference: txRef,
      amount: normalizeAmount(transaction.amount),
      currency: transaction.currency
    };
  }

  const verified = await verifyFlutterwaveTransaction(input.transactionId);
  const verifiedTxRef = verified.tx_ref?.trim();
  const paidAmount = normalizeAmount(verified.amount);
  const expectedAmount = normalizeAmount(transaction.amount);
  const currency = verified.currency ?? transaction.currency ?? "NGN";
  const successful = verified.status === "successful" && verifiedTxRef === txRef && paidAmount >= expectedAmount;

  await applyWalletTransaction(supabase, transaction, successful ? "COMPLETED" : "FAILED", verified.flw_ref ?? String(verified.id ?? ""));

  await writeAuditLog(supabase, {
    actor: { id: transaction.user_id, role: "customer" },
    action: successful ? "payment.wallet_funding.verified" : "payment.wallet_funding.failed",
    entityType: "customer_wallet",
    entityId: transaction.wallet_id,
    metadata: {
      reference: txRef,
      amount: paidAmount || expectedAmount,
      provider: FLUTTERWAVE_PAYMENT_PROVIDER,
      destination: "fly_logistics_subaccount"
    }
  });

  if (successful) {
    const profile = await fetchWalletCustomerProfile(supabase, transaction.user_id);
    if (profile?.phone || profile?.email) {
      await sendCustomerNotification({
        to: profile.phone,
        message: whatsappMessages.walletFunded({
          customer_name: profile.full_name,
          amount: paidAmount || expectedAmount,
          currency,
          reference: txRef
        }),
        workflow: "wallet_funded",
        entityType: "customer_wallet",
        entityId: transaction.wallet_id,
        metadata: { reference: txRef, amount: paidAmount || expectedAmount, provider: FLUTTERWAVE_PAYMENT_PROVIDER },
        preferences: await getCustomerNotificationPreferences(supabase, profile.email),
        smsFallback: true,
        smsMessage: smsMessages.paymentConfirmed(txRef)
      });
    }
  }

  return {
    ok: successful,
    status: successful ? "PAID" : "FAILED",
    message: successful ? "Wallet funding verified and credited." : "Wallet funding could not be verified.",
    reference: txRef,
    amount: paidAmount || expectedAmount,
    currency
  };
}

export async function debitCustomerWallet(
  supabase: SupabaseAdminClient,
  input: {
    wallet: CustomerWallet;
    userId: string;
    amount: number;
    reference: string;
    description: string;
    metadata?: Record<string, unknown>;
    companyId?: string | null;
  }
) {
  const balance = normalizeAmount(input.wallet.balance);
  if (balance < input.amount) {
    return { error: new Error("Insufficient wallet balance."), transaction: null };
  }

  const payload: Record<string, unknown> = {
    wallet_id: input.wallet.id,
    user_id: input.userId,
    ...(input.companyId ? { company_id: input.companyId } : {}),
    transaction_type: "debit",
    amount: input.amount,
    currency: input.wallet.currency ?? "NGN",
    reference: input.reference,
    description: input.description,
    status: "PENDING",
    payment_provider: "wallet",
    metadata: input.metadata ?? {}
  };

  let inserted = await supabase
    .from("wallet_transactions")
    .insert(payload)
    .select("*")
    .single();

  if (inserted.error && missingColumn(inserted.error) === "company_id") {
    delete payload.company_id;
    inserted = await supabase
      .from("wallet_transactions")
      .insert(payload)
      .select("*")
      .single();
  }

  if (inserted.error || !inserted.data) return { error: inserted.error ?? new Error("Unable to create wallet debit."), transaction: null };

  const applied = await applyWalletTransaction(supabase, inserted.data as WalletTransaction, "COMPLETED", input.reference);
  return { error: applied.error, transaction: inserted.data as WalletTransaction };
}
