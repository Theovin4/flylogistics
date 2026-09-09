import type { FreightClassification, InternationalFreightMode, SupportedCurrency } from "@/lib/international";

export const nigerianStates = [
  { code: "AB", name: "Abia", zone: "South East" },
  { code: "AD", name: "Adamawa", zone: "North East" },
  { code: "AK", name: "Akwa Ibom", zone: "South South" },
  { code: "AN", name: "Anambra", zone: "South East" },
  { code: "BA", name: "Bauchi", zone: "North East" },
  { code: "BY", name: "Bayelsa", zone: "South South" },
  { code: "BE", name: "Benue", zone: "North Central" },
  { code: "BO", name: "Borno", zone: "North East" },
  { code: "CR", name: "Cross River", zone: "South South" },
  { code: "DE", name: "Delta", zone: "South South" },
  { code: "EB", name: "Ebonyi", zone: "South East" },
  { code: "ED", name: "Edo", zone: "South South" },
  { code: "EK", name: "Ekiti", zone: "South West" },
  { code: "EN", name: "Enugu", zone: "South East" },
  { code: "FC", name: "Federal Capital Territory", zone: "North Central" },
  { code: "GO", name: "Gombe", zone: "North East" },
  { code: "IM", name: "Imo", zone: "South East" },
  { code: "JI", name: "Jigawa", zone: "North West" },
  { code: "KD", name: "Kaduna", zone: "North West" },
  { code: "KN", name: "Kano", zone: "North West" },
  { code: "KT", name: "Katsina", zone: "North West" },
  { code: "KE", name: "Kebbi", zone: "North West" },
  { code: "KO", name: "Kogi", zone: "North Central" },
  { code: "KW", name: "Kwara", zone: "North Central" },
  { code: "LA", name: "Lagos", zone: "South West" },
  { code: "NA", name: "Nasarawa", zone: "North Central" },
  { code: "NI", name: "Niger", zone: "North Central" },
  { code: "OG", name: "Ogun", zone: "South West" },
  { code: "ON", name: "Ondo", zone: "South West" },
  { code: "OS", name: "Osun", zone: "South West" },
  { code: "OY", name: "Oyo", zone: "South West" },
  { code: "PL", name: "Plateau", zone: "North Central" },
  { code: "RI", name: "Rivers", zone: "South South" },
  { code: "SO", name: "Sokoto", zone: "North West" },
  { code: "TA", name: "Taraba", zone: "North East" },
  { code: "YO", name: "Yobe", zone: "North East" },
  { code: "ZA", name: "Zamfara", zone: "North West" }
] as const;

export const deliveryTypeOptions = [
  {
    value: "local_nigeria",
    label: "Local delivery within Nigeria",
    detail: "Pickup and delivery inside Nigeria, including same-state and interstate movement."
  },
  {
    value: "international_import",
    label: "International delivery - Import",
    detail: "Move goods from any country into Nigeria with customs-aware operations review."
  },
  {
    value: "international_export",
    label: "International delivery - Export",
    detail: "Move goods from Nigeria to customers, partners, and businesses worldwide."
  }
] as const;

export const legacyDeliveryCategories = [
  { value: "food_snacks", label: "Food/snacks", detail: "Legacy same-state food and snacks category." },
  { value: "standard_package", label: "Standard package", detail: "Legacy standard package category." },
  { value: "interstate", label: "Interstate freight", detail: "Legacy interstate freight category." },
  { value: "documents", label: "Documents", detail: "Legacy document category." },
  { value: "bulk_freight", label: "Bulk freight", detail: "Legacy bulk freight category." }
] as const;

export const deliveryCategories = [...deliveryTypeOptions, ...legacyDeliveryCategories] as const;

export const pricingUrgencies = [
  { value: "standard", label: "Standard" },
  { value: "priority", label: "Priority" },
  { value: "critical", label: "Critical" }
] as const;

export type NigerianStateCode = (typeof nigerianStates)[number]["code"];
export type DeliveryCategory = (typeof deliveryCategories)[number]["value"];
export type PricingUrgency = (typeof pricingUrgencies)[number]["value"];

export const deliveryCategoryValues = deliveryCategories.map((item) => item.value) as [DeliveryCategory, ...DeliveryCategory[]];

export const shipmentTypeOptions = [
  { value: "local", label: "Local delivery" },
  { value: "interstate", label: "Interstate delivery" },
  { value: "international", label: "International delivery" }
] as const;

export type ShipmentType = (typeof shipmentTypeOptions)[number]["value"];

