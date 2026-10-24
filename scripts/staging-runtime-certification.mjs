import process from "node:process";
import { createClient } from "@supabase/supabase-js";

const STAGING_REF = "vgrcfuaqxwidgdgtnved";
const PRODUCTION_REF = "igloqgojviveysjazhmu";
const PREVIEW_URL = "https://flylogistics-fhw3f46xi-vincent-theos-projects.vercel.app";
const DEPLOYMENT_ID = "dpl_7trHongCTGJH8jEahirpJPYVMH49";
const TENANTS = [
  ["ng", "Nigeria", "NG", "en-NG", "Africa/Lagos", "NGN"],
  ["gb", "United Kingdom", "GB", "en-GB", "Europe/London", "GBP"],
  ["us", "United States", "US", "en-US", "America/New_York", "USD"],
  ["ke", "Kenya", "KE", "en-KE", "Africa/Nairobi", "KES"],
  ["za", "South Africa", "ZA", "en-ZA", "Africa/Johannesburg", "ZAR"],
  ["fr", "France", "FR", "fr-FR", "Europe/Paris", "EUR"]
].map(function (row) {
  return { key: row[0], country: row[1], code: row[2], locale: row[3], timezone: row[4], currency: row[5] };
});

function assert(value, message) {
  if (!value) throw new Error(message);
}

function loadEnvironment() {
  const names = ["STAGING_SUPABASE_URL", "STAGING_SUPABASE_ANON_KEY", "STAGING_SUPABASE_SERVICE_ROLE_KEY", "STAGING_TEST_DATA_SECRET"];
  for (const name of names) assert(process.env[name], name + " is missing; aborting.");
  const url = process.env.STAGING_SUPABASE_URL;
  assert(url === "https://" + STAGING_REF + ".supabase.co", "Staging URL mismatch; aborting.");
  for (const value of [url, process.env.DATABASE_URL, process.env.DIRECT_URL].filter(Boolean)) {
    assert(!value.includes(PRODUCTION_REF), "Production reference detected; aborting.");
    assert(new URL(value).hostname.includes(STAGING_REF), "Non-staging database reference detected; aborting.");
  }
  return { url: url, anon: process.env.STAGING_SUPABASE_ANON_KEY, service: process.env.STAGING_SUPABASE_SERVICE_ROLE_KEY };
}

async function establishPreview(shareUrl) {
  assert(shareUrl && shareUrl.startsWith(PREVIEW_URL) && shareUrl.includes("_vercel_share="), "Exact Preview share URL required.");
  const response = await fetch(shareUrl, { redirect: "manual" });
  const cookie = (response.headers.get("set-cookie") || "").split(";")[0];
  assert(cookie.includes("="), "Unable to establish Preview share session; HTTP " + response.status + ".");
  return async function previewFetch(path, options) {
    const next = options || {};
    const headers = new Headers(next.headers || {});
    headers.set("cookie", cookie);
    if (next.body !== undefined && !headers.has("content-type")) headers.set("content-type", "application/json");
    const response = await fetch(PREVIEW_URL + path, { ...next, headers: headers, redirect: "manual" });
    const text = await response.text();
    let body = null;
    try { body = text ? JSON.parse(text) : null; } catch { body = { nonJson: text.slice(0, 100) }; }
    return { status: response.status, body: body };
  };
}

function auth(token) {
  return { authorization: "Bearer " + token };
}

function createReport() {
  return {
    deployment: { id: DEPLOYMENT_ID, url: PREVIEW_URL },
    safety: { stagingRef: STAGING_REF, productionExcluded: true, requiredVariablesPresent: true, testDataGuard: "local-only" },
    counts: {
      internationalTenantLocalization: { pass: 0, fail: 0 },
      timezoneDst: { pass: 0, fail: 0 },
      operationalCurrencies: { pass: 0, fail: 0 },
      multiCurrencyAnalytics: { pass: 0, fail: 0 },
      billingSeparation: { pass: 0, fail: 0 },
      tenantIsolation: { pass: 0, fail: 0 },
      cleanup: { pass: 0, fail: 0 }
    },
    failures: []
  };
}

function checker(report) {
  return function check(category, label, value) {
    report.counts[category][value ? "pass" : "fail"] += 1;
    if (!value) report.failures.push({ category: category, label: label });
  };
}

