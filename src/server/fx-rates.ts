import { normalizeCurrencyCode } from "@/lib/tenant-locale";
import type { getSupabaseAdmin } from "@/lib/supabase-server";

type SupabaseAdminClient = NonNullable<ReturnType<typeof getSupabaseAdmin>>;

export type FxQuote = {
  baseCurrency: string;
  quoteCurrency: string;
  rate: number;
  provider: string;
  retrievedAt: string;
  stale: boolean;
};

export interface FxRateProvider {
  readonly name: string;
  getRate(baseCurrency: string, quoteCurrency: string): Promise<{ rate: number; retrievedAt?: string }>;
}

const DEFAULT_MAX_AGE_MS = 18 * 60 * 60 * 1000;

function validRate(value: unknown) {
  const rate = Number(value);
  return Number.isFinite(rate) && rate > 0 ? rate : null;
}

export async function getCachedFxRate(
  supabase: SupabaseAdminClient,
  input: {
    baseCurrency: string;
    quoteCurrency: string;
    provider?: FxRateProvider;
    maxAgeMs?: number;
    now?: Date;
  }
): Promise<FxQuote | null> {
  const baseCurrency = normalizeCurrencyCode(input.baseCurrency, "USD");
  const quoteCurrency = normalizeCurrencyCode(input.quoteCurrency, "USD");
  const now = input.now ?? new Date();
  if (baseCurrency === quoteCurrency) {
    return { baseCurrency, quoteCurrency, rate: 1, provider: "identity", retrievedAt: now.toISOString(), stale: false };
  }

  const cached = await supabase
    .from("cloud_fx_rates")
    .select("base_currency,quote_currency,rate,provider,retrieved_at")
    .eq("base_currency", baseCurrency)
    .eq("quote_currency", quoteCurrency)
    .order("retrieved_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const cachedRate = validRate(cached.data?.rate);
  const cachedAt = cached.data?.retrieved_at ? new Date(cached.data.retrieved_at) : null;
  const stale = !cachedAt || now.getTime() - cachedAt.getTime() > (input.maxAgeMs ?? DEFAULT_MAX_AGE_MS);
  if (!cached.error && cachedRate && !stale) {
    return {
      baseCurrency,
      quoteCurrency,
      rate: cachedRate,
      provider: String(cached.data?.provider ?? "cache"),
      retrievedAt: cachedAt!.toISOString(),
      stale: false
    };
  }

  if (!input.provider) {
    return cachedRate && cachedAt ? {
      baseCurrency,
      quoteCurrency,
      rate: cachedRate,
      provider: String(cached.data?.provider ?? "cache"),
      retrievedAt: cachedAt.toISOString(),
      stale: true
    } : null;
  }

  const fresh = await input.provider.getRate(baseCurrency, quoteCurrency);
  const rate = validRate(fresh.rate);
  if (!rate) throw new Error("FX provider returned an invalid rate.");
  const retrievedAt = fresh.retrievedAt ? new Date(fresh.retrievedAt) : now;
  if (!Number.isFinite(retrievedAt.getTime())) throw new Error("FX provider returned an invalid retrieval time.");

  const saved = await supabase.from("cloud_fx_rates").upsert({
    base_currency: baseCurrency,
    quote_currency: quoteCurrency,
    rate,
    provider: input.provider.name,
    retrieved_at: retrievedAt.toISOString(),
    updated_at: now.toISOString()
  }, { onConflict: "base_currency,quote_currency,provider" });
  if (saved.error) throw saved.error;

  return { baseCurrency, quoteCurrency, rate, provider: input.provider.name, retrievedAt: retrievedAt.toISOString(), stale: false };
}

export function estimateWithFx(amount: number, quote: FxQuote) {
  if (!Number.isFinite(amount)) throw new Error("A finite source amount is required for an FX estimate.");
  return Math.round(amount * quote.rate * 100) / 100;
}
