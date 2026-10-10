export const MERCHANT_DEFAULT_DISCOUNT_RATE = 0.05;
export const MERCHANT_PRICING_RULE_VERSION = "merchant-5pct-v1";

type MerchantPricingAccount = {
  status?: string | null;
  discount_rate?: number | string | null;
};

export type MerchantPrice = {
  standardPrice: number;
  discountableAmount: number;
  discountRate: number;
  discountAmount: number;
  finalPrice: number;
  pricingRuleVersion: string;
};

function money(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

export function resolveMerchantPrice(standardPrice: number, account: MerchantPricingAccount | null | undefined): MerchantPrice {
  const normalizedStandard = Math.round(money(standardPrice));
  const active = String(account?.status ?? "").trim().toUpperCase() === "ACTIVE";
  const configuredRate = money(account?.discount_rate);
  const discountRate = active
    ? Math.min(configuredRate > 0 ? configuredRate : MERCHANT_DEFAULT_DISCOUNT_RATE, MERCHANT_DEFAULT_DISCOUNT_RATE)
    : 0;
  const discountableAmount = normalizedStandard;
  const discountAmount = Math.round(discountableAmount * discountRate);

  return {
    standardPrice: normalizedStandard,
    discountableAmount,
    discountRate,
    discountAmount,
    finalPrice: Math.max(0, normalizedStandard - discountAmount),
    pricingRuleVersion: MERCHANT_PRICING_RULE_VERSION
  };
}

