import { Country } from "country-state-city";

export const DEFAULT_TENANT_COUNTRY = "NG";
export const DEFAULT_TENANT_TIMEZONE = "Africa/Lagos";
export const DEFAULT_TENANT_CURRENCY = "NGN";
export const DEFAULT_TENANT_LOCALE = "en-NG";

export const supportedCloudBillingCurrencies = ["NGN", "USD", "GBP", "EUR", "GHS", "KES", "ZAR"] as const;
export type CloudBillingCurrency = (typeof supportedCloudBillingCurrencies)[number];

const localeByCountry: Record<string, string> = {
  CA: "en-CA",
  CN: "zh-CN",
  FR: "fr-FR",
  GB: "en-GB",
  GH: "en-GH",
  IN: "en-IN",
  KE: "en-KE",
  NG: "en-NG",
  US: "en-US",
  ZA: "en-ZA"
};

function canonicalLocale(locale?: string | null) {
  try {
    return Intl.getCanonicalLocales(locale?.trim() || DEFAULT_TENANT_LOCALE)[0] ?? DEFAULT_TENANT_LOCALE;
  } catch {
    return DEFAULT_TENANT_LOCALE;
  }
}

export function normalizeCountryCode(value?: string | null) {
  const normalized = String(value ?? "").trim();
  if (!normalized) return null;
  const byCode = Country.getCountryByCode(normalized.toUpperCase());
  if (byCode) return byCode.isoCode.toUpperCase();
  const byName = Country.getAllCountries().find((country) => country.name.toLowerCase() === normalized.toLowerCase());
  return byName?.isoCode.toUpperCase() ?? null;
}

export function defaultLocaleForCountry(country?: string | null) {
  const code = normalizeCountryCode(country) ?? DEFAULT_TENANT_COUNTRY;
  return localeByCountry[code] ?? `en-${code}`;
}

export function normalizeTenantLocale(locale?: string | null, country?: string | null) {
  return canonicalLocale(locale || defaultLocaleForCountry(country));
}

export function isValidIanaTimezone(value?: string | null) {
  const timezone = String(value ?? "").trim();
  if (!timezone || /^GMT[+-]/i.test(timezone) || /^[+-]\d{2}:?\d{2}$/.test(timezone)) return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone: timezone }).format(0);
    return timezone === "UTC" || timezone.includes("/");
  } catch {
    return false;
  }
}

export function normalizeTenantTimezone(value?: string | null) {
  const timezone = String(value ?? "").trim();
  return isValidIanaTimezone(timezone) ? timezone : "UTC";
}

export function isValidCurrencyCode(value?: string | null) {
  const currency = String(value ?? "").trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) return false;
  try {
    new Intl.NumberFormat("en", { style: "currency", currency }).format(0);
    return true;
  } catch {
    return false;
  }
}

export function normalizeCurrencyCode(value?: string | null, fallback = DEFAULT_TENANT_CURRENCY) {
  const currency = String(value ?? "").trim().toUpperCase();
  return isValidCurrencyCode(currency) ? currency : fallback;
}

export function suggestedCurrencyForCountry(country?: string | null) {
  const code = normalizeCountryCode(country);
  const currency = code ? Country.getCountryByCode(code)?.currency : null;
  return normalizeCurrencyCode(currency, DEFAULT_TENANT_CURRENCY);
}

export function suggestedBillingCurrencyForCountry(country?: string | null): CloudBillingCurrency {
  const operational = suggestedCurrencyForCountry(country);
  return supportedCloudBillingCurrencies.includes(operational as CloudBillingCurrency)
    ? operational as CloudBillingCurrency
    : "USD";
}

function validDate(value: string | number | Date | null | undefined) {
  if (value === null || value === undefined || value === "") return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function dateOptions(
  timezone?: string | null,
  options: Intl.DateTimeFormatOptions = {}
): Intl.DateTimeFormatOptions {
  return { ...options, timeZone: normalizeTenantTimezone(timezone) };
}

export function formatMoney(
  amount: number | string | null | undefined,
  currency?: string | null,
  locale?: string | null,
  options: Omit<Intl.NumberFormatOptions, "style" | "currency"> = {}
) {
  const numeric = Number(amount ?? 0);
  const safeAmount = Number.isFinite(numeric) ? numeric : 0;
  const safeCurrency = normalizeCurrencyCode(currency);
  return new Intl.NumberFormat(canonicalLocale(locale), {
    style: "currency",
    currency: safeCurrency,
    ...options
  }).format(safeAmount);
}

export function formatTenantDate(
  value: string | number | Date | null | undefined,
  timezone?: string | null,
  locale?: string | null,
  fallback = "Not scheduled"
) {
  const date = validDate(value);
  if (!date) return fallback;
  return new Intl.DateTimeFormat(canonicalLocale(locale), dateOptions(timezone, { dateStyle: "medium" })).format(date);
}

export function formatTenantTime(
  value: string | number | Date | null | undefined,
  timezone?: string | null,
  locale?: string | null,
  fallback = "Not scheduled"
) {
  const date = validDate(value);
  if (!date) return fallback;
  return new Intl.DateTimeFormat(canonicalLocale(locale), dateOptions(timezone, { timeStyle: "short" })).format(date);
}

export function formatTenantDateTime(
  value: string | number | Date | null | undefined,
  timezone?: string | null,
  locale?: string | null,
  fallback = "Not scheduled"
) {
  const date = validDate(value);
  if (!date) return fallback;
  return new Intl.DateTimeFormat(canonicalLocale(locale), dateOptions(timezone, { dateStyle: "medium", timeStyle: "short" })).format(date);
}

export function tenantCountryOptions() {
  return Country.getAllCountries()
    .map((country) => ({ code: country.isoCode.toUpperCase(), name: country.name, currency: country.currency }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function tenantTimezoneOptions() {
  const intl = Intl as typeof Intl & { supportedValuesOf?: (key: "timeZone") => string[] };
  const values = intl.supportedValuesOf?.("timeZone") ?? [
    "Africa/Johannesburg", "Africa/Lagos", "Africa/Nairobi", "America/New_York", "America/Toronto",
    "Asia/Dubai", "Asia/Kolkata", "Asia/Shanghai", "Europe/London", "Europe/Paris", "UTC"
  ];
  return [...new Set(["UTC", ...values])];
}

export function tenantCurrencyOptions() {
  const intl = Intl as typeof Intl & { supportedValuesOf?: (key: "currency") => string[] };
  return intl.supportedValuesOf?.("currency") ?? [...supportedCloudBillingCurrencies];
}
