export type CloudBillingPlan = "starter" | "growth" | "scale";
export type CloudBrandCapability = "basic_branding" | "advanced_branding" | "email_branding" | "custom_domain" | "remove_platform_branding";

export const CLOUD_TRIAL_DAYS = 14;

export const cloudBillingPlans: Record<
  CloudBillingPlan,
  {
    name: string;
    amount: number;
    currency: "NGN";
    billingInterval: "monthly";
    monthlyShipments: string;
    maxUsers: number | null;
    maxDrivers: number | null;
    description: string;
    features: string[];
    envPlanKey: string;
  }
> = {
  starter: {
    name: "Starter",
    amount: 25000,
    currency: "NGN",
    billingInterval: "monthly",
    monthlyShipments: "Operational starter workspace",
    maxUsers: 5,
    maxDrivers: 10,
    description: "For lean logistics teams that need shipment management, tracking, and customer visibility.",
    envPlanKey: "FLUTTERWAVE_CLOUD_STARTER_PLAN_ID",
    features: ["Maximum 5 users", "Maximum 10 drivers", "Shipment management", "Customer portal", "Tracking", "Basic analytics", "Email support"]
  },
  growth: {
    name: "Growth",
    amount: 75000,
    currency: "NGN",
    billingInterval: "monthly",
    monthlyShipments: "Growing operations workspace",
    maxUsers: 20,
    maxDrivers: 100,
    description: "For active operators scaling dispatch, analytics, AI recommendations, and customer communications.",
    envPlanKey: "FLUTTERWAVE_CLOUD_GROWTH_PLAN_ID",
    features: ["Maximum 20 users", "Maximum 100 drivers", "Shipment management", "Customer portal", "Tracking", "Advanced analytics", "AI dispatch", "WhatsApp notifications", "API access", "Priority support"]
  },
  scale: {
    name: "Scale",
    amount: 200000,
    currency: "NGN",
    billingInterval: "monthly",
    monthlyShipments: "Enterprise logistics workspace",
    maxUsers: null,
    maxDrivers: null,
    description: "For high-volume logistics companies that need unlimited teams, white-label controls, and dedicated support.",
    envPlanKey: "FLUTTERWAVE_CLOUD_SCALE_PLAN_ID",
    features: ["Unlimited users", "Unlimited drivers", "Shipment management", "Customer portal", "Tracking", "Advanced analytics", "AI dispatch", "WhatsApp notifications", "API access", "White-label branding", "Custom integrations", "Dedicated account management"]
  }
};

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

export function cloudPlanCan(plan: string | null | undefined, capability: CloudBrandCapability) {
  return cloudBrandCapabilities[getCloudBillingPlanKey(plan)].has(capability);
}