export function shipmentTypeFromDeliveryCategory(category?: string | null): ShipmentType {
  const normalized = String(category ?? "local_nigeria").toLowerCase();
  if (normalized.includes("international") || normalized.includes("import") || normalized.includes("export")) return "international";
  if (normalized.includes("interstate")) return "interstate";
  return "local";
}

export function isNigeriaCountry(value?: string | null) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return true;
  return ["nigeria", "ng", "nga", "federal republic of nigeria"].includes(normalized);
}

export function isInternationalDelivery(input: {
  shipmentType?: string | null;
  deliveryCategory?: string | null;
  pickupCountry?: string | null;
  destinationCountry?: string | null;
}) {
  const type = String(input.shipmentType ?? "").toLowerCase();
  const category = String(input.deliveryCategory ?? "").toLowerCase();
  if (category.includes("international") || category.includes("import") || category.includes("export")) return true;
  if (category.includes("local") || category.includes("food") || category.includes("standard")) return false;
  const hasPickupCountry = Boolean(String(input.pickupCountry ?? "").trim());
  const hasDestinationCountry = Boolean(String(input.destinationCountry ?? "").trim());
  if (!hasPickupCountry && !hasDestinationCountry) return false;
  if (!isNigeriaCountry(input.pickupCountry) || !isNigeriaCountry(input.destinationCountry)) return true;
  return type.includes("international");
}

export type PricingInput = {
  pickupState?: string | null;
  destinationState?: string | null;
  pickupCountry?: string | null;
  destinationCountry?: string | null;
  pickupAddress?: string | null;
  deliveryAddress?: string | null;
  packageType: string;
  urgency: PricingUrgency;
  weightKg: number;
  deliveryCategory: DeliveryCategory;
  freightMode?: InternationalFreightMode | string | null;
  quoteCurrency?: SupportedCurrency | string | null;
  freightClassification?: FreightClassification | string | null;
  packageValue?: number | null;
  customsInformation?: string | null;
  exportImportDocuments?: string | null;
};

export type PricingQuote = {
  amount: number;
  formattedAmount: string;
  etaHours: number;
  etaLabel: string;
  vehicleType: string;
  vehicleCode: string;
  deliveryType: string;
  serviceAvailable: boolean;
  warnings: string[];
  terms: string[];
  currency?: SupportedCurrency;
  amountByCurrency?: Record<SupportedCurrency, number>;
  formattedByCurrency?: Record<SupportedCurrency, string>;
  international?: {
    freightMode: InternationalFreightMode;
    freightModeLabel: string;
    freightClassification: FreightClassification;
    freightClassificationLabel: string;
    quoteCurrency: SupportedCurrency;
    quoteAmount: number;
    formattedQuoteAmount: string;
    amountByCurrency: Record<SupportedCurrency, number>;
    formattedByCurrency: Record<SupportedCurrency, string>;
    trackingMode: "cargo_plane" | "cargo_ship";
    trackingLabel: string;
    etaHours: number;
    etaLabel: string;
    customsReviewRequired: boolean;
    commercialInvoiceRequired: boolean;
    customsDocuments: string[];
    documentationStatus: string;
    declaredValue: number | null;
  };
  breakdown: {
    marketAverage: number;
    flyPremium: number;
    routeBase: number;
    weightCharge: number;
    urgencyMultiplier: number;
    globalMultiplier: number;
    fuelSurchargePercent: number;
    holidaySurgePercent: number;
    promotionalDiscountPercent: number;
    routeOverrideApplied: boolean;
    flyPriceReduction?: number;
    includedWeightKg?: number;
    internationalPricingMultiplier?: number;
    fezBaseRate?: number;
    flyLocalMarkup?: number;
    extraKgRate?: number;
    extraKgCount?: number;
    internationalMarkup?: number;
    distanceKm?: number;
  };
};

export function normalizeStateCode(value?: string | null) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return null;
  const state = nigerianStates.find((item) => item.code.toLowerCase() === normalized || item.name.toLowerCase() === normalized);
  return state?.code ?? null;
}

export function inferStateCodeFromAddress(address?: string | null) {
  const normalized = String(address ?? "").toLowerCase();
  if (!normalized) return null;
  const state = nigerianStates.find((item) => normalized.includes(item.name.toLowerCase()) || normalized.includes(` ${item.code.toLowerCase()} `));
  return state?.code ?? null;
}

export function stateName(code?: string | null) {
  return nigerianStates.find((item) => item.code === code)?.name ?? code ?? "Unknown state";
}
