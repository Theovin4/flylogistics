import type { getSupabaseAdmin } from "@/lib/supabase-server";
import {
  inferStateCodeFromAddress,
  nigerianStates,
  normalizeStateCode,
  stateName,
  type NigerianStateCode,
  type PricingInput,
  type PricingQuote
} from "@/lib/pricing";
import {
  buildInternationalOperationsSummary,
  internationalEtaHours,
  normalizeFreightMode
} from "@/lib/international";

type SupabaseAdminClient = NonNullable<ReturnType<typeof getSupabaseAdmin>>;

type RouteRow = {
  pickup_state_code?: string | null;
  destination_state_code?: string | null;
  base_price?: number | string | null;
  price_per_kg?: number | string | null;
  estimated_eta_hours?: number | string | null;
  vehicle_type_code?: string | null;
  route_type?: string | null;
  is_active?: boolean | null;
  override_price?: number | string | null;
};

type AdjustmentRow = {
  key?: string | null;
  adjustment_type?: string | null;
  value?: number | string | null;
  is_active?: boolean | null;
};

type FuelRow = {
  percentage?: number | string | null;
  is_active?: boolean | null;
};

export const defaultVehicleTypes = [
  { code: "bike", name: "Dispatch bike", maxWeightKg: 15 },
  { code: "car", name: "Express car", maxWeightKg: 50 },
  { code: "van", name: "Cargo van", maxWeightKg: 700 },
  { code: "truck", name: "Freight truck", maxWeightKg: 12000 }
] as const;

const zoneDistance: Record<string, number> = {
  "South West": 210,
  "South East": 560,
  "South South": 610,
  "North Central": 720,
  "North West": 980,
  "North East": 1120
};

const LOCAL_INCLUDED_WEIGHT_KG = 2.5;
const SAME_STATE_BASE_PRICE = 5000;
const SAME_STATE_EXTRA_KG_RATE = 850;
const SAME_STATE_ETA_LABEL = "24-48 hr";
const SAME_STATE_ETA_HOURS = 48;
const INTERSTATE_BASE_PRICE = 8000;
const INTERSTATE_EXTRA_KG_RATE = 1200;
const INTERSTATE_ETA_LABEL = "48-96 hr";
const INTERSTATE_ETA_HOURS = 96;
const INTERNATIONAL_PRICE_MULTIPLIER = 1.1;
const INTERNATIONAL_STANDARD_MARKUP = 15000;
const INTERNATIONAL_LARGE_SHIPMENT_MARKUP = 20000;

function money(amount: number) {
  return new Intl.NumberFormat("en-NG", { currency: "NGN", maximumFractionDigits: 0, style: "currency" }).format(amount);
}

