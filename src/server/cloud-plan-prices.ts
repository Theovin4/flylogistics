import { cleanEnv } from "@/lib/env";
import {
  cloudPlanDefinitions,
  legacyNgnCloudPlanPrices,
  type CloudBillingPlan,
  type CloudPlanPrice
} from "@/lib/cloud-plans";
import { normalizeCurrencyCode, supportedCloudBillingCurrencies, type CloudBillingCurrency } from "@/lib/tenant-locale";
import type { getSupabaseAdmin } from "@/lib/supabase-server";

type SupabaseAdminClient = NonNullable<ReturnType<typeof getSupabaseAdmin>>;

type PriceRow = {
  id: string;
  plan: CloudBillingPlan;
  currency: string;
  amount: number | string;
  provider: "flutterwave";
  provider_plan_id: string;
  price_version: string;
  billing_interval: "monthly";
  active: boolean;
  effective_from: string;
};

function tableMissing(error: { code?: string; message?: string } | null | undefined) {
  const message = error?.message?.toLowerCase() ?? "";
  return ["42P01", "42703", "PGRST204"].includes(error?.code ?? "") || message.includes("could not find");
}

export function legacyNgnCloudPrice(plan: CloudBillingPlan): CloudPlanPrice {
  const legacy = legacyNgnCloudPlanPrices[plan];
  const providerPlanId = cleanEnv(process.env[legacy.envPlanKey]);
  return {
    plan,
    amount: legacy.amount,
    currency: legacy.currency,
    billingInterval: legacy.billingInterval,
    priceVersion: legacy.priceVersion,
    provider: legacy.provider,
    providerPlanId: providerPlanId ?? null,
    configured: Boolean(providerPlanId)
  };
}

function rowToPrice(row: PriceRow): CloudPlanPrice {
  return {
    plan: row.plan,
    amount: Number(row.amount),
    currency: row.currency,
    billingInterval: row.billing_interval,
    priceVersion: row.price_version,
    provider: row.provider,
    providerPlanId: row.provider_plan_id,
    configured: Boolean(row.active && row.provider_plan_id)
  };
}

async function activePrice(
  supabase: SupabaseAdminClient,
  plan: CloudBillingPlan,
  currency: string
) {
  const result = await supabase
    .from("cloud_plan_prices")
    .select("id,plan,currency,amount,provider,provider_plan_id,price_version,billing_interval,active,effective_from")
    .eq("plan", plan)
    .eq("currency", currency)
    .eq("active", true)
    .lte("effective_from", new Date().toISOString())
    .order("effective_from", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (result.error) {
    if (tableMissing(result.error)) return null;
    throw result.error;
  }
  return result.data ? rowToPrice(result.data as PriceRow) : null;
}

export async function resolveCloudPlanPrice(
  supabase: SupabaseAdminClient,
  input: { plan: CloudBillingPlan; requestedCurrency?: string | null }
) {
  const requestedCurrency = normalizeCurrencyCode(input.requestedCurrency, "NGN");
  const requested = await activePrice(supabase, input.plan, requestedCurrency);
  if (requested?.configured) return { price: requested, requestedCurrency, fallback: false };

  const fallbackRow = requestedCurrency === "NGN" ? null : await activePrice(supabase, input.plan, "NGN");
  if (fallbackRow?.configured) return { price: fallbackRow, requestedCurrency, fallback: true };

  const legacy = legacyNgnCloudPrice(input.plan);
  return { price: legacy, requestedCurrency, fallback: requestedCurrency !== "NGN" };
}

export async function listPublicCloudPlanPrices(supabase: SupabaseAdminClient | null) {
  const rows: PriceRow[] = [];
  if (supabase) {
    const result = await supabase
      .from("cloud_plan_prices")
      .select("id,plan,currency,amount,provider,provider_plan_id,price_version,billing_interval,active,effective_from")
      .eq("active", true)
      .lte("effective_from", new Date().toISOString())
      .order("effective_from", { ascending: false });
    if (!result.error && result.data) rows.push(...result.data as PriceRow[]);
    else if (result.error && !tableMissing(result.error)) throw result.error;
  }

  const catalog = new Map<string, CloudPlanPrice>();
  for (const row of rows) {
    const price = rowToPrice(row);
    if (price.configured) catalog.set(`${price.currency}:${price.plan}`, price);
  }
  for (const plan of Object.keys(cloudPlanDefinitions) as CloudBillingPlan[]) {
    const legacy = legacyNgnCloudPrice(plan);
    if (legacy.configured && !catalog.has(`NGN:${plan}`)) catalog.set(`NGN:${plan}`, legacy);
  }

  const currencies = supportedCloudBillingCurrencies.filter((currency) =>
    (Object.keys(cloudPlanDefinitions) as CloudBillingPlan[]).every((plan) => catalog.has(`${currency}:${plan}`))
  );
  return {
    currencies,
    prices: currencies.flatMap((currency) =>
      (Object.keys(cloudPlanDefinitions) as CloudBillingPlan[]).map((plan) => catalog.get(`${currency}:${plan}`)!)
    )
  } as { currencies: CloudBillingCurrency[]; prices: CloudPlanPrice[] };
}
