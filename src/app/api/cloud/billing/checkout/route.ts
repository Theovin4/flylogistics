import { NextResponse } from "next/server";
import { z } from "zod";
import type { CloudBillingPlan } from "@/lib/cloud-plans";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { enforceRateLimit, parseJson } from "@/server/api";
import { createCloudSubscriptionCheckout } from "@/server/cloud-billing";
import { CloudBillingCurrencyUnavailableError } from "@/server/cloud-plan-prices";
import { logPaymentError } from "@/server/monitoring";
import { requireCompanyRole } from "@/server/tenancy";

export const dynamic = "force-dynamic";

const checkoutSchema = z.object({
  plan: z.enum(["starter", "growth", "scale"])
});

export async function POST(request: Request) {
  const limited = await enforceRateLimit(request, "cloud-billing-checkout", { limit: 12, windowSeconds: 60 });
  if (limited) return limited;

  const access = await requireCompanyRole(request, ["owner", "admin"]);
  if (!access.profile || !access.tenant) return NextResponse.json({ error: access.error }, { status: access.status });
  if (access.error) return NextResponse.json({ error: access.error }, { status: access.status });

  const parsed = await parseJson(request, checkoutSchema, "Choose a valid Fly Logistics Cloud plan.");
  if (parsed.response) return parsed.response;

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Cloud billing is temporarily unavailable." }, { status: 503 });
  if (!access.tenant.company || !access.tenant.companyId) return NextResponse.json({ error: "Company workspace is not configured." }, { status: 409 });

  try {
    const checkout = await createCloudSubscriptionCheckout({
      supabase,
      company: {
        id: access.tenant.companyId,
        slug: access.tenant.company.slug,
        name: access.tenant.company.name,
        support_email: access.tenant.company.support_email,
        support_phone: access.tenant.company.support_phone,
        billing_currency: access.tenant.company.billing_currency,
        locale: access.tenant.company.locale
      },
      owner: {
        email: access.profile.email ?? access.tenant.company.support_email ?? "billing@flylogistics.com.ng",
        name: access.profile.full_name,
        phone: access.profile.phone
      },
      plan: parsed.data.plan as CloudBillingPlan
    });

    return NextResponse.json({
      ok: true,
      checkoutUrl: checkout.checkoutUrl,
      reference: checkout.txRef,
      amount: checkout.amount,
      currency: checkout.currency,
      priceVersion: checkout.priceVersion,
      provider: checkout.provider,
      requestedCurrency: checkout.requestedCurrency,
      fallbackCurrency: checkout.fallbackCurrency,
      company: checkout.company
    });
  } catch (error) {
    if (error instanceof CloudBillingCurrencyUnavailableError) {
      return NextResponse.json({ error: error.publicMessage, code: error.code }, { status: 409 });
    }
    logPaymentError(error, "Unable to create Fly Logistics Cloud subscription checkout.", {
      companyId: access.tenant.companyId,
      plan: parsed.data.plan
    });
    return NextResponse.json({ error: "Unable to prepare secure subscription checkout. Please try again shortly." }, { status: 500 });
  }
}
