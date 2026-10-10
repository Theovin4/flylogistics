import type { SupabaseClient } from "@supabase/supabase-js";

type TenantRateCard = {
  id: string;
  name: string;
  service_type: string;
  origin_zone: string | null;
  destination_zone: string | null;
  base_price: number | string;
  included_weight_kg: number | string;
  extra_kg_price: number | string;
  currency: string;
  eta_min_hours: number | null;
  eta_max_hours: number | null;
};

function normalized(value?: string | null) {
  return String(value ?? "").trim().toLowerCase();
}

function zoneMatches(configured: string | null, actual?: string | null) {
  const rule = normalized(configured);
  return !rule || rule === "all" || rule === "*" || rule === normalized(actual);
}

export async function calculateTenantRate(
  supabase: SupabaseClient,
  input: {
    companyId: string;
    serviceType: string;
    pickupZone?: string | null;
    destinationZone?: string | null;
    weightKg: number;
  }
) {
  const result = await supabase
    .from("tenant_rate_cards")
    .select("id,name,service_type,origin_zone,destination_zone,base_price,included_weight_kg,extra_kg_price,currency,eta_min_hours,eta_max_hours")
    .eq("company_id", input.companyId)
    .eq("is_active", true)
    .eq("service_type", input.serviceType)
    .order("created_at", { ascending: false })
    .limit(50);

  if (result.error) {
    if (["42P01", "42703", "PGRST204"].includes(result.error.code ?? "")) return null;
    throw result.error;
  }

  const rate = (result.data as TenantRateCard[] | null)?.find(
    (item) => zoneMatches(item.origin_zone, input.pickupZone) && zoneMatches(item.destination_zone, input.destinationZone)
  );
  if (!rate) return null;

  const base = Number(rate.base_price ?? 0);
  const included = Math.max(0.1, Number(rate.included_weight_kg ?? 1));
  const extraPrice = Number(rate.extra_kg_price ?? 0);
  const extraWeight = Math.max(0, input.weightKg - included);
  const amount = Math.round((base + Math.ceil(extraWeight) * extraPrice) * 100) / 100;
  const etaLabel = rate.eta_min_hours && rate.eta_max_hours
    ? `${rate.eta_min_hours}-${rate.eta_max_hours} hours`
    : rate.eta_max_hours
      ? `Within ${rate.eta_max_hours} hours`
      : null;

  return { ...rate, amount, etaLabel, etaHours: rate.eta_max_hours ?? rate.eta_min_hours ?? null };
}