function asNumber(value: number | string | null | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function tableMissing(error: { code?: string; message?: string } | null | undefined) {
  const message = error?.message?.toLowerCase() ?? "";
  return error?.code === "42P01" || error?.code === "42703" || String(error?.code ?? "").startsWith("PGRST") || message.includes("could not find");
}

function effectiveState(inputState?: string | null, address?: string | null, fallback: NigerianStateCode = "LA") {
  return (normalizeStateCode(inputState) ?? inferStateCodeFromAddress(address) ?? fallback) as NigerianStateCode;
}

function vehicleForWeight(weightKg: number, category: string) {
  if (category === "food_snacks" || weightKg <= 15) return defaultVehicleTypes[0];
  if (weightKg <= 50) return defaultVehicleTypes[1];
  if (weightKg <= 700) return defaultVehicleTypes[2];
  return defaultVehicleTypes[3];
}

function urgencyMultiplier(urgency: PricingInput["urgency"]) {
  if (urgency === "critical") return 1.95;
  if (urgency === "priority") return 1.38;
  return 1;
}

function routeDistanceEstimate(pickupState: NigerianStateCode, destinationState: NigerianStateCode) {
  if (pickupState === destinationState) return 35;
  const pickupZone = nigerianStates.find((state) => state.code === pickupState)?.zone ?? "South West";
  const destinationZone = nigerianStates.find((state) => state.code === destinationState)?.zone ?? "South West";
  return Math.max(260, Math.round((zoneDistance[pickupZone] + zoneDistance[destinationZone]) / 2));
}

async function loadPricingRows(supabase: SupabaseAdminClient | null, pickupState: string, destinationState: string) {
  if (!supabase) return { route: null as RouteRow | null, adjustments: [] as AdjustmentRow[], fuel: null as FuelRow | null };

  const [routeResult, adjustmentsResult, fuelResult] = await Promise.all([
    supabase
      .from("logistics_routes")
      .select("pickup_state_code,destination_state_code,base_price,price_per_kg,estimated_eta_hours,vehicle_type_code,route_type,is_active,override_price")
      .eq("pickup_state_code", pickupState)
      .eq("destination_state_code", destinationState)
      .maybeSingle(),
    supabase
      .from("pricing_adjustments")
      .select("key,adjustment_type,value,is_active")
      .eq("is_active", true),
    supabase
      .from("fuel_surcharges")
      .select("percentage,is_active")
      .eq("is_active", true)
      .order("effective_from", { ascending: false })
      .limit(1)
      .maybeSingle()
  ]);

  return {
    route: tableMissing(routeResult.error) ? null : ((routeResult.data as RouteRow | null) ?? null),
    adjustments: tableMissing(adjustmentsResult.error) ? [] : ((adjustmentsResult.data ?? []) as AdjustmentRow[]),
    fuel: tableMissing(fuelResult.error) ? null : ((fuelResult.data as FuelRow | null) ?? null)
  };
}

export async function calculateLogisticsPrice(input: PricingInput, supabase: SupabaseAdminClient | null = null): Promise<PricingQuote> {
  const pickupState = effectiveState(input.pickupState, input.pickupAddress);
  const destinationState = effectiveState(input.destinationState, input.deliveryAddress, pickupState);
  const sameState = pickupState === destinationState;
  const weightKg = Math.max(0.1, Number(input.weightKg || 1));
  const category = input.deliveryCategory;
  const isInternationalImport = category === "international_import";
  const isInternationalExport = category === "international_export";
  const isInternational = isInternationalImport || isInternationalExport;
  const isFood = category === "food_snacks" || /food|snack|meal|grocery/i.test(input.packageType);
  const vehicle = isInternational
    ? { code: "international_freight", name: weightKg > 50 ? "International cargo freight" : "International express parcel", maxWeightKg: 100000 }
    : vehicleForWeight(weightKg, category);
  const { route, adjustments, fuel } = await loadPricingRows(supabase, pickupState, destinationState);

  const warnings: string[] = [];
  const terms = [
    "Terms and conditions apply.",
    "Final price can change after operations review if the package size, access conditions, waiting time, or route risk changes.",
    "Food/snacks are accepted for same-day delivery within the same state only.",
    "International shipments are subject to customs documentation, airline or carrier availability, duties, taxes, and prohibited item checks."
  ];

  const globalMultiplier = asNumber(adjustments.find((item) => item.key === "global_multiplier")?.value, 1);
  const holidaySurgePercent = asNumber(adjustments.find((item) => item.key === "holiday_surge")?.value, 0);
  const promotionalDiscountPercent = asNumber(adjustments.find((item) => item.key === "promotional_discount")?.value, 0);
  const fuelSurchargePercent = asNumber(fuel?.percentage, asNumber(adjustments.find((item) => item.key === "fuel_surcharge")?.value, 0));
  const urgentMultiplier = urgencyMultiplier(input.urgency);

  if (isInternational) {
    const origin = input.pickupCountry?.trim() || (isInternationalImport ? "Origin country" : "Nigeria");
    const destination = input.destinationCountry?.trim() || (isInternationalExport ? "Destination country" : "Nigeria");
    const freightMode = normalizeFreightMode(input.freightMode);
    const seaFreight = freightMode === "sea_freight";
    const routeBase = seaFreight
      ? isInternationalImport ? 185000 : 160000
      : isInternationalImport ? 115000 : 95000;
    const pricePerKg = seaFreight
      ? isInternationalImport ? 2600 : 2400
      : isInternationalImport ? 5200 : 4800;
    const weightCharge = Math.max(0, Math.round(weightKg * pricePerKg));
    const internationalMarkup = INTERNATIONAL_STANDARD_MARKUP + (weightKg > 50 ? INTERNATIONAL_LARGE_SHIPMENT_MARKUP : 0);
    const marketAverage = Math.round(routeBase + weightCharge);
    const flyPremium = Math.round(marketAverage + internationalMarkup);
    const adjusted = flyPremium * urgentMultiplier * globalMultiplier * (1 + fuelSurchargePercent / 100) * (1 + holidaySurgePercent / 100) * (1 - promotionalDiscountPercent / 100);
    const amount = Math.max(0, Math.round((adjusted * INTERNATIONAL_PRICE_MULTIPLIER) / 100) * 100);
    const etaHours = internationalEtaHours({
      deliveryCategory: input.deliveryCategory,
      freightMode,
      urgency: input.urgency,
      weightKg
    });
    const international = buildInternationalOperationsSummary({
      amountNgn: amount,
      deliveryCategory: input.deliveryCategory,
      freightMode,
      quoteCurrency: input.quoteCurrency,
      freightClassification: input.freightClassification,
      weightKg,
      packageValue: input.packageValue,
      customsInformation: input.customsInformation,
      exportImportDocuments: input.exportImportDocuments,
      etaHours
    });

    warnings.push("International pricing is an estimate until customs documents, freight classification, declared value, and airline or vessel availability are reviewed.");
    warnings.push(`${international.freightModeLabel} selected with ${international.trackingLabel.toLowerCase()}.`);
    if (isInternationalImport) warnings.push(`Import request noted from ${origin} into Nigeria.`);
    if (isInternationalExport) warnings.push(`Export request noted from Nigeria to ${destination}.`);

    return {
      amount,
      formattedAmount: money(amount),
      etaHours,
      etaLabel: international.etaLabel,
      vehicleType: vehicle.name,
      vehicleCode: vehicle.code,
      deliveryType: `${isInternationalImport ? "International import to Nigeria" : "International export from Nigeria"} - ${international.freightModeLabel}`,
      serviceAvailable: true,
      warnings,
      terms,
      currency: international.quoteCurrency,
      amountByCurrency: international.amountByCurrency,
      formattedByCurrency: international.formattedByCurrency,
      international,
      breakdown: {
        marketAverage,
        flyPremium,
        routeBase,
        weightCharge,
        urgencyMultiplier: urgentMultiplier,
        globalMultiplier,
        fuelSurchargePercent,
        holidaySurgePercent,
        promotionalDiscountPercent,
        internationalPricingMultiplier: INTERNATIONAL_PRICE_MULTIPLIER,
        routeOverrideApplied: false,
        internationalMarkup
      }
    };
  }

  let serviceAvailable = true;
  let deliveryType = sameState ? "Same-state delivery" : "Interstate delivery";
  if (isFood) {
    deliveryType = "Same-day food/snacks delivery";
    if (!sameState) {
      serviceAvailable = false;
      warnings.push("Food/snacks can only be booked for same-day delivery within the same state.");
    }
  } else if ((input.deliveryCategory === "standard_package" || input.deliveryCategory === "local_nigeria") && sameState) {
    deliveryType = "Same-state 24-48 hr delivery";
  } else if (!sameState) {
    deliveryType = "Interstate 48-96 hr delivery";
  }

  if (route?.is_active === false) {
    serviceAvailable = false;
    warnings.push(`The ${stateName(pickupState)} to ${stateName(destinationState)} route is currently disabled by operations.`);
  }

  const distanceKm = routeDistanceEstimate(pickupState, destinationState);
  const extraKgCount = Math.max(0, Math.ceil(weightKg - LOCAL_INCLUDED_WEIGHT_KG));
  const extraKgRate = sameState ? SAME_STATE_EXTRA_KG_RATE : INTERSTATE_EXTRA_KG_RATE;
  const routeBase = sameState ? SAME_STATE_BASE_PRICE : INTERSTATE_BASE_PRICE;
  const weightCharge = extraKgCount * extraKgRate;
  const marketAverage = routeBase;
  const flyPremium = Math.round(routeBase + weightCharge);
  const overridePrice = asNumber(route?.override_price, 0);

  const adjusted = overridePrice > 0
    ? overridePrice
    : flyPremium * globalMultiplier * (1 + fuelSurchargePercent / 100) * (1 + holidaySurgePercent / 100) * (1 - promotionalDiscountPercent / 100);
  const amount = Math.max(0, Math.round(adjusted / 50) * 50);
  const routeEta = asNumber(route?.estimated_eta_hours, 0);
  const etaHours = routeEta || (sameState ? SAME_STATE_ETA_HOURS : INTERSTATE_ETA_HOURS);
  const etaLabel = routeEta ? (routeEta <= 24 ? `${routeEta}h` : `${Math.ceil(routeEta / 24)} day${Math.ceil(routeEta / 24) === 1 ? "" : "s"}`) : (sameState ? SAME_STATE_ETA_LABEL : INTERSTATE_ETA_LABEL);

  return {
    amount,
    formattedAmount: money(amount),
    etaHours,
    etaLabel,
    vehicleType: vehicle.name,
    vehicleCode: route?.vehicle_type_code ?? vehicle.code,
    deliveryType,
    serviceAvailable,
    warnings,
    terms,
    breakdown: {
      marketAverage,
      flyPremium,
      routeBase,
      weightCharge,
      urgencyMultiplier: 1,
      globalMultiplier,
      fuelSurchargePercent,
      holidaySurgePercent,
      promotionalDiscountPercent,
      routeOverrideApplied: overridePrice > 0,
      includedWeightKg: LOCAL_INCLUDED_WEIGHT_KG,
      extraKgRate,
      extraKgCount,
      distanceKm
    }
  };
}
