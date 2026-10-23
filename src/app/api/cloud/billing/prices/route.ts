import { NextResponse } from "next/server";
import { cloudPlanDefinitions, type CloudBillingPlan } from "@/lib/cloud-plans";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { enforceRateLimit } from "@/server/api";
import { resolveCloudPlanPrice } from "@/server/cloud-plan-prices";
import { requireCompanyRole } from "@/server/tenancy";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const limited = await enforceRateLimit(request, "cloud-billing-prices", { limit: 60, windowSeconds: 60 });
  if (limited) return limited;
  const access = await requireCompanyRole(request, ["owner", "admin", "dispatcher"]);
  if (!access.profile || !access.tenant || access.error) return NextResponse.json({ error: access.error }, { status: access.status });
  const supabase = getSupabaseAdmin();
  if (!supabase || !access.tenant.company) return NextResponse.json({ error: "Cloud billing prices are unavailable." }, { status: 503 });

  const requestedCurrency = access.tenant.company.billing_currency;
  const prices = await Promise.all((Object.keys(cloudPlanDefinitions) as CloudBillingPlan[]).map(async (plan) => {
    const resolved = await resolveCloudPlanPrice(supabase, { plan, requestedCurrency });
    return {
      plan,
      amount: resolved.price.amount,
      currency: resolved.price.currency,
      priceVersion: resolved.price.priceVersion,
      billingInterval: resolved.price.billingInterval,
      configured: resolved.price.configured,
      requestedCurrency: resolved.requestedCurrency,
      fallbackCurrency: resolved.fallback
    };
  }));

  return NextResponse.json({ operatingCurrency: access.tenant.company.currency, billingCurrency: requestedCurrency, prices });
}
