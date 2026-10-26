export type CloudBillingPlan = "starter" | "growth" | "scale";
export type CloudBrandCapability = "basic_branding" | "advanced_branding" | "email_branding" | "custom_domain" | "remove_platform_branding";
export type CloudFeature =
  | "shipment_management"
  | "customer_portal"
  | "tracking"
  | "basic_analytics"
  | "advanced_analytics"
  | "ai_dispatch"
  | "whatsapp_notifications"
  | "api_access"
  | "basic_branding"
  | "advanced_branding"
  | "email_branding"
  | "custom_domain"
  | "remove_platform_branding"
  | "custom_integrations"
  | "priority_support"
  | "dedicated_account_management"
  | "rates"
  | "operations"
  | "team_management";

export const cloudIntegrationEvents = ["shipment.created", "shipment.status_changed"] as const;

export type CloudAccessState = "internal" | "trial_active" | "active" | "restricted";

export type CloudEntitlements = {
  plan: CloudBillingPlan;
  billingStatus: string;
  trialActive: boolean;
  accessState: CloudAccessState;
  limits: { users: number | null; drivers: number | null };
  features: ReadonlySet<CloudFeature>;
};

export type CloudEntitlementCompany = {
  id?: string | null;
  status?: string | null;
  plan?: string | null;
  subscription_plan?: string | null;
  subscription_status?: string | null;
  trial_ends_at?: string | null;
  subscription_renews_at?: string | null;
};

export const CLOUD_TRIAL_DAYS = 14;

export type CloudPlanDefinition = {
  name: string;
  billingInterval: "monthly";
  monthlyShipments: string;
  maxUsers: number | null;
  maxDrivers: number | null;
  description: string;
  features: string[];
};

export type CloudPlanPrice = {
  plan: CloudBillingPlan;
  amount: number;
  currency: string;
  billingInterval: "monthly";
  priceVersion: string;
  provider: "flutterwave";
  providerPlanId: string | null;
  configured: boolean;
};

export const cloudPlanDefinitions: Record<CloudBillingPlan, CloudPlanDefinition> = {
  starter: {
    name: "Starter",
    billingInterval: "monthly",
    monthlyShipments: "Operational starter workspace",
    maxUsers: 5,
    maxDrivers: 10,
    description: "For lean logistics teams that need shipment management, tracking, and customer visibility.",
    features: ["Maximum 5 users", "Maximum 10 drivers", "Shipment management", "Customer portal", "Tracking", "Basic analytics", "Email support"]
  },
  growth: {
    name: "Growth",
    billingInterval: "monthly",
    monthlyShipments: "Growing operations workspace",
    maxUsers: 20,
    maxDrivers: 100,
    description: "For active operators scaling dispatch, analytics, AI recommendations, and customer communications.",
    features: ["Maximum 20 users", "Maximum 100 drivers", "Shipment management", "Customer portal", "Tracking", "Advanced analytics", "AI dispatch", "WhatsApp notifications", "API access", "Priority support"]
  },
  scale: {
    name: "Scale",
    billingInterval: "monthly",
    monthlyShipments: "Enterprise logistics workspace",
    maxUsers: null,
    maxDrivers: null,
    description: "For high-volume logistics companies that need unlimited teams, white-label controls, and dedicated support.",
    features: ["Unlimited users", "Unlimited drivers", "Shipment management", "Customer portal", "Tracking", "Advanced analytics", "AI dispatch", "WhatsApp notifications", "API access", "White-label branding", "Custom integrations", "Dedicated account management"]
  }
};

export const legacyNgnCloudPlanPrices: Record<CloudBillingPlan, Omit<CloudPlanPrice, "providerPlanId" | "configured"> & { envPlanKey: string }> = {
  starter: { plan: "starter", amount: 25000, currency: "NGN", billingInterval: "monthly", priceVersion: "2026-ngn-v1", provider: "flutterwave", envPlanKey: "FLUTTERWAVE_CLOUD_STARTER_PLAN_ID" },
  growth: { plan: "growth", amount: 75000, currency: "NGN", billingInterval: "monthly", priceVersion: "2026-ngn-v1", provider: "flutterwave", envPlanKey: "FLUTTERWAVE_CLOUD_GROWTH_PLAN_ID" },
  scale: { plan: "scale", amount: 200000, currency: "NGN", billingInterval: "monthly", priceVersion: "2026-ngn-v1", provider: "flutterwave", envPlanKey: "FLUTTERWAVE_CLOUD_SCALE_PLAN_ID" }
};

/** Compatibility projection for existing UI code. New billing code must use the server-side price catalogue. */
export const cloudBillingPlans = Object.fromEntries(
  (Object.keys(cloudPlanDefinitions) as CloudBillingPlan[]).map((plan) => [plan, {
    ...cloudPlanDefinitions[plan],
    amount: legacyNgnCloudPlanPrices[plan].amount,
    currency: "NGN" as const,
    envPlanKey: legacyNgnCloudPlanPrices[plan].envPlanKey
  }])
) as Record<CloudBillingPlan, CloudPlanDefinition & { amount: number; currency: "NGN"; envPlanKey: string }>;

export function cloudTrialEndsAt(start = new Date()) {
  const date = new Date(start);
  date.setDate(date.getDate() + CLOUD_TRIAL_DAYS);
  return date.toISOString();
}

