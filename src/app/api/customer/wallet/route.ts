import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/request-auth";
import { canonicalSiteUrl } from "@/lib/site";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { enforceRateLimit, parseJson } from "@/server/api";
import { notifyAdmin } from "@/server/admin-notifications";
import { writeAuditLog } from "@/server/audit";
import { logPaymentError, requestContext } from "@/server/monitoring";
import { writeOperationalEvent } from "@/server/operational-events";
import { createFlutterwaveCheckout, FLUTTERWAVE_PAYMENT_PROVIDER } from "@/server/payments/flutterwave";
import { getTenantContextForProfile } from "@/server/tenancy";
import {
  createPendingWalletCredit,
  getWalletOverview,
  isWalletSchemaMissing,
  makeWalletFundingReference
} from "@/server/wallets";

export const dynamic = "force-dynamic";

const fundWalletSchema = z.object({
  amount: z.coerce.number().min(100).max(5_000_000),
  paymentProvider: z.literal("flutterwave").optional().default("flutterwave")
});

export async function GET(request: Request) {
  const limited = await enforceRateLimit(request, "customer-wallet", { limit: 80, windowSeconds: 60 });
  if (limited) return limited;

  const access = await requireRole(request, ["customer"]);
  if (!access.profile) return NextResponse.json({ error: access.error }, { status: access.status });
  if (access.error) return NextResponse.json({ error: access.error }, { status: access.status });

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Wallet is temporarily unavailable." }, { status: 503 });
  const tenant = await getTenantContextForProfile(supabase, access.profile);

  const overview = await getWalletOverview(supabase, access.profile.id, tenant.companyId);
  if (overview.error && isWalletSchemaMissing(overview.error)) {
    return NextResponse.json({ wallet: null, transactions: [], warning: "Customer wallet is temporarily unavailable." });
  }
  if (overview.error) {
    logPaymentError(overview.error, "Unable to load customer wallet.", requestContext(request, { userId: access.profile.id }));
    return NextResponse.json({ error: "Unable to load wallet." }, { status: 500 });
  }

  const response = NextResponse.json({ wallet: overview.wallet, transactions: overview.transactions });
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  response.headers.set("Vary", "Authorization, Cookie");
  return response;
}

export async function POST(request: Request) {
  const limited = await enforceRateLimit(request, "customer-wallet-fund", { limit: 12, windowSeconds: 60 });
  if (limited) return limited;

  const access = await requireRole(request, ["customer"]);
  if (!access.profile) return NextResponse.json({ error: access.error }, { status: access.status });
  if (access.error) return NextResponse.json({ error: access.error }, { status: access.status });

  const parsed = await parseJson(request, fundWalletSchema, "Enter a valid wallet funding amount.");
  if (parsed.response) return parsed.response;

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Wallet funding is temporarily unavailable." }, { status: 503 });
  const tenant = await getTenantContextForProfile(supabase, access.profile);

  const overview = await getWalletOverview(supabase, access.profile.id, tenant.companyId);
  if (overview.error && isWalletSchemaMissing(overview.error)) {
    return NextResponse.json({ error: "Wallet funding is temporarily unavailable." }, { status: 503 });
  }
  if (overview.error || !overview.wallet) {
    logPaymentError(overview.error, "Unable to prepare wallet funding.", requestContext(request, { userId: access.profile.id }));
    return NextResponse.json({ error: "Unable to prepare wallet funding." }, { status: 500 });
  }

  const amount = parsed.data.amount;
  const paymentProvider = parsed.data.paymentProvider;
  const reference = makeWalletFundingReference(access.profile.id);

  try {
    const checkoutInput = {
      txRef: reference,
      amount,
      currency: overview.wallet.currency ?? "NGN",
      redirectUrl: `${canonicalSiteUrl}/payment/${paymentProvider}/callback`,
      customer: {
        email: access.profile.email ?? "support@flylogistics.com.ng",
        name: access.profile.full_name ?? "Fly Logistics Customer",
        phone: access.profile.phone
      },
      description: "Fly Logistics Wallet funding",
      paymentPurpose: "wallet"
    } as const;
    const checkout = await createFlutterwaveCheckout(checkoutInput);

    const pending = await createPendingWalletCredit(supabase, {
      wallet: overview.wallet,
      userId: access.profile.id,
      amount,
      reference,
      description: "Wallet funding",
      companyId: tenant.companyId,
      paymentProvider: FLUTTERWAVE_PAYMENT_PROVIDER
    });

    if (pending.error) {
      logPaymentError(pending.error, "Unable to store pending wallet funding.", requestContext(request, { userId: access.profile.id, reference }));
      if (isWalletSchemaMissing(pending.error)) {
        return NextResponse.json({ error: "Wallet funding is temporarily unavailable." }, { status: 503 });
      }
      return NextResponse.json({ error: "Unable to prepare wallet funding. Please try again, or contact Fly Logistics support if it continues." }, { status: 500 });
    }

    await writeAuditLog(supabase, {
      actor: access.profile,
      action: "wallet.funding_started",
      entityType: "customer_wallet",
      entityId: overview.wallet.id,
      metadata: { amount, reference, provider: FLUTTERWAVE_PAYMENT_PROVIDER },
      request
    });

    await notifyAdmin(supabase, {
      title: "Wallet funding started",
      message: `${access.profile.email ?? "A customer"} started wallet funding for ${amount}.`,
      entityType: "customer_wallet",
      entityId: overview.wallet.id,
      metadata: { amount, reference, provider: FLUTTERWAVE_PAYMENT_PROVIDER },
      request
    });

    return NextResponse.json(checkout);
  } catch (error) {
    logPaymentError(error, "Unable to start wallet funding checkout.", requestContext(request, { userId: access.profile.id, reference }));
    await writeOperationalEvent(supabase, {
      category: "payment",
      severity: "warning",
      message: "Wallet funding checkout could not be started.",
      entityType: "customer_wallet",
      entityId: overview.wallet.id,
      metadata: {
        provider: FLUTTERWAVE_PAYMENT_PROVIDER,
        reference,
        reason: error instanceof Error ? error.message : String(error)
      },
      request
    });
    return NextResponse.json({ error: "Unable to prepare secure wallet funding. Please try again shortly." }, { status: 502 });
  }
}
