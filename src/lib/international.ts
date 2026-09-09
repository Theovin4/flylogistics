export const supportedCurrencies = ["NGN", "USD", "EUR", "GBP"] as const;
export type SupportedCurrency = (typeof supportedCurrencies)[number];

export const freightModeOptions = [
  {
    value: "air_freight",
    label: "Air freight",
    detail: "Fast international movement for urgent documents, parcels, and commercial cargo."
  },
  {
    value: "sea_freight",
    label: "Sea freight",
    detail: "Cost-conscious ocean movement for heavier or less urgent international cargo."
  }
] as const;

export type InternationalFreightMode = (typeof freightModeOptions)[number]["value"];

export const freightClassificationOptions = [
  { value: "documents", label: "Documents" },
  { value: "general_cargo", label: "General cargo" },
  { value: "ecommerce_goods", label: "E-commerce goods" },
  { value: "electronics", label: "Electronics" },
  { value: "fashion", label: "Fashion and retail" },
  { value: "fragile", label: "Fragile cargo" },
  { value: "oversized", label: "Oversized cargo" },
  { value: "restricted_review", label: "Restricted item review" }
] as const;

export type FreightClassification = (typeof freightClassificationOptions)[number]["value"];

const ngnDisplayRates: Record<SupportedCurrency, number> = {
  NGN: 1,
  USD: 1500,
  EUR: 1620,
  GBP: 1900
};

export function normalizeCurrency(value?: string | null): SupportedCurrency {
  const normalized = String(value ?? "NGN").trim().toUpperCase();
  return supportedCurrencies.includes(normalized as SupportedCurrency) ? normalized as SupportedCurrency : "NGN";
}

export function normalizeFreightMode(value?: string | null): InternationalFreightMode {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "sea" || normalized === "ocean" || normalized === "ocean_freight" || normalized === "sea_freight") return "sea_freight";
  return "air_freight";
}

export function normalizeFreightClassification(value?: string | null): FreightClassification {
  const normalized = String(value ?? "general_cargo").trim().toLowerCase();
  return freightClassificationOptions.some((item) => item.value === normalized) ? normalized as FreightClassification : "general_cargo";
}

export function freightModeLabel(mode?: string | null) {
  const normalized = normalizeFreightMode(mode);
  return freightModeOptions.find((item) => item.value === normalized)?.label ?? "Air freight";
}

export function freightClassificationLabel(classification?: string | null) {
  const normalized = normalizeFreightClassification(classification);
  return freightClassificationOptions.find((item) => item.value === normalized)?.label ?? "General cargo";
}

export function formatInternationalMoney(amount: number, currency: SupportedCurrency) {
  const locale = currency === "NGN" ? "en-NG" : "en-US";
  return new Intl.NumberFormat(locale, {
    currency,
    maximumFractionDigits: currency === "NGN" ? 0 : 2,
    style: "currency"
  }).format(Number.isFinite(amount) ? amount : 0);
}

export function currencyDisplayFromNgn(amountNgn: number) {
  const safeAmount = Number.isFinite(amountNgn) ? amountNgn : 0;
  return Object.fromEntries(
    supportedCurrencies.map((currency) => {
      const converted = currency === "NGN" ? safeAmount : safeAmount / ngnDisplayRates[currency];
      return [currency, Math.round(converted * 100) / 100];
    })
  ) as Record<SupportedCurrency, number>;
}

export function formattedCurrencyDisplayFromNgn(amountNgn: number) {
  const amounts = currencyDisplayFromNgn(amountNgn);
  return Object.fromEntries(
    supportedCurrencies.map((currency) => [currency, formatInternationalMoney(amounts[currency], currency)])
  ) as Record<SupportedCurrency, string>;
}

export function internationalEtaHours(input: {
  freightMode?: string | null;
  deliveryCategory?: string | null;
  urgency?: string | null;
  weightKg?: number | null;
}) {
  const mode = normalizeFreightMode(input.freightMode);
  const urgency = String(input.urgency ?? "standard").toLowerCase();
  const weight = Math.max(0.1, Number(input.weightKg ?? 1));
  const importBuffer = String(input.deliveryCategory ?? "").includes("import") ? 24 : 0;
  const heavyBuffer = weight > 100 ? 48 : weight > 50 ? 24 : 0;

  if (mode === "sea_freight") {
    const base = 24 * 28 + importBuffer + heavyBuffer;
    if (urgency === "critical") return Math.max(24 * 18, base - 24 * 6);
    if (urgency === "priority") return Math.max(24 * 21, base - 24 * 3);
    return base;
  }

  const base = 24 * 7 + importBuffer + Math.floor(heavyBuffer / 2);
  if (urgency === "critical") return Math.max(72, base - 48);
  if (urgency === "priority") return Math.max(96, base - 24);
  return base;
}

export function etaLabelFromHours(hours: number) {
  if (hours <= 72) return `${hours}h`;
  const days = Math.ceil(hours / 24);
  return `${days} day${days === 1 ? "" : "s"}`;
}

export function buildInternationalOperationsSummary(input: {
  amountNgn: number;
  deliveryCategory?: string | null;
  freightMode?: string | null;
  quoteCurrency?: string | null;
  freightClassification?: string | null;
  weightKg?: number | null;
  packageValue?: number | null;
  customsInformation?: string | null;
  exportImportDocuments?: string | null;
  etaHours?: number | null;
}) {
  const mode = normalizeFreightMode(input.freightMode);
  const classification = normalizeFreightClassification(input.freightClassification);
  const quoteCurrency = normalizeCurrency(input.quoteCurrency);
  const etaHours = input.etaHours ?? internationalEtaHours({
    deliveryCategory: input.deliveryCategory,
    freightMode: mode,
    urgency: null,
    weightKg: input.weightKg
  });
  const currencyAmounts = currencyDisplayFromNgn(input.amountNgn);
  const formattedCurrencyAmounts = formattedCurrencyDisplayFromNgn(input.amountNgn);
  const documents = [
    "Commercial invoice",
    "Packing list",
    "Sender and receiver details",
    "Customs declaration",
    ...(classification === "restricted_review" ? ["Restricted item approval"] : []),
    ...(mode === "sea_freight" ? ["Bill of lading details"] : ["Air waybill details"])
  ];

  return {
    freightMode: mode,
    freightModeLabel: freightModeLabel(mode),
    freightClassification: classification,
    freightClassificationLabel: freightClassificationLabel(classification),
    quoteCurrency,
    quoteAmount: currencyAmounts[quoteCurrency],
    formattedQuoteAmount: formattedCurrencyAmounts[quoteCurrency],
    amountByCurrency: currencyAmounts,
    formattedByCurrency: formattedCurrencyAmounts,
    trackingMode: mode === "sea_freight" ? "cargo_ship" as const : "cargo_plane" as const,
    trackingLabel: mode === "sea_freight" ? "Cargo ship tracking" : "Cargo plane tracking",
    etaHours,
    etaLabel: etaLabelFromHours(etaHours),
    customsReviewRequired: true,
    commercialInvoiceRequired: true,
    customsDocuments: documents,
    documentationStatus: input.customsInformation || input.exportImportDocuments ? "Documentation started" : "Documentation required",
    declaredValue: input.packageValue ?? null
  };
}
