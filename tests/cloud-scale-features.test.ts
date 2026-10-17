import assert from "node:assert/strict";
import test from "node:test";
import { normalizeCustomDomain, normalizeIntegrationEndpoint, normalizeIntegrationEvents } from "../src/server/cloud-scale-features";
import { hasCloudFeature, resolveCloudEntitlements } from "../src/lib/cloud-plans";
import { publicTenantProfile } from "../src/lib/tenant-branding";

test("custom domains normalize public hostnames and reject URLs or private names", () => {
  assert.equal(normalizeCustomDomain(" Tracking.Example.org. "), "tracking.example.org");
  assert.equal(normalizeCustomDomain("http://tracking.example.org"), null);
  assert.equal(normalizeCustomDomain("tracking.example.org/path"), null);
  assert.equal(normalizeCustomDomain("localhost"), null);
  assert.equal(normalizeCustomDomain("tracking.example.invalid"), null);
  assert.equal(normalizeCustomDomain("tracking.localhost"), null);
  assert.equal(normalizeCustomDomain("127.0.0.1"), null);
});

test("custom integration endpoints require public HTTPS and supported events", () => {
  assert.equal(normalizeIntegrationEndpoint("https://hooks.example.org/fly"), "https://hooks.example.org/fly");
  assert.equal(normalizeIntegrationEndpoint("http://hooks.example.org/fly"), null);
  assert.equal(normalizeIntegrationEndpoint("https://user:pass@hooks.example.org/fly"), null);
  assert.equal(normalizeIntegrationEndpoint("https://127.0.0.1/fly"), null);
  assert.equal(normalizeIntegrationEndpoint("https://hooks.localhost/fly"), null);
  assert.equal(normalizeIntegrationEndpoint("https://hooks.example.org:8443/fly"), null);
  assert.deepEqual(normalizeIntegrationEvents(["shipment.created", "shipment.created"]), ["shipment.created"]);
  assert.equal(normalizeIntegrationEvents(["company.deleted"]), null);
});

test("Scale features are gated and platform branding removal only applies with Scale entitlement", () => {
  const starter = resolveCloudEntitlements({ subscription_plan: "starter", subscription_status: "active" });
  const scale = resolveCloudEntitlements({ subscription_plan: "scale", subscription_status: "active" });
  assert.equal(hasCloudFeature(starter, "custom_domain"), false);
  assert.equal(hasCloudFeature(starter, "remove_platform_branding"), false);
  assert.equal(hasCloudFeature(starter, "custom_integrations"), false);
  assert.equal(hasCloudFeature(scale, "custom_domain"), true);
  assert.equal(hasCloudFeature(scale, "remove_platform_branding"), true);
  assert.equal(hasCloudFeature(scale, "custom_integrations"), true);
});

test("public portal branding removal is emitted only for entitled Scale tenants", () => {
  const profile = {
    id: "synthetic-id",
    name: "Synthetic Tenant",
    slug: "synthetic-tenant",
    subscription_plan: "scale",
    subscription_status: "active"
  };
  assert.equal(publicTenantProfile(profile, true).platform_branding_removed, true);
  assert.equal(publicTenantProfile({ ...profile, subscription_plan: "starter" }, true).platform_branding_removed, false);
  assert.equal(publicTenantProfile(profile, false).platform_branding_removed, false);
});
