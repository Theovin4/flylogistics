import process from "node:process";
import { createClient } from "@supabase/supabase-js";

const STAGING_REF = "vgrcfuaqxwidgdgtnved";
const PRODUCTION_REF = "igloqgojviveysjazhmu";
const EXPECTED_AMOUNTS = { starter: 19, growth: 59, scale: 149 };

function assert(value, message) {
  if (!value) throw new Error(message);
}

function loadEnvironment() {
  const names = [
    "STAGING_SUPABASE_URL",
    "STAGING_SUPABASE_ANON_KEY",
    "STAGING_SUPABASE_SERVICE_ROLE_KEY",
    "STAGING_TEST_DATA_SECRET"
  ];
  for (const name of names) assert(process.env[name], name + " is missing; aborting.");
  const url = process.env.STAGING_SUPABASE_URL;
  assert(url === "https://" + STAGING_REF + ".supabase.co", "Staging URL mismatch; aborting.");
  for (const value of [url, process.env.DATABASE_URL, process.env.DIRECT_URL].filter(Boolean)) {
    assert(!value.includes(PRODUCTION_REF), "Production reference detected; aborting.");
    assert(new URL(value).hostname.includes(STAGING_REF), "Non-staging database reference detected; aborting.");
  }
  return { url, anon: process.env.STAGING_SUPABASE_ANON_KEY, service: process.env.STAGING_SUPABASE_SERVICE_ROLE_KEY };
}

async function establishPreview(previewUrl, shareUrl) {
  const parsed = new URL(previewUrl);
  assert(parsed.protocol === "https:" && parsed.hostname.endsWith(".vercel.app"), "A Vercel Preview URL is required.");
  assert(!["flylogistics.vercel.app", "flylogistics.com.ng", "www.flylogistics.com.ng"].includes(parsed.hostname), "Production hostname rejected.");
  assert(shareUrl.startsWith(previewUrl) && shareUrl.includes("_vercel_share="), "Exact Preview share URL required.");
  const response = await fetch(shareUrl, { redirect: "manual" });
  const cookie = (response.headers.get("set-cookie") || "").split(";")[0];
  assert(cookie.includes("="), "Unable to establish Preview share session; HTTP " + response.status + ".");
  return async function previewFetch(path, options = {}) {
    const headers = new Headers(options.headers || {});
    headers.set("cookie", cookie);
    if (options.body !== undefined && !headers.has("content-type")) headers.set("content-type", "application/json");
    const result = await fetch(previewUrl + path, { ...options, headers, redirect: "manual" });
    const text = await result.text();
    let body = null;
    try { body = text ? JSON.parse(text) : null; } catch { body = { nonJson: text.slice(0, 100) }; }
    return { status: result.status, body };
  };
}

async function remove(query, label) {
  const result = await query;
  if (result.error) throw new Error("Cleanup " + label + ": " + result.error.message);
}

async function cleanup(admin, state) {
  const nil = "00000000-0000-0000-0000-000000000000";
  const companyId = state.companyId || nil;
  const userId = state.userId || nil;
  await remove(admin.from("subscriptions").delete().eq("company_id", companyId), "subscriptions");
  await remove(admin.from("cloud_plan_prices").delete().eq("price_version", state.runId), "catalogue");
  await remove(admin.from("audit_logs").delete().eq("company_id", companyId), "audit logs");
  await remove(admin.from("company_members").delete().eq("company_id", companyId), "membership");
  await remove(admin.from("user_profiles").delete().eq("id", userId), "profile");
  await remove(admin.from("companies").delete().eq("id", companyId), "company");
  if (state.userId) {
    const deleted = await admin.auth.admin.deleteUser(state.userId);
    if (deleted.error) throw new Error("Cleanup auth user: " + deleted.error.message);
  }

  const checks = {
    subscriptions: admin.from("subscriptions").select("id", { count: "exact", head: true }).eq("company_id", companyId),
    catalogue: admin.from("cloud_plan_prices").select("id", { count: "exact", head: true }).eq("price_version", state.runId),
    memberships: admin.from("company_members").select("id", { count: "exact", head: true }).eq("company_id", companyId),
    profiles: admin.from("user_profiles").select("id", { count: "exact", head: true }).eq("id", userId),
    companies: admin.from("companies").select("id", { count: "exact", head: true }).eq("id", companyId)
  };
  const residuals = {};
  for (const [name, query] of Object.entries(checks)) {
    const result = await query;
    if (result.error) throw new Error("Residual " + name + ": " + result.error.message);
    residuals[name] = result.count || 0;
  }
  const users = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (users.error) throw new Error("Residual auth user: " + users.error.message);
  residuals.authUsers = users.data.users.filter((user) => String(user.email || "").toLowerCase() === state.email).length;
  return residuals;
}