export function cloudTrialDaysRemaining(trialEndsAt?: string | null) {
  if (!trialEndsAt) return 0;
  const diff = new Date(trialEndsAt).getTime() - Date.now();
  if (!Number.isFinite(diff) || diff <= 0) return 0;
  return Math.ceil(diff / 86_400_000);
}

export function getCloudBillingPlanKey(plan: string | null | undefined): CloudBillingPlan {
  const normalized = String(plan ?? "starter").toLowerCase();
  if (normalized === "growth" || normalized === "scale" || normalized === "starter") return normalized;
  return "starter";
}

export function getCloudBillingPlan(plan: string | null | undefined) {
  return cloudBillingPlans[getCloudBillingPlanKey(plan)];
}

export function cloudLimitLabel(limit: number | null, noun: string) {
  return limit === null ? `Unlimited ${noun}` : `Maximum ${limit} ${noun}`;
}

export function isCloudPlanLimitReached(currentCount: number, limit: number | null) {
  return limit !== null && currentCount >= limit;
}

const cloudBrandCapabilities: Record<CloudBillingPlan, ReadonlySet<CloudBrandCapability>> = {
  starter: new Set(["basic_branding"]),
  growth: new Set(["basic_branding", "advanced_branding", "email_branding"]),
  scale: new Set(["basic_branding", "advanced_branding", "email_branding", "custom_domain", "remove_platform_branding"])
};

const starterFeatures: CloudFeature[] = [
  "shipment_management", "customer_portal", "tracking", "basic_analytics", "basic_branding", "rates", "operations", "team_management"
];

export const cloudFeatureMatrix: Record<CloudBillingPlan, ReadonlySet<CloudFeature>> = {
  starter: new Set(starterFeatures),
  growth: new Set([
    ...starterFeatures,
    "advanced_analytics", "ai_dispatch", "whatsapp_notifications", "api_access", "advanced_branding", "email_branding", "priority_support"
  ]),
  scale: new Set([
    ...starterFeatures,
    "advanced_analytics", "ai_dispatch", "whatsapp_notifications", "api_access", "advanced_branding", "email_branding", "priority_support",
    "custom_domain", "remove_platform_branding", "custom_integrations", "dedicated_account_management"
  ])
};

const allCloudFeatures = new Set<CloudFeature>(Object.values(cloudFeatureMatrix).flatMap((features) => [...features]));

function validFutureDate(value: string | null | undefined, now: Date) {
  if (!value) return false;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) && timestamp > now.getTime();
}

export function resolveCloudEntitlements(
  company: CloudEntitlementCompany | null | undefined,
  options: { now?: Date; internalCompanyId?: string | null } = {}
): CloudEntitlements {
  const now = options.now ?? new Date();
  const plan = getCloudBillingPlanKey(company?.subscription_plan ?? company?.plan);
  const configuredPlan = cloudPlanDefinitions[plan];
  const storedStatus = String(company?.subscription_status ?? "pending").trim().toLowerCase();
  const companyStatus = String(company?.status ?? "active").trim().toLowerCase();
  const internal = Boolean(options.internalCompanyId && company?.id === options.internalCompanyId);
  const trialActive = storedStatus === "trialing" && validFutureDate(company?.trial_ends_at, now);
  const renewalExpired = Boolean(company?.subscription_renews_at) && !validFutureDate(company?.subscription_renews_at, now);
  const paidActive = storedStatus === "active" && !renewalExpired;
  const accessState: CloudAccessState = internal
    ? "internal"
    : companyStatus === "suspended"
      ? "restricted"
      : trialActive
        ? "trial_active"
        : paidActive
          ? "active"
          : "restricted";
  const billingStatus = internal
    ? "internal"
    : storedStatus === "trialing" && !trialActive
      ? "expired"
      : storedStatus === "active" && renewalExpired
        ? "expired"
        : storedStatus;

  return {
    plan,
    billingStatus,
    trialActive,
    accessState,
    limits: internal ? { users: null, drivers: null } : { users: configuredPlan.maxUsers, drivers: configuredPlan.maxDrivers },
    features: accessState === "restricted" ? new Set<CloudFeature>() : internal ? allCloudFeatures : cloudFeatureMatrix[plan]
  };
}

export function hasCloudFeature(entitlements: CloudEntitlements, feature: CloudFeature) {
  return entitlements.features.has(feature);
}

export function validateCloudPaymentFacts(input: {
  plan: CloudBillingPlan;
  expectedReference: string;
  expectedAmount?: number | string | null;
  expectedCurrency?: string | null;
  transactionStatus?: string | null;
  transactionReference?: string | null;
  amount?: number | string | null;
  currency?: string | null;
}) {
  const expected = legacyNgnCloudPlanPrices[input.plan];
  const expectedAmount = Number(input.expectedAmount ?? expected.amount);
  const expectedCurrency = String(input.expectedCurrency ?? expected.currency).toUpperCase();
  const paidAmount = Number(input.amount ?? 0);
  return String(input.transactionStatus ?? "").toLowerCase() === "successful"
    && input.transactionReference === input.expectedReference
    && Number.isFinite(paidAmount)
    && paidAmount === expectedAmount
    && String(input.currency ?? "").toUpperCase() === expectedCurrency;
}

export function cloudPlanCan(plan: string | null | undefined, capability: CloudBrandCapability) {
  return cloudBrandCapabilities[getCloudBillingPlanKey(plan)].has(capability);
}