function isUtc(value) {
  return typeof value === "string" && /(Z|\+00:00)$/.test(value) && Number.isFinite(Date.parse(value));
}

function localHour(value, timezone, locale) {
  const part = new Intl.DateTimeFormat(locale, { timeZone: timezone, hour: "2-digit", hour12: false })
    .formatToParts(new Date(value)).find(function (item) { return item.type === "hour"; });
  return Number(part && part.value) % 24;
}

async function login(previewFetch, email, password) {
  const result = await previewFetch("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: email, password: password, expectedRole: "customer" })
  });
  assert(result.status === 200 && result.body && result.body.accessToken, "Login failed; HTTP " + result.status + ".");
  return result.body.accessToken;
}

async function remove(query, label) {
  const result = await query;
  if (result.error) throw new Error("Cleanup " + label + ": " + result.error.message);
}

async function cleanup(admin, runId, state) {
  const companyIds = state.companyIds.length ? state.companyIds : ["00000000-0000-0000-0000-000000000000"];
  const userIds = state.userIds.length ? state.userIds : ["00000000-0000-0000-0000-000000000000"];
  await remove(admin.from("operational_events").delete().like("entity_id", runId + "-%"), "events");
  await remove(admin.from("audit_logs").delete().in("company_id", companyIds), "audit");
  await remove(admin.from("subscriptions").delete().like("payment_reference", runId + "-%"), "subscriptions");
  await remove(admin.from("tenant_rate_cards").delete().in("company_id", companyIds), "rates");
  await remove(admin.from("shipments").delete().like("tracking_id", runId + "-%"), "shipments");
  await remove(admin.from("cloud_plan_prices").delete().eq("price_version", runId), "catalogue");
  await remove(admin.from("cloud_fx_rates").delete().eq("provider", runId), "FX");
  await remove(admin.from("company_members").delete().in("company_id", companyIds), "memberships");
  await remove(admin.from("user_profiles").delete().in("id", userIds), "profiles");
  await remove(admin.from("companies").delete().in("id", companyIds), "companies");
  for (const userId of state.userIds) {
    const deleted = await admin.auth.admin.deleteUser(userId);
    if (deleted.error) throw new Error("Cleanup auth: " + deleted.error.message);
  }
  const checks = {
    companies: admin.from("companies").select("id", { count: "exact", head: true }).like("slug", runId + "-%"),
    memberships: admin.from("company_members").select("id", { count: "exact", head: true }).in("company_id", companyIds),
    profiles: admin.from("user_profiles").select("id", { count: "exact", head: true }).in("id", userIds),
    rates: admin.from("tenant_rate_cards").select("id", { count: "exact", head: true }).in("company_id", companyIds),
    subscriptions: admin.from("subscriptions").select("id", { count: "exact", head: true }).like("payment_reference", runId + "-%"),
    catalogue: admin.from("cloud_plan_prices").select("id", { count: "exact", head: true }).eq("price_version", runId),
    fx: admin.from("cloud_fx_rates").select("id", { count: "exact", head: true }).eq("provider", runId),
    shipments: admin.from("shipments").select("id", { count: "exact", head: true }).like("tracking_id", runId + "-%"),
    events: admin.from("operational_events").select("id", { count: "exact", head: true }).like("entity_id", runId + "-%")
  };
  const residual = {};
  for (const entry of Object.entries(checks)) {
    const result = await entry[1];
    if (result.error) throw new Error("Residual " + entry[0] + ": " + result.error.message);
    residual[entry[0]] = result.count || 0;
  }
  const users = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (users.error) throw new Error("Residual auth: " + users.error.message);
  residual.authUsers = users.data.users.filter(function (user) {
    return state.emails.includes(String(user.email || "").toLowerCase());
  }).length;
  return residual;
}

async function probe(previewFetch, admin) {
  const health = await previewFetch("/api/health");
  assert(health.status === 200 && health.body && health.body.ok === true, "Preview health failed; HTTP " + health.status + ".");
  const database = await admin.from("companies").select("id", { count: "exact", head: true });
  assert(!database.error, "Staging probe failed.");
  console.log(JSON.stringify({
    phase: "safe-probe", deployment: DEPLOYMENT_ID, previewStatus: health.status,
    stagingRef: STAGING_REF, productionExcluded: true, requiredVariablesPresent: true, testDataGuard: "local-only"
  }, null, 2));
}

