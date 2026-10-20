import assert from "node:assert/strict";
import test from "node:test";
import { isShipmentDriver } from "../src/server/tenancy";

test("Fly driver profiles and Cloud driver memberships are both treated as shipment drivers", () => {
  assert.equal(isShipmentDriver("driver", null), true);
  assert.equal(isShipmentDriver("customer", "driver"), true);
  assert.equal(isShipmentDriver("customer", "owner"), false);
  assert.equal(isShipmentDriver("dispatcher", "driver"), false);
  assert.equal(isShipmentDriver("admin", "driver"), false);
});
