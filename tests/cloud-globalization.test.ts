import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cloudBillingSnapshotMatchesTransaction } from "../src/lib/cloud-billing-security";
import {
  defaultLocaleForCountry,
  formatCloudBillingMoney,
  formatMoney,
  formatTenantDateTime,
  formatTenantTime,
  isValidIanaTimezone,
  normalizeCountryCode,
  suggestedBillingCurrencyForCountry,
  suggestedCurrencyForCountry
} from "../src/lib/tenant-locale";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

test("tenant country defaults cover Nigeria and initial global markets", () => {
  const cases = [
    ["NG", "NGN", "en-NG"],
    ["GB", "GBP", "en-GB"],
    ["US", "USD", "en-US"],
    ["KE", "KES", "en-KE"],
    ["ZA", "ZAR", "en-ZA"],
    ["FR", "EUR", "fr-FR"]
  ] as const;

  for (const [country, currency, locale] of cases) {
    assert.equal(normalizeCountryCode(country), country);
    assert.equal(suggestedCurrencyForCountry(country), currency);
    assert.equal(suggestedBillingCurrencyForCountry(country), currency);
    assert.equal(defaultLocaleForCountry(country), locale);
  }
  assert.equal(suggestedBillingCurrencyForCountry("IN"), "USD");
});

test("tenant date formatting uses the company timezone rather than the operator timezone", () => {
  const utc = "2026-01-15T12:00:00.000Z";
  assert.match(formatTenantTime(utc, "Africa/Lagos", "en-GB"), /13:00/);
  assert.match(formatTenantTime(utc, "Africa/Nairobi", "en-GB"), /15:00/);
  assert.match(formatTenantTime(utc, "Asia/Kolkata", "en-GB"), /17:30/);
  assert.notEqual(
    formatTenantDateTime(utc, "America/New_York", "en-US"),
    formatTenantDateTime(utc, "Africa/Lagos", "en-US")
  );
  assert.equal(isValidIanaTimezone("GMT+1"), false);
  assert.equal(isValidIanaTimezone("Europe/London"), true);
});

test("London and New York daylight-saving transitions are automatic", () => {
  assert.match(formatTenantTime("2026-01-15T12:00:00Z", "Europe/London", "en-GB"), /12:00/);
  assert.match(formatTenantTime("2026-07-15T12:00:00Z", "Europe/London", "en-GB"), /13:00/);
  assert.match(formatTenantTime("2026-01-15T12:00:00Z", "America/New_York", "en-US"), /7:00\s?AM/i);
  assert.match(formatTenantTime("2026-07-15T12:00:00Z", "America/New_York", "en-US"), /8:00\s?AM/i);
});

test("money formatting uses each record currency instead of a tenant-wide NGN assumption", () => {
  assert.match(formatMoney(1250, "GBP", "en-GB"), /£1,250/);
  assert.match(formatMoney(1250, "USD", "en-US"), /\$1,250/);
  assert.match(formatMoney(1250, "KES", "en-KE"), /Ksh|KES/);
  assert.match(formatMoney(1250, "ZAR", "en-ZA"), /R|ZAR/);
  assert.notEqual(formatMoney(1250, "EUR", "fr-FR"), formatMoney(1250, "NGN", "en-NG"));
});

test("public Cloud billing prices use the approved international currency symbols", () => {
  assert.equal(formatCloudBillingMoney(25000, "NGN"), "₦25,000.00");
  assert.equal(formatCloudBillingMoney(37, "USD"), "$37.00");
  assert.equal(formatCloudBillingMoney(27.5, "GBP"), "£27.50");
  assert.equal(formatCloudBillingMoney(83.5, "EUR"), "€83.50");
  assert.equal(formatCloudBillingMoney(429, "GHS"), "GH₵429.00");
  assert.equal(formatCloudBillingMoney(4800, "KES"), "KSh4,800.00");
  assert.equal(formatCloudBillingMoney(610, "ZAR"), "R610.00");
});

