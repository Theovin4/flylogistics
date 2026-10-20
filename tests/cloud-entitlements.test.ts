import test from "node:test";
import assert from "node:assert/strict";
import { hasCloudFeature, isCloudPlanLimitReached, resolveCloudEntitlements, validateCloudPaymentFacts } from "../src/lib/cloud-plans";
import { calculateTenantPriceFromRates, type TenantRateCard } from "../src/server/tenant-pricing";

const now = new Date("2026-10-13T12:00:00.000Z");

test("expired trials are restricted even when the stored status still says trialing", () => {
  const result = resolveCloudEntitlements({ id: "tenant-a", subscription_plan: "scale", subscription_status: "trialing", trial_ends_at: "2026-10-12T12:00:00.000Z" }, { now });
  assert.equal(result.billingStatus, "expired");
  assert.equal(result.accessState, "restricted");
  assert.equal(result.features.size, 0);
});

test("valid trials work before the boundary and restrict immediately after it", () => {
  const before = resolveCloudEntitlements({ subscription_plan: "starter", subscription_status: "trialing", trial_ends_at: "2026-10-13T12:00:01.000Z" }, { now });
  const atBoundary = resolveCloudEntitlements({ subscription_plan: "starter", subscription_status: "trialing", trial_ends_at: "2026-10-13T12:00:00.000Z" }, { now });
  assert.equal(before.accessState, "trial_active");
  assert.equal(atBoundary.accessState, "restricted");
});

test("Starter cannot receive Growth or Scale features", () => {
  const result = resolveCloudEntitlements({ subscription_plan: "starter", subscription_status: "active", subscription_renews_at: "2026-11-13T12:00:00.000Z" }, { now });
  assert.equal(hasCloudFeature(result, "shipment_management"), true);
  assert.equal(hasCloudFeature(result, "basic_analytics"), true);
  assert.equal(hasCloudFeature(result, "advanced_analytics"), false);
  assert.equal(hasCloudFeature(result, "api_access"), false);
  assert.equal(hasCloudFeature(result, "remove_platform_branding"), false);
  assert.equal(hasCloudFeature(result, "custom_domain"), false);
  assert.equal(hasCloudFeature(result, "custom_integrations"), false);
  assert.deepEqual(result.limits, { users: 5, drivers: 10 });
});

test("Growth receives Growth features but not Scale-only features", () => {
  const result = resolveCloudEntitlements({ subscription_plan: "growth", subscription_status: "active" }, { now });
  assert.equal(hasCloudFeature(result, "advanced_analytics"), true);
  assert.equal(hasCloudFeature(result, "ai_dispatch"), true);
  assert.equal(hasCloudFeature(result, "api_access"), true);
  assert.equal(hasCloudFeature(result, "custom_domain"), false);
  assert.deepEqual(result.limits, { users: 20, drivers: 100 });
});

test("Scale and explicitly identified internal company receive unlimited limits", () => {
  const scale = resolveCloudEntitlements({ subscription_plan: "scale", subscription_status: "active" }, { now });
  assert.deepEqual(scale.limits, { users: null, drivers: null });
  assert.equal(hasCloudFeature(scale, "custom_integrations"), true);
  assert.equal(hasCloudFeature(scale, "custom_domain"), true);
  assert.equal(hasCloudFeature(scale, "remove_platform_branding"), true);

  const internal = resolveCloudEntitlements({ id: "trusted-internal-id", subscription_plan: "starter", subscription_status: "expired" }, { now, internalCompanyId: "trusted-internal-id" });
  assert.equal(internal.accessState, "internal");
  assert.deepEqual(internal.limits, { users: null, drivers: null });
  assert.equal(hasCloudFeature(internal, "custom_integrations"), true);
});

test("plan limits block only new records at and above the limit", () => {
  assert.equal(isCloudPlanLimitReached(4, 5), false);
  assert.equal(isCloudPlanLimitReached(5, 5), true);
  assert.equal(isCloudPlanLimitReached(10, 10), true);
  assert.equal(isCloudPlanLimitReached(500, null), false);
});

test("Cloud payment facts require exact trusted plan amount, currency, status, and reference", () => {
  const expectedReference = "FLY-CLOUD-360-LOGISTICS-SCALE-1791880000000";
  const valid = { plan: "scale" as const, expectedReference, transactionStatus: "successful", transactionReference: expectedReference, amount: 200000, currency: "NGN" };
  assert.equal(validateCloudPaymentFacts(valid), true);
  assert.equal(validateCloudPaymentFacts({ ...valid, amount: 25000 }), false);
  assert.equal(validateCloudPaymentFacts({ ...valid, currency: "USD" }), false);
  assert.equal(validateCloudPaymentFacts({ ...valid, transactionStatus: "pending" }), false);
  assert.equal(validateCloudPaymentFacts({ ...valid, transactionReference: "FLY-CLOUD-OTHER-SCALE-1791880000000" }), false);
});

test("tenant pricing prefers a specific route over a newer wildcard rate", () => {
  const rates: TenantRateCard[] = [
    { id: "wildcard", name: "Default", service_type: "local_nigeria", origin_zone: "All", destination_zone: "All", base_price: 3000, included_weight_kg: 5, extra_kg_price: 200, currency: "NGN", eta_min_hours: 24, eta_max_hours: 48, created_at: "2026-10-13T11:00:00Z" },
    { id: "specific", name: "Mainland to Island", service_type: "local_nigeria", origin_zone: "Lagos Mainland", destination_zone: "Lagos Island", base_price: 5000, included_weight_kg: 5, extra_kg_price: 500, currency: "NGN", eta_min_hours: 4, eta_max_hours: 8, created_at: "2026-10-12T11:00:00Z" }
  ];
  const quote = calculateTenantPriceFromRates(rates, { pickupZone: "lagos mainland", destinationZone: "Lagos Island", weightKg: 7 });
  assert.equal(quote?.id, "specific");
  assert.equal(quote?.baseAmount, 5000);
  assert.equal(quote?.extraWeightAmount, 1000);
  assert.equal(quote?.amount, 6000);
});
