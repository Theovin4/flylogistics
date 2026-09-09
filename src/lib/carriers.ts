export const carrierProviders = [
  "internal_fly_logistics",
  "sendbox",
  "fez_logistics",
  "dhl_future",
  "fedex_future",
  "ups_future",
  "easyship_inactive"
] as const;

export type CarrierProvider = (typeof carrierProviders)[number];

export const carrierProviderLabels: Record<CarrierProvider, string> = {
  internal_fly_logistics: "Fly Logistics",
  sendbox: "Sendbox",
  fez_logistics: "FEZ Logistics",
  dhl_future: "DHL future",
  fedex_future: "FedEx future",
  ups_future: "UPS future",
  easyship_inactive: "Easyship inactive"
};

export type CarrierRateQuote = {
  provider: CarrierProvider;
  serviceName: string;
  amount: number | null;
  currency: string;
  etaLabel?: string | null;
  rateId?: string | null;
  rawResponse?: unknown;
};

export function normalizeCarrierProvider(value: unknown): CarrierProvider {
  const normalized = String(value ?? "internal_fly_logistics").trim().toLowerCase();
  if (normalized === "easyship") return "easyship_inactive";
  if (normalized === "fez" || normalized === "fez_delivery" || normalized === "fezdelivery") return "fez_logistics";
  if (normalized === "dhl") return "dhl_future";
  if (normalized === "fedex") return "fedex_future";
  if (normalized === "ups") return "ups_future";
  return carrierProviders.includes(normalized as CarrierProvider)
    ? (normalized as CarrierProvider)
    : "internal_fly_logistics";
}

export function isExternalCarrierProvider(provider: CarrierProvider) {
  return provider === "sendbox" || provider === "fez_logistics";
}

export function isFutureCarrierProvider(provider: CarrierProvider) {
  return provider === "dhl_future" || provider === "fedex_future" || provider === "ups_future";
}

export function carrierStatusLabel(status: string | null | undefined) {
  return String(status ?? "internal")
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
