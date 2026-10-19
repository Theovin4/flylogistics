import assert from "node:assert/strict";
import test from "node:test";
import { resolveMerchantPrice } from "../src/server/merchant-pricing";

test("the active Merchant discount is exactly five percent of the standard customer price", () => {
  const customerPrice = 9_250;
  const merchantPrice = resolveMerchantPrice(customerPrice, { status: "ACTIVE", discount_rate: 0.05 });

  assert.equal(merchantPrice.standardPrice, customerPrice);
  assert.equal(merchantPrice.discountRate, 0.05);
  assert.equal(merchantPrice.discountAmount, 463);
  assert.equal(merchantPrice.finalPrice, 8_787);
});

test("merchant pricing cannot change the provider cost or a tenant rate card", () => {
  const providerCost = 7_000;
  const tenantRateCardPrice = 6_000;

  resolveMerchantPrice(9_250, { status: "ACTIVE", discount_rate: 0.05 });

  assert.equal(providerCost, 7_000);
  assert.equal(tenantRateCardPrice, 6_000);
});

test("inactive merchants receive the standard customer price", () => {
  assert.equal(resolveMerchantPrice(9_250, { status: "INACTIVE", discount_rate: 0.05 }).finalPrice, 9_250);
});