test("foreign-currency payment verification is bound to the persisted price snapshot", () => {
  const snapshot = {
    amount: 49,
    currency: "GBP",
    paymentReference: "FLY-CLOUD-ACME-GROWTH-1",
    priceVersion: "2026-global-v1",
    provider: "flutterwave",
    providerPlanId: "gbp-growth-plan"
  };
  const transaction = {
    status: "successful",
    transactionReference: snapshot.paymentReference,
    amount: 49,
    currency: "GBP",
    providerPlanId: snapshot.providerPlanId
  };

  assert.equal(cloudBillingSnapshotMatchesTransaction(snapshot, transaction), true);
  assert.equal(cloudBillingSnapshotMatchesTransaction(snapshot, { ...transaction, amount: 48 }), false);
  assert.equal(cloudBillingSnapshotMatchesTransaction(snapshot, { ...transaction, currency: "NGN" }), false);
  assert.equal(cloudBillingSnapshotMatchesTransaction(snapshot, { ...transaction, providerPlanId: "ngn-growth-plan" }), false);
  assert.equal(cloudBillingSnapshotMatchesTransaction({ ...snapshot, priceVersion: null }, transaction), false);
  assert.equal(cloudBillingSnapshotMatchesTransaction(snapshot, { ...transaction, transactionReference: "other" }), false);
});

test("checkout accepts only a plan and resolves all charged facts on the server", () => {
  const route = read("src/app/api/cloud/billing/checkout/route.ts");
  const billing = read("src/server/cloud-billing.ts");
  assert.match(route, /checkoutSchema = z\.object\(\{[\s\S]*?plan:/);
  assert.doesNotMatch(route, /checkoutSchema[\s\S]{0,300}(amount|providerPlanId|billingCurrency):/);
  assert.match(billing, /resolveCloudPlanPrice\(input\.supabase/);
  assert.match(billing, /persistCloudBillingCheckout[\s\S]+createFlutterwaveCheckout/);
  assert.match(billing, /A checkout attempt must not change the active plan, amount, or currency/);
});

test("callback verification remains bound to the checkout snapshot after catalogue changes", () => {
  const billing = read("src/server/cloud-billing.ts");
  const verification = billing.slice(
    billing.indexOf("export async function verifyCloudSubscriptionPayment"),
    billing.indexOf("export async function processCloudBillingWebhook")
  );
  assert.match(verification, /from\("subscriptions"\)[\s\S]*?eq\("payment_reference", input\.txRef\)/);
  assert.match(verification, /snapshotMatchesTransaction\(snapshot, transaction\)/);
  assert.doesNotMatch(verification, /resolveCloudPlanPrice/);
  assert.match(verification, /billing_amount: expectedAmount/);
  assert.match(verification, /billing_currency: snapshot\.currency/);
});

test("webhook replay exits before subscription, company, or email side effects", () => {
  const billing = read("src/server/cloud-billing.ts");
  const webhook = billing.slice(billing.indexOf("export async function processCloudBillingWebhook"));
  const duplicateGuard = webhook.indexOf('existing.data?.status === status');
  assert.ok(duplicateGuard > 0);
  assert.ok(duplicateGuard < webhook.indexOf("const subscription = await upsertCloudSubscription"));
  assert.ok(duplicateGuard < webhook.indexOf("const companyUpdate = await supabase"));
  assert.ok(duplicateGuard < webhook.indexOf("await sendCloudBillingEmail"));
});

test("globalization migration keeps catalogue and FX data service-only", () => {
  const migration = read("supabase/migrations/20261021135732_cloud_globalization.sql");
  for (const table of ["cloud_plan_prices", "cloud_fx_rates"]) {
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`));
    assert.match(migration, new RegExp(`revoke all on table public\\.${table} from public, anon, authenticated`));
    assert.match(migration, new RegExp(`grant select, insert, update, delete on table public\\.${table} to service_role`));
  }
  assert.match(migration, /where active/);
  assert.match(migration, /provider_transaction_id/);
});