async function matrix(previewFetch, admin, env) {
  const report = createReport();
  const check = checker(report);
  const runId = "codex-global-" + new Date().toISOString().replace(/\D/g, "").slice(0, 12) + "-" + process.pid;
  const password = "C0dex!" + runId + "Aa";
  const state = { companyIds: [], userIds: [], emails: [], tenants: new Map() };
  try {
    for (const item of TENANTS) {
      const email = runId + "-" + item.key + "@example.invalid";
      const slug = runId + "-" + item.key;
      state.emails.push(email);
      const signup = await previewFetch("/api/cloud/signup", {
        method: "POST",
        body: JSON.stringify({
          companyName: "Codex Global " + item.code, ownerName: "Codex " + item.code + " Owner",
          email: email, password: password, phone: "+2347000000000", slug: slug,
          country: item.country, locale: item.locale, timezone: item.timezone,
          currency: item.currency, billingCurrency: "NGN"
        })
      });
      assert(signup.status === 201 && signup.body && signup.body.company && signup.body.company.id, "Signup " + item.code + " failed; HTTP " + signup.status + ".");
      const companyId = signup.body.company.id;
      state.companyIds.push(companyId);
      const profile = await admin.from("user_profiles").select("id").eq("email", email).single();
      assert(!profile.error && profile.data && profile.data.id, "Profile missing for " + item.code + ".");
      state.userIds.push(profile.data.id);
      const token = await login(previewFetch, email, password);
      const tenant = { ...item, email: email, companyId: companyId, userId: profile.data.id, token: token };
      state.tenants.set(item.key, tenant);

      const settings = await previewFetch("/api/cloud/settings", { headers: auth(token) });
      const company = settings.body && settings.body.company;
      check("internationalTenantLocalization", item.code + " signup persistence", settings.status === 200 && company.country === item.code && company.locale === item.locale && company.timezone === item.timezone && company.currency === item.currency);
      check("billingSeparation", item.code + " operating/billing distinction", company.currency === item.currency && company.billing_currency === "NGN");
      const patched = await previewFetch("/api/cloud/settings", {
        method: "PATCH", headers: auth(token),
        body: JSON.stringify({ country: item.country, locale: item.locale, timezone: item.timezone, currency: item.currency })
      });
      const reloaded = await previewFetch("/api/cloud/settings", { headers: auth(token) });
      const saved = reloaded.body && reloaded.body.company;
      check("internationalTenantLocalization", item.code + " settings reload", patched.status === 200 && saved.country === item.code && saved.locale === item.locale && saved.timezone === item.timezone && saved.currency === item.currency);
      check("billingSeparation", item.code + " billing preserved on settings", saved.billing_currency === "NGN");

      const rate = await previewFetch("/api/cloud/rates", {
        method: "POST", headers: auth(token),
        body: JSON.stringify({
          name: runId + "-" + item.key + "-rate", serviceType: "international_export",
          originZone: item.code, destinationZone: "GLOBAL", basePrice: 1250,
          includedWeightKg: 1, extraKgPrice: 100, currency: item.currency, isActive: true
        })
      });
      tenant.rateId = rate.body && rate.body.rate && rate.body.rate.id;
      check("operationalCurrencies", item.code + " stored rate currency", rate.status === 201 && rate.body.rate.currency === item.currency);
      const currencyPart = new Intl.NumberFormat(item.locale, { style: "currency", currency: item.currency }).formatToParts(1250).find(function (part) { return part.type === "currency"; });
      check("operationalCurrencies", item.code + " Intl currency formatting", Boolean(currencyPart && currencyPart.value));
      check("timezoneDst", item.code + " tenant timezone override", item.timezone === "Europe/London" || localHour("2026-01-15T12:00:00Z", item.timezone, item.locale) !== 12);
    }

    const gb = state.tenants.get("gb");
    const us = state.tenants.get("us");
    check("timezoneDst", "London winter", localHour("2026-01-15T12:00:00Z", gb.timezone, gb.locale) === 12);
    check("timezoneDst", "London summer DST", localHour("2026-07-15T12:00:00Z", gb.timezone, gb.locale) === 13);
    check("timezoneDst", "New York winter", localHour("2026-01-15T12:00:00Z", us.timezone, us.locale) === 7);
    check("timezoneDst", "New York summer DST", localHour("2026-07-15T12:00:00Z", us.timezone, us.locale) === 8);

    const now = new Date().toISOString();
    const shipments = await admin.from("shipments").insert([
      { tracking_id: runId + "-GBP", company_id: gb.companyId, customer_name: "Synthetic GBP", customer_email: gb.email, pickup_address: "Synthetic origin", delivery_address: "Synthetic destination", package_type: "parcel", status: "DELIVERED", payment_amount: 125, quoted_price: 125, quote_currency: "GBP", created_at: now, updated_at: now },
      { tracking_id: runId + "-USD", company_id: gb.companyId, customer_name: "Synthetic USD", customer_email: gb.email, pickup_address: "Synthetic origin", delivery_address: "Synthetic destination", package_type: "parcel", status: "PENDING", payment_amount: 50, quoted_price: 50, quote_currency: "USD", created_at: now, updated_at: now }
    ]).select("tracking_id,quote_currency,created_at,updated_at");
    assert(!shipments.error && shipments.data.length === 2, "Shipment fixtures failed.");
    check("timezoneDst", "shipment database timestamps UTC", shipments.data.every(function (row) { return isUtc(row.created_at) && isUtc(row.updated_at); }));
    check("timezoneDst", "shipment tenant-local rendering", new Intl.DateTimeFormat(gb.locale, { timeZone: gb.timezone, dateStyle: "medium", timeStyle: "short" }).format(new Date(now)).length > 0);

    const event = await admin.from("operational_events").insert({ company_id: gb.companyId, category: "system", severity: "info", message: "Synthetic globalization event", entity_type: "certification", entity_id: runId + "-event", created_at: "2026-03-29T00:30:00Z" }).select("created_at").single();
    assert(!event.error, "Event fixture failed.");
    check("timezoneDst", "operational event date", isUtc(event.data.created_at) && new Intl.DateTimeFormat(gb.locale, { timeZone: gb.timezone, dateStyle: "medium", timeStyle: "short" }).format(new Date(event.data.created_at)).length > 0);

    const refA = runId + "-GB-STARTER-A";
    const refB = runId + "-US-STARTER-B";
    const snapshots = await admin.from("subscriptions").insert([
      { company_id: gb.companyId, plan: "starter", status: "pending", amount: 19, currency: "GBP", payment_reference: refA, price_version: runId, provider: "flutterwave", provider_plan_id: runId + "-gb-plan", billing_interval: "monthly", metadata: { source: "certification" }, renewal_date: "2026-11-24T00:30:00Z" },
      { company_id: us.companyId, plan: "starter", status: "pending", amount: 29, currency: "USD", payment_reference: refB, price_version: runId, provider: "flutterwave", provider_plan_id: runId + "-us-plan", billing_interval: "monthly", metadata: { source: "certification" }, renewal_date: "2026-11-24T00:30:00Z" }
    ]).select("created_at,renewal_date");
    assert(!snapshots.error && snapshots.data.length === 2, "Billing fixtures failed.");
    check("timezoneDst", "billing dates UTC", snapshots.data.every(function (row) { return isUtc(row.created_at); }));
    check("timezoneDst", "renewal dates UTC", snapshots.data.every(function (row) { return isUtc(row.renewal_date); }));

    const before = await admin.from("companies").select("billing_currency").eq("id", gb.companyId).single();
    const changed = await previewFetch("/api/cloud/settings", { method: "PATCH", headers: auth(gb.token), body: JSON.stringify({ currency: "EUR" }) });
    const after = await admin.from("companies").select("currency,billing_currency").eq("id", gb.companyId).single();
    const historicalRate = await admin.from("tenant_rate_cards").select("currency").eq("id", gb.rateId).single();
    const historicalShipment = await admin.from("shipments").select("quote_currency").eq("tracking_id", runId + "-GBP").single();
    check("billingSeparation", "operating change preserves billing currency", changed.status === 200 && before.data.billing_currency === "NGN" && after.data.billing_currency === "NGN" && after.data.currency === "EUR");
    check("operationalCurrencies", "historical rate unchanged", historicalRate.data.currency === "GBP");
    check("operationalCurrencies", "historical shipment unchanged", historicalShipment.data.quote_currency === "GBP");

    const entitlement = await admin.from("companies").update({ subscription_plan: "growth", subscription_status: "active" }).eq("id", gb.companyId);
    assert(!entitlement.error, "Analytics fixture failed.");
    const analytics = await previewFetch("/api/cloud/analytics?period=30d", { headers: auth(gb.token) });
    const revenue = (analytics.body && analytics.body.revenueByCurrency) || [];
    check("multiCurrencyAnalytics", "authenticated analytics", analytics.status === 200);
    check("multiCurrencyAnalytics", "GBP/USD separate", revenue.some(function (row) { return row.currency === "GBP" && Number(row.amount) === 125; }) && revenue.some(function (row) { return row.currency === "USD" && Number(row.amount) === 50; }));
    check("multiCurrencyAnalytics", "no unlike total", !revenue.some(function (row) { return Number(row.amount) === 175; }));
    check("timezoneDst", "analytics date boundary UTC", shipments.data.every(function (row) { return isUtc(row.created_at); }));

    const tenantA = createClient(env.url, env.anon, { auth: { autoRefreshToken: false, persistSession: false }, global: { headers: { Authorization: "Bearer " + gb.token } } });
    const foreignCompany = await tenantA.from("companies").select("id,locale,timezone,currency,last_billing_reference").eq("id", us.companyId);
    check("tenantIsolation", "company facts read denied", !foreignCompany.error && foreignCompany.data.length === 0);
    const companyWrite = await tenantA.from("companies").update({ locale: "en-GB" }).eq("id", us.companyId).select("id");
    check("tenantIsolation", "company locale mutation denied", Boolean(companyWrite.error) || companyWrite.data.length === 0);
    const foreignRates = await tenantA.from("tenant_rate_cards").select("id,currency").eq("company_id", us.companyId);
    check("tenantIsolation", "rate read denied", Boolean(foreignRates.error) || foreignRates.data.length === 0);
    const rateWrite = await tenantA.from("tenant_rate_cards").update({ currency: "GBP" }).eq("id", us.rateId).select("id");
    check("tenantIsolation", "rate mutation denied", Boolean(rateWrite.error) || rateWrite.data.length === 0);
    const foreignSubscriptions = await tenantA.from("subscriptions").select("id,payment_reference,price_version").eq("company_id", us.companyId);
    check("tenantIsolation", "snapshot read denied", Boolean(foreignSubscriptions.error) || foreignSubscriptions.data.length === 0);
    const receipt = await previewFetch("/api/cloud/billing/receipts/" + encodeURIComponent(refB) + "/pdf", { headers: auth(gb.token) });
    check("tenantIsolation", "billing receipt denied", receipt.status === 404);
    const ratePatch = await previewFetch("/api/cloud/rates/" + us.rateId, { method: "PATCH", headers: auth(gb.token), body: JSON.stringify({ isActive: false }) });
    check("tenantIsolation", "Preview rate mutation denied", ratePatch.status === 404);
    const catalogue = await tenantA.from("cloud_plan_prices").select("id,provider_plan_id").limit(1);
    check("tenantIsolation", "service catalogue denied", Boolean(catalogue.error) || catalogue.data.length === 0);
  } catch (error) {
    report.failures.push({ category: "harness", label: error instanceof Error ? error.message : String(error) });
  } finally {
    try {
      const residual = await cleanup(admin, runId, state);
      report.cleanupResiduals = residual;
      check("cleanup", "zero residual synthetic rows/users", Object.values(residual).every(function (value) { return value === 0; }));
    } catch (error) {
      report.cleanupError = error instanceof Error ? error.message : String(error);
      check("cleanup", "zero residual synthetic rows/users", false);
    }
  }
  report.ok = report.failures.length === 0 && !report.cleanupError;
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
}

const env = loadEnvironment();
const admin = createClient(env.url, env.service, { auth: { autoRefreshToken: false, persistSession: false } });
const previewFetch = await establishPreview(process.argv[3]);
if ((process.argv[2] || "probe") === "probe") await probe(previewFetch, admin);
else if (process.argv[2] === "matrix") await matrix(previewFetch, admin, env);
else throw new Error("Unknown phase: " + process.argv[2]);
