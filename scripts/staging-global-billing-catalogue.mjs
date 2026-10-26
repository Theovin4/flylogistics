import process from "node:process";
import { createClient } from "@supabase/supabase-js";

const STAGING_REF = "vgrcfuaqxwidgdgtnved";
const PRODUCTION_REF = "igloqgojviveysjazhmu";
const PRICE_VERSION = "2026-global-v1";
const MATRIX = [
  ["starter", "USD", 37, "172703"], ["growth", "USD", 94, "172704"], ["scale", "USD", 331, "172705"],
  ["starter", "GBP", 27.5, "172706"], ["growth", "GBP", 70, "172707"], ["scale", "GBP", 247, "172708"],
  ["starter", "EUR", 33, "172709"], ["growth", "EUR", 83.5, "172710"], ["scale", "EUR", 295, "172711"],
  ["starter", "GHS", 429, "172712"], ["growth", "GHS", 1090, "172713"], ["scale", "GHS", 3845, "172714"],
  ["starter", "KES", 4800, "172715"], ["growth", "KES", 12200, "172716"], ["scale", "KES", 43000, "172717"],
  ["starter", "ZAR", 610, "172718"], ["growth", "ZAR", 1550, "172719"], ["scale", "ZAR", 5460, "172720"]
];
const DISPLAY = {
  NGN: ["₦25,000.00", "₦75,000.00", "₦200,000.00"],
  USD: ["$37.00", "$94.00", "$331.00"],
  GBP: ["£27.50", "£70.00", "£247.00"],
  EUR: ["€33.00", "€83.50", "€295.00"],
  GHS: ["GH₵429.00", "GH₵1,090.00", "GH₵3,845.00"],
  KES: ["KSh4,800.00", "KSh12,200.00", "KSh43,000.00"],
  ZAR: ["R610.00", "R1,550.00", "R5,460.00"]
};

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
  return {
    url,
    anon: process.env.STAGING_SUPABASE_ANON_KEY,
    service: process.env.STAGING_SUPABASE_SERVICE_ROLE_KEY
  };
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
    const response = await fetch(previewUrl + path, { ...options, headers, redirect: "manual" });
    const text = await response.text();
    let body = null;
    try { body = text ? JSON.parse(text) : null; } catch { body = text; }
    return { status: response.status, body, text };
  };
}

function normalizedRows(rows) {
  return rows.map((row) => [row.plan, row.currency, Number(row.amount), row.provider_plan_id]);
}

function sameMatrix(rows) {
  const order = (row) => row[1] + ":" + row[0];
  return JSON.stringify(normalizedRows(rows).sort((a, b) => order(a).localeCompare(order(b))))
    === JSON.stringify([...MATRIX].sort((a, b) => order(a).localeCompare(order(b))));
}

