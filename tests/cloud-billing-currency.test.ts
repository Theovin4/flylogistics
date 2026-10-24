import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { join } from "node:path";
import {
  CloudBillingCurrencyUnavailableError,
  resolveCloudPlanPrice
} from "../src/server/cloud-plan-prices";

type PriceRow = {
  id: string;
  plan: "starter" | "growth" | "scale";
  currency: string;
  amount: number;
  provider: "flutterwave";
  provider_plan_id: string;
  price_version: string;
  billing_interval: "monthly";
  active: boolean;
  effective_from: string;
};

function price(plan: PriceRow["plan"], currency: string, amount: number): PriceRow {
  return {
    id: currency + "-" + plan,
    plan,
    currency,
    amount,
    provider: "flutterwave",
    provider_plan_id: "test-" + currency.toLowerCase() + "-" + plan,
    price_version: "test-" + currency.toLowerCase() + "-v1",
    billing_interval: "monthly",
    active: true,
    effective_from: "2026-01-01T00:00:00.000Z"
  };
}

function priceClient(rows: PriceRow[], tables: string[] = [], currencies: string[] = []) {
  return {
    from(table: string) {
      tables.push(table);
      assert.equal(table, "cloud_plan_prices", "checkout must stop before any subscription/company write");
      const filters = new Map<string, unknown>();
      const chain = {
        select() { return chain; },
        eq(column: string, value: unknown) {
          filters.set(column, value);
          if (column === "currency") currencies.push(String(value));
          return chain;
        },
        lte() { return chain; },
        order() { return chain; },
        limit() { return chain; },
        async maybeSingle() {
          const found = rows.find((row) =>
            [...filters.entries()].every(([column, value]) => row[column as keyof PriceRow] === value)
          );
          return { data: found ?? null, error: null };
        }
      };
      return chain;
    }
  } as unknown as Parameters<typeof resolveCloudPlanPrice>[0];
}

function withNgnPlanEnvironment<T>(callback: () => Promise<T>) {
  const names = [
    "FLUTTERWAVE_CLOUD_STARTER_PLAN_ID",
    "FLUTTERWAVE_CLOUD_GROWTH_PLAN_ID",
    "FLUTTERWAVE_CLOUD_SCALE_PLAN_ID"
  ] as const;
  const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  for (const name of names) process.env[name] = "test-" + name.toLowerCase();
  return callback().finally(() => {
    for (const name of names) {
      const value = previous[name];
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });
}

test("explicit unconfigured foreign billing currencies are rejected without NGN fallback", async () => {
  for (const currency of ["USD", "GBP", "EUR", "GHS", "KES", "ZAR"]) {
    const queriedCurrencies: string[] = [];
    await assert.rejects(
      resolveCloudPlanPrice(priceClient([], [], queriedCurrencies), { plan: "starter", requestedCurrency: currency }),
      (error) => error instanceof CloudBillingCurrencyUnavailableError
        && error.currency === currency
        && error.publicMessage.startsWith(currency + " subscription billing is not available yet.")
    );
    assert.deepEqual([...new Set(queriedCurrencies)], [currency]);
  }
});

test("invalid and unsupported explicit billing currencies are rejected, not normalized to NGN", async () => {
  const invalidQueries: string[] = [];
  await assert.rejects(
    resolveCloudPlanPrice(priceClient([], [], invalidQueries), { plan: "starter", requestedCurrency: "US" }),
    (error) => error instanceof CloudBillingCurrencyUnavailableError && error.currency === null
  );
  assert.deepEqual(invalidQueries, []);

  const unsupportedQueries: string[] = [];
  await assert.rejects(
    resolveCloudPlanPrice(priceClient([], [], unsupportedQueries), { plan: "starter", requestedCurrency: "JPY" }),
    (error) => error instanceof CloudBillingCurrencyUnavailableError && error.currency === "JPY"
  );
  assert.deepEqual(unsupportedQueries, []);
});

test("missing legacy currency and explicit NGN retain certified NGN compatibility", async () => {
  await withNgnPlanEnvironment(async () => {
    for (const requestedCurrency of [null, "", "NGN"]) {
      const resolved = await resolveCloudPlanPrice(priceClient([]), { plan: "growth", requestedCurrency });
      assert.equal(resolved.requestedCurrency, "NGN");
      assert.equal(resolved.price.currency, "NGN");
      assert.equal(resolved.price.amount, 75000);
      assert.equal(resolved.price.configured, true);
      assert.equal(resolved.fallback, false);
    }
  });
});

test("a complete foreign catalogue selects the trusted foreign price and provider mapping", async () => {
  const client = priceClient([
    price("starter", "USD", 19),
    price("growth", "USD", 59),
    price("scale", "USD", 149)
  ]);
  const resolved = await resolveCloudPlanPrice(client, { plan: "growth", requestedCurrency: "USD" });
  assert.equal(resolved.requestedCurrency, "USD");
  assert.equal(resolved.price.amount, 59);
  assert.equal(resolved.price.currency, "USD");
  assert.equal(resolved.price.priceVersion, "test-usd-v1");
  assert.equal(resolved.price.providerPlanId, "test-usd-growth");
  assert.equal(resolved.fallback, false);
});

test("a partial foreign catalogue cannot prepare checkout", async () => {
  const client = priceClient([
    price("starter", "GBP", 19),
    price("growth", "GBP", 59)
  ]);
  await assert.rejects(
    resolveCloudPlanPrice(client, { plan: "growth", requestedCurrency: "GBP" }),
    CloudBillingCurrencyUnavailableError
  );
});

test("rejected checkout stops before snapshot, company mutation, or provider call", async () => {
  const tables: string[] = [];
  await assert.rejects(
    resolveCloudPlanPrice(priceClient([], tables), { plan: "starter", requestedCurrency: "USD" }),
    CloudBillingCurrencyUnavailableError
  );
  assert.ok(tables.length > 0);
  assert.ok(tables.every((table) => table === "cloud_plan_prices"));

  const billing = readFileSync(join(process.cwd(), "src/server/cloud-billing.ts"), "utf8");
  const checkoutStart = billing.indexOf("export async function createCloudSubscriptionCheckout");
  const checkoutBody = billing.slice(checkoutStart);
  const resolution = checkoutBody.indexOf("await resolveCloudPlanPrice");
  const snapshot = checkoutBody.indexOf("await persistCloudBillingCheckout");
  const provider = checkoutBody.indexOf("await createFlutterwaveCheckout");
  assert.ok(checkoutStart >= 0 && resolution >= 0);
  assert.ok(snapshot > resolution, "snapshot persistence must occur after strict currency resolution");
  assert.ok(provider > snapshot, "provider calls must occur after snapshot persistence");
});

test("checkout API is plan-only, maps unavailable currency to 409, and exposes a clear UI message", () => {
  const root = process.cwd();
  const route = readFileSync(join(root, "src/app/api/cloud/billing/checkout/route.ts"), "utf8");
  const dashboard = readFileSync(join(root, "src/components/cloud/cloud-dashboard.tsx"), "utf8");
  assert.match(route, /checkoutSchema = z\.object\(\{[\s\S]*?plan:/);
  assert.doesNotMatch(route, /checkoutSchema[\s\S]{0,300}(amount|providerPlanId|billingCurrency|priceVersion):/);
  assert.match(route, /CloudBillingCurrencyUnavailableError[\s\S]*status: 409/);
  assert.match(dashboard, /billingPriceError/);
  assert.match(dashboard, /Subscription billing prices are unavailable/);
});
