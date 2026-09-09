import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/request-auth";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { parseJson } from "@/server/api";
import { writeAuditLog } from "@/server/audit";
import { logPaymentError, requestContext } from "@/server/monitoring";
import { applyWalletTransaction, getOrCreateCustomerWallet, isWalletSchemaMissing, type WalletTransaction } from "@/server/wallets";

export const dynamic = "force-dynamic";

const walletAdjustmentSchema = z.object({
  userId: z.string().uuid(),
  transactionType: z.enum(["credit", "debit"]),
  amount: z.coerce.number().min(1).max(10_000_000),
  description: z.string().trim().min(3).max(240)
});

type WalletRow = {
  user_id: string;
  [key: string]: unknown;
};

const walletCustomerRoles = new Set(["customer", "merchant", "business", "owner"]);

export async function GET(request: Request) {
  const access = await requireRole(request, ["admin", "finance", "customer_care"]);
  if (!access.profile) return NextResponse.json({ error: access.error }, { status: access.status });
  if (access.error) return NextResponse.json({ error: access.error }, { status: access.status });

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ wallets: [], transactions: [] });

  const [wallets, transactions] = await Promise.all([
    supabase
      .from("customer_wallets")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(100),
    supabase
      .from("wallet_transactions")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100)
  ]);

  if (wallets.error && isWalletSchemaMissing(wallets.error)) {
    return NextResponse.json({ wallets: [], transactions: [], warning: "Wallet storage is not installed yet." });
  }
  if (wallets.error) {
    logPaymentError(wallets.error, "Unable to load admin wallets.", requestContext(request));
    return NextResponse.json({ error: "Unable to load wallets." }, { status: 500 });
  }

  const walletRows = (wallets.data ?? []) as WalletRow[];
  const userIds = [...new Set(walletRows.map((wallet) => wallet.user_id).filter(Boolean))];
  const profiles = userIds.length
    ? await supabase
        .from("user_profiles")
        .select("id,email,full_name,role")
        .in("id", userIds)
    : { data: [], error: null };

  if (profiles.error) {
    logPaymentError(profiles.error, "Unable to load wallet customer profiles.", requestContext(request));
  }

  const profileById = new Map((profiles.data ?? []).map((profile) => [String(profile.id), profile]));
  const customerWalletRows = walletRows.filter((wallet) => {
    const role = String(profileById.get(String(wallet.user_id))?.role ?? "customer").toLowerCase();
    return walletCustomerRoles.has(role);
  });
  const walletsWithProfiles = customerWalletRows.map((wallet) => ({
    ...wallet,
    user_profiles: profileById.get(String(wallet.user_id)) ?? null
  }));
  const visibleWalletIds = new Set(customerWalletRows.map((wallet) => String(wallet.id)));

  if (transactions.error && !isWalletSchemaMissing(transactions.error)) {
    logPaymentError(transactions.error, "Unable to load admin wallet transactions.", requestContext(request));
  }

  return NextResponse.json({
    wallets: walletsWithProfiles,
    transactions: transactions.error ? [] : (transactions.data ?? []).filter((transaction) => visibleWalletIds.has(String(transaction.wallet_id))),
    warning:
      transactions.error && isWalletSchemaMissing(transactions.error)
        ? "Wallet transaction storage is not installed yet."
        : profiles.error
          ? "Wallet balances loaded, but customer profile names could not be attached."
          : undefined
  });
}

export async function PATCH(request: Request) {
  const access = await requireRole(request, ["admin", "finance"]);
  if (!access.profile) return NextResponse.json({ error: access.error }, { status: access.status });
  if (access.error) return NextResponse.json({ error: access.error }, { status: access.status });

  const parsed = await parseJson(request, walletAdjustmentSchema, "Enter a valid wallet adjustment.");
  if (parsed.response) return parsed.response;

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Wallet operations are temporarily unavailable." }, { status: 503 });

  const profile = await supabase
    .from("user_profiles")
    .select("id,role,email,full_name")
    .eq("id", parsed.data.userId)
    .maybeSingle();

  if (profile.error) {
    logPaymentError(profile.error, "Unable to inspect wallet target profile.", requestContext(request, { userId: parsed.data.userId }));
    return NextResponse.json({ error: "Unable to inspect the user profile." }, { status: 500 });
  }
  if (!profile.data) {
    return NextResponse.json({ error: "Customer profile not found." }, { status: 404 });
  }
  const role = String(profile.data.role ?? "").toLowerCase();
  if (!walletCustomerRoles.has(role)) {
    return NextResponse.json({ error: "Manual customer wallet adjustments can only be applied to customer or merchant accounts." }, { status: 409 });
  }

  const wallet = await getOrCreateCustomerWallet(supabase, parsed.data.userId);
  if (wallet.error && isWalletSchemaMissing(wallet.error)) {
    return NextResponse.json({ error: "Wallet storage is not installed yet. Run the latest wallet SQL first." }, { status: 503 });
  }
  if (wallet.error || !wallet.wallet) {
    logPaymentError(wallet.error, "Unable to load wallet for admin adjustment.", requestContext(request, { userId: parsed.data.userId }));
    return NextResponse.json({ error: "Unable to load customer wallet." }, { status: 500 });
  }

  const reference = `ADMIN-WALLET-${parsed.data.transactionType.toUpperCase()}-${Date.now()}`;
  const inserted = await supabase
    .from("wallet_transactions")
    .insert({
      wallet_id: wallet.wallet.id,
      user_id: parsed.data.userId,
      transaction_type: parsed.data.transactionType,
      amount: parsed.data.amount,
      currency: wallet.wallet.currency ?? "NGN",
      reference,
      description: parsed.data.description,
      status: "PENDING",
      payment_provider: "admin",
      metadata: { actorId: access.profile.id, source: "admin_manual_adjustment" }
    })
    .select("*")
    .single();

  if (inserted.error || !inserted.data) {
    logPaymentError(inserted.error, "Unable to create wallet adjustment.", requestContext(request, { userId: parsed.data.userId }));
    return NextResponse.json({ error: "Unable to create wallet adjustment." }, { status: 500 });
  }

  const applied = await applyWalletTransaction(supabase, inserted.data as WalletTransaction, "COMPLETED", reference);
  if (applied.error) {
    logPaymentError(applied.error, "Unable to apply wallet adjustment.", requestContext(request, { userId: parsed.data.userId, reference }));
    return NextResponse.json({ error: "Unable to apply wallet adjustment." }, { status: 500 });
  }

  await writeAuditLog(supabase, {
    actor: access.profile,
    action: `wallet.${parsed.data.transactionType}`,
    entityType: "customer_wallet",
    entityId: wallet.wallet.id,
    metadata: { userId: parsed.data.userId, amount: parsed.data.amount, reference, description: parsed.data.description },
    request
  });

  return NextResponse.json({ ok: true, reference });
}