function extractPrices(html) {
  return [...html.matchAll(/text-4xl font-black">([^<]+)/g)].map((match) => match[1]);
}

function extractCurrencyOptions(html) {
  return [...html.matchAll(/href="\/cloud\/pricing\?currency=([A-Z]{3})"/g)].map((match) => match[1]);
}

async function remove(query, label) {
  const result = await query;
  if (result.error) throw new Error("Cleanup " + label + ": " + result.error.message);
}

const previewUrl = String(process.argv[2] || "").replace(/\/$/, "");
const deploymentId = String(process.argv[3] || "");
const shareArgument = String(process.argv[4] || "");
const shareUrl = shareArgument.startsWith("https://")
  ? shareArgument
  : Buffer.from(shareArgument, "base64").toString("utf8");
assert(/^dpl_[A-Za-z0-9]+$/.test(deploymentId), "Exact Preview deployment ID required.");
const env = loadEnvironment();
const admin = createClient(env.url, env.service, { auth: { autoRefreshToken: false, persistSession: false } });
const anonymous = createClient(env.url, env.anon, { auth: { autoRefreshToken: false, persistSession: false } });
const previewFetch = await establishPreview(previewUrl, shareUrl);
const runId = "codex-catalogue-" + new Date().toISOString().replace(/\D/g, "").slice(0, 12) + "-" + process.pid;
const state = { companyId: null, userId: null, email: runId + "@example.invalid", token: null, usdScaleDeactivated: false };
const password = "C0dex!" + runId + "Aa";
const report = {
  deployment: { id: deploymentId, url: previewUrl, target: "preview" },
  safety: { stagingRef: STAGING_REF, productionExcluded: true, providerCallsAllowed: false },
  counts: { pass: 0, fail: 0 },
  failures: []
};
function check(label, value) {
  report.counts[value ? "pass" : "fail"] += 1;
  if (!value) report.failures.push(label);
}

try {
  const health = await previewFetch("/api/health");
  check("Preview health", health.status === 200 && health.body?.ok === true);

  const catalogue = await admin.from("cloud_plan_prices")
    .select("plan,currency,amount,provider,provider_plan_id,price_version,billing_interval,active")
    .eq("price_version", PRICE_VERSION);
  assert(!catalogue.error, "Unable to read staging catalogue.");
  check("Exact active 18-row database matrix", catalogue.data.length === 18
    && catalogue.data.every((row) => row.active && row.provider === "flutterwave" && row.billing_interval === "monthly" && row.price_version === PRICE_VERSION)
    && sameMatrix(catalogue.data));

  const anonymousCatalogue = await anonymous.from("cloud_plan_prices").select("plan,currency,amount");
  check("Anonymous clients cannot read the catalogue", Boolean(anonymousCatalogue.error)
    && (!anonymousCatalogue.data || anonymousCatalogue.data.length === 0));

  for (const [currency, expected] of Object.entries(DISPLAY)) {
    const page = await previewFetch("/cloud/pricing?currency=" + currency);
    check(currency + " public pricing display", page.status === 200
      && JSON.stringify(extractPrices(page.text)) === JSON.stringify(expected)
      && page.text.includes("Billed as " + currency + " per month"));
  }

  const selector = await previewFetch("/cloud/pricing");
  check("All seven billing currencies advertised", JSON.stringify(extractCurrencyOptions(selector.text)) === JSON.stringify(Object.keys(DISPLAY)));

  const signup = await previewFetch("/api/cloud/signup", {
    method: "POST",
    body: JSON.stringify({
      companyName: "Codex Catalogue Safety",
      ownerName: "Codex Catalogue Owner",
      email: state.email,
      password,
      phone: "+2347000000000",
      slug: runId,
      country: "United States",
      locale: "en-US",
      timezone: "America/New_York",
      currency: "USD",
      billingCurrency: "USD"
    })
  });
  state.companyId = signup.body?.company?.id || null;
  assert(signup.status === 201 && state.companyId, "Synthetic tenant signup failed; HTTP " + signup.status + ".");
  const profile = await admin.from("user_profiles").select("id").eq("email", state.email).single();
  assert(!profile.error && profile.data?.id, "Synthetic profile missing.");
  state.userId = profile.data.id;
  const login = await previewFetch("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: state.email, password, expectedRole: "customer" })
  });
  state.token = login.body?.accessToken || null;
  assert(login.status === 200 && state.token, "Synthetic login failed; HTTP " + login.status + ".");
  const headers = { authorization: "Bearer " + state.token };
  check("Synthetic USD tenant authenticated", true);

  const configured = await previewFetch("/api/cloud/billing/prices", { headers });
  check("Configured USD tenant receives exact trusted prices", configured.status === 200
    && configured.body?.prices?.length === 3
    && configured.body.prices.every((row) => row.currency === "USD" && row.priceVersion === PRICE_VERSION && row.configured === true && row.fallbackCurrency === false)
    && configured.body.prices.every((row) => MATRIX.some(([plan, currency, amount]) => plan === row.plan && currency === "USD" && amount === row.amount)));

  const companyBefore = await admin.from("companies")
    .select("subscription_plan,subscription_status,billing_amount,billing_currency,last_billing_reference,flutterwave_subscription_id")
    .eq("id", state.companyId).single();
  const subscriptionsBefore = await admin.from("subscriptions").select("id", { count: "exact", head: true }).eq("company_id", state.companyId);
  assert(!companyBefore.error && !subscriptionsBefore.error, "Unable to capture pre-checkout state.");

  const deactivated = await admin.from("cloud_plan_prices")
    .update({ active: false })
    .eq("price_version", PRICE_VERSION).eq("currency", "USD").eq("plan", "scale")
    .select("id").single();
  assert(!deactivated.error, "Unable to deactivate USD Scale safely.");
  state.usdScaleDeactivated = true;

  const incompletePublic = await previewFetch("/cloud/pricing?currency=USD&_audit=" + runId);
  check("Incomplete USD disappears from public selector", incompletePublic.status === 200
    && !extractCurrencyOptions(incompletePublic.text).includes("USD")
    && incompletePublic.text.includes("Billed as NGN per month"));

  const incompletePrices = await previewFetch("/api/cloud/billing/prices", { headers });
  check("Incomplete USD price API fails closed", incompletePrices.status === 409
    && incompletePrices.body?.code === "CLOUD_BILLING_CURRENCY_UNAVAILABLE"
    && incompletePrices.body?.prices?.length === 0);

  const incompleteCheckout = await previewFetch("/api/cloud/billing/checkout", {
    method: "POST", headers, body: JSON.stringify({ plan: "growth", amount: 1, currency: "NGN", providerPlanId: "attacker" })
  });
  check("Incomplete USD checkout fails closed", incompleteCheckout.status === 409
    && incompleteCheckout.body?.code === "CLOUD_BILLING_CURRENCY_UNAVAILABLE"
    && !JSON.stringify(incompleteCheckout.body).includes("attacker"));

  const subscriptionsAfter = await admin.from("subscriptions").select("id", { count: "exact", head: true }).eq("company_id", state.companyId);
  const companyAfter = await admin.from("companies")
    .select("subscription_plan,subscription_status,billing_amount,billing_currency,last_billing_reference,flutterwave_subscription_id")
    .eq("id", state.companyId).single();
  check("Rejected checkout has zero billing side effects", !subscriptionsAfter.error && !companyAfter.error
    && subscriptionsAfter.count === subscriptionsBefore.count
    && JSON.stringify(companyAfter.data) === JSON.stringify(companyBefore.data));
} catch (error) {
  report.failures.push(error instanceof Error ? error.message : String(error));
  report.counts.fail += 1;
} finally {
  try {
    const restored = await admin.from("cloud_plan_prices")
      .update({ active: true })
      .eq("price_version", PRICE_VERSION).eq("currency", "USD").eq("plan", "scale")
      .select("id").single();
    if (restored.error) throw restored.error;
    state.usdScaleDeactivated = false;
    const restoredCatalogue = await admin.from("cloud_plan_prices").select("id", { count: "exact", head: true }).eq("price_version", PRICE_VERSION).eq("active", true);
    check("Complete catalogue restored 18/18 active", !restoredCatalogue.error && restoredCatalogue.count === 18);

    const restoredPage = await previewFetch("/cloud/pricing?currency=USD&_audit=restored-" + runId);
    check("Restored USD returns to public pricing", restoredPage.status === 200
      && JSON.stringify(extractPrices(restoredPage.text)) === JSON.stringify(DISPLAY.USD)
      && extractCurrencyOptions(restoredPage.text).includes("USD")
      && restoredPage.text.includes("Billed as USD per month"));
    if (state.token) {
      const restoredPrices = await previewFetch("/api/cloud/billing/prices", {
        headers: { authorization: "Bearer " + state.token }
      });
      check("Restored USD API returns the complete catalogue", restoredPrices.status === 200
        && restoredPrices.body?.prices?.length === 3
        && restoredPrices.body.prices.every((row) => row.currency === "USD" && row.configured === true));
    }

    if (state.companyId) {
      await remove(admin.from("subscriptions").delete().eq("company_id", state.companyId), "subscriptions");
      await remove(admin.from("audit_logs").delete().eq("company_id", state.companyId), "audit logs");
      await remove(admin.from("company_members").delete().eq("company_id", state.companyId), "membership");
    }
    if (state.userId) await remove(admin.from("user_profiles").delete().eq("id", state.userId), "profile");
    if (state.companyId) await remove(admin.from("companies").delete().eq("id", state.companyId), "company");
    if (state.userId) {
      const deleted = await admin.auth.admin.deleteUser(state.userId);
      if (deleted.error) throw deleted.error;
    }
    const companyResidual = await admin.from("companies").select("id", { count: "exact", head: true }).eq("id", state.companyId || "00000000-0000-0000-0000-000000000000");
    const profileResidual = await admin.from("user_profiles").select("id", { count: "exact", head: true }).eq("email", state.email);
    const membershipResidual = await admin.from("company_members").select("id", { count: "exact", head: true }).eq("company_id", state.companyId || "00000000-0000-0000-0000-000000000000");
    const subscriptionResidual = await admin.from("subscriptions").select("id", { count: "exact", head: true }).eq("company_id", state.companyId || "00000000-0000-0000-0000-000000000000");
    const userResidual = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    check("Synthetic tenant cleanup zero", !companyResidual.error && companyResidual.count === 0
      && !profileResidual.error && profileResidual.count === 0
      && !membershipResidual.error && membershipResidual.count === 0
      && !subscriptionResidual.error && subscriptionResidual.count === 0
      && !userResidual.error
      && userResidual.data.users.every((user) => String(user.email || "").toLowerCase() !== state.email));
  } catch (error) {
    report.failures.push("Cleanup/restore: " + (error instanceof Error ? error.message : String(error)));
    report.counts.fail += 1;
  }
}

report.providerCalls = report.counts.fail === 0 ? 0 : "not-proven";
report.productionMutations = 0;
report.ok = report.counts.fail === 0 && report.failures.length === 0 && state.usdScaleDeactivated === false;
console.log(JSON.stringify(report, null, 2));
if (!report.ok) process.exitCode = 1;