const previewUrl = String(process.argv[2] || "").replace(/\/$/, "");
const deploymentId = String(process.argv[3] || "");
const shareUrl = String(process.argv[4] || "");
assert(/^dpl_[A-Za-z0-9]+$/.test(deploymentId), "Exact Preview deployment ID required.");
const env = loadEnvironment();
const admin = createClient(env.url, env.service, { auth: { autoRefreshToken: false, persistSession: false } });
const previewFetch = await establishPreview(previewUrl, shareUrl);
const state = {
  runId: "codex-billing-" + new Date().toISOString().replace(/\D/g, "").slice(0, 12) + "-" + process.pid,
  companyId: null,
  userId: null,
  email: ""
};
state.email = state.runId + "@example.invalid";
const password = "C0dex!" + state.runId + "Aa";
const report = {
  deployment: { id: deploymentId, url: previewUrl, target: "preview" },
  safety: { stagingRef: STAGING_REF, productionExcluded: true, requiredVariablesPresent: true, providerCallsAllowed: false },
  counts: { billingStrictness: { pass: 0, fail: 0 } },
  failures: []
};
function check(label, value) {
  report.counts.billingStrictness[value ? "pass" : "fail"] += 1;
  if (!value) report.failures.push(label);
}

try {
  const health = await previewFetch("/api/health");
  check("Preview health", health.status === 200 && health.body?.ok === true);

  const existingUsd = await admin.from("cloud_plan_prices").select("id", { count: "exact", head: true }).eq("currency", "USD").eq("active", true);
  assert(!existingUsd.error, "Unable to inspect the USD catalogue.");
  check("USD initially unconfigured", existingUsd.count === 0);
  assert(existingUsd.count === 0, "Active USD catalogue already exists; refusing to mutate it.");

  const signup = await previewFetch("/api/cloud/signup", {
    method: "POST",
    body: JSON.stringify({
      companyName: "Codex Billing Guard",
      ownerName: "Codex Billing Owner",
      email: state.email,
      password,
      phone: "+2347000000000",
      slug: state.runId,
      country: "United States",
      locale: "en-US",
      timezone: "America/New_York",
      currency: "USD",
      billingCurrency: "USD"
    })
  });
  state.companyId = signup.body?.company?.id || null;
  check("Synthetic USD tenant signup", signup.status === 201 && Boolean(state.companyId));
  assert(state.companyId, "Synthetic tenant signup failed; HTTP " + signup.status + ".");

  const profile = await admin.from("user_profiles").select("id").eq("email", state.email).single();
  assert(!profile.error && profile.data?.id, "Synthetic owner profile missing.");
  state.userId = profile.data.id;
  const login = await previewFetch("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: state.email, password, expectedRole: "customer" })
  });
  const token = login.body?.accessToken;
  check("Synthetic owner login", login.status === 200 && Boolean(token));
  assert(token, "Synthetic owner login failed; HTTP " + login.status + ".");
  const headers = { authorization: "Bearer " + token };

  const companyBefore = await admin.from("companies")
    .select("billing_currency,subscription_plan,subscription_status,billing_amount,last_billing_reference,flutterwave_subscription_id")
    .eq("id", state.companyId).single();
  assert(!companyBefore.error, "Unable to read the synthetic company.");
  check("Explicit tenant billing currency persisted", companyBefore.data.billing_currency === "USD");

  const pricesUnavailable = await previewFetch("/api/cloud/billing/prices", { headers });
  check("Unconfigured price API returns a safe, clear 409", pricesUnavailable.status === 409
    && Array.isArray(pricesUnavailable.body?.prices)
    && pricesUnavailable.body.prices.length === 0
    && pricesUnavailable.body?.code === "CLOUD_BILLING_CURRENCY_UNAVAILABLE"
    && /USD subscription billing is not available yet/i.test(pricesUnavailable.body?.error || ""));

  const beforeSubscriptions = await admin.from("subscriptions").select("id", { count: "exact", head: true }).eq("company_id", state.companyId);
  assert(!beforeSubscriptions.error, "Unable to count pre-checkout subscriptions.");
  const checkout = await previewFetch("/api/cloud/billing/checkout", {
    method: "POST",
    headers,
    body: JSON.stringify({
      plan: "growth",
      amount: 1,
      billingCurrency: "NGN",
      currency: "NGN",
      providerPlanId: "attacker-plan",
      priceVersion: "attacker-version"
    })
  });
  check("Unconfigured checkout returns 409", checkout.status === 409);
  check("Checkout rejects before trusting malicious facts", checkout.body?.code === "CLOUD_BILLING_CURRENCY_UNAVAILABLE" && /USD subscription billing is not available yet/i.test(checkout.body?.error || "") && !JSON.stringify(checkout.body).includes("attacker"));

  const afterSubscriptions = await admin.from("subscriptions").select("id,provider_plan_id,provider_transaction_id", { count: "exact" }).eq("company_id", state.companyId);
  assert(!afterSubscriptions.error, "Unable to inspect post-checkout subscriptions.");
  check("No billing snapshot created", afterSubscriptions.count === beforeSubscriptions.count && afterSubscriptions.data.length === 0);
  const companyAfter = await admin.from("companies")
    .select("billing_currency,subscription_plan,subscription_status,billing_amount,last_billing_reference,flutterwave_subscription_id")
    .eq("id", state.companyId).single();
  assert(!companyAfter.error, "Unable to inspect the post-checkout company.");
  check("No company billing mutation", JSON.stringify(companyAfter.data) === JSON.stringify(companyBefore.data));
  check("Zero provider-call facts", afterSubscriptions.data.every((row) => !row.provider_plan_id && !row.provider_transaction_id) && !companyAfter.data.last_billing_reference && !companyAfter.data.flutterwave_subscription_id);

  const catalogueRows = Object.entries(EXPECTED_AMOUNTS).map(([plan, amount]) => ({
    plan,
    currency: "USD",
    amount,
    provider: "flutterwave",
    provider_plan_id: state.runId + "-" + plan,
    price_version: state.runId,
    billing_interval: "monthly",
    active: true,
    effective_from: new Date().toISOString()
  }));
  const inserted = await admin.from("cloud_plan_prices").insert(catalogueRows).select("plan,currency,amount,provider_plan_id,price_version,active");
  check("Complete synthetic USD catalogue inserted", !inserted.error && inserted.data?.length === 3);
  assert(!inserted.error, "Unable to insert synthetic USD catalogue: " + inserted.error?.message);

  const pricesConfigured = await previewFetch("/api/cloud/billing/prices", { headers });
  const prices = pricesConfigured.body?.prices || [];
  check("Configured price API returns all plans", pricesConfigured.status === 200 && prices.length === 3);
  check("Configured foreign amounts are exact", prices.every((row) => row.currency === "USD" && row.amount === EXPECTED_AMOUNTS[row.plan]));
  check("Configured foreign metadata is exact", prices.every((row) => row.priceVersion === state.runId && row.configured === true && row.requestedCurrency === "USD" && row.fallbackCurrency === false));
  const directCatalogue = await admin.from("cloud_plan_prices").select("plan,provider_plan_id").eq("price_version", state.runId).order("plan");
  check("Trusted provider mapping is exact", !directCatalogue.error && directCatalogue.data?.length === 3 && directCatalogue.data.every((row) => row.provider_plan_id === state.runId + "-" + row.plan));
} catch (error) {
  report.failures.push(error instanceof Error ? error.message : String(error));
} finally {
  try {
    const residuals = await cleanup(admin, state);
    report.cleanupResiduals = residuals;
    report.cleanupZero = Object.values(residuals).every((value) => value === 0);
  } catch (error) {
    report.cleanupError = error instanceof Error ? error.message : String(error);
    report.cleanupZero = false;
  }
}

report.providerCalls = report.counts.billingStrictness.fail === 0 ? 0 : "not-proven";
report.ok = report.counts.billingStrictness.pass === 16
  && report.counts.billingStrictness.fail === 0
  && report.failures.length === 0
  && report.cleanupZero === true;
console.log(JSON.stringify(report, null, 2));
if (!report.ok) process.exitCode = 1;
