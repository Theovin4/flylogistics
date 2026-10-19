import assert from "node:assert/strict";
import test from "node:test";
import { existingExternalCarrierReference } from "../src/server/carrier-idempotency";

test("carrier creation is blocked when the same provider already has a real external reference", () => {
  assert.equal(existingExternalCarrierReference({
    carrier_provider: "fez_logistics",
    carrier_order_no: "FEZ-ORDER-123"
  }, "fez_logistics"), "FEZ-ORDER-123");
});

test("carrier creation permits first attempts, Fly placeholders, and a different provider", () => {
  assert.equal(existingExternalCarrierReference({ carrier_provider: "fez_logistics" }, "fez_logistics"), null);
  assert.equal(existingExternalCarrierReference({
    carrier_provider: "fez_logistics",
    carrier_tracking_id: "FLY-LAG-0001"
  }, "fez_logistics"), null);
  assert.equal(existingExternalCarrierReference({
    carrier_provider: "fez_logistics",
    carrier_order_id: "FEZ-ORDER-123"
  }, "sendbox"), null);
});
