import assert from "node:assert/strict";
import test from "node:test";
import {
  canKeepSelfServiceRegistrationRole,
  matchesAuthenticatedRegistrationAccount
} from "../src/server/self-service-registration";

const registration = {
  userId: "synthetic-user-id",
  email: "certification@example.invalid"
};

test("self-service profile registration requires a matching authenticated account", () => {
  assert.equal(matchesAuthenticatedRegistrationAccount(null, registration), false);
  assert.equal(matchesAuthenticatedRegistrationAccount({ id: "another-user", email: registration.email }, registration), false);
  assert.equal(matchesAuthenticatedRegistrationAccount({ id: registration.userId, email: "other@example.invalid" }, registration), false);
  assert.equal(matchesAuthenticatedRegistrationAccount({ id: registration.userId, email: "CERTIFICATION@example.invalid" }, registration), true);
});

test("self-service profile registration cannot change an existing customer or driver role", () => {
  assert.equal(canKeepSelfServiceRegistrationRole("customer", "driver"), false);
  assert.equal(canKeepSelfServiceRegistrationRole("driver", "customer"), false);
  assert.equal(canKeepSelfServiceRegistrationRole("customer", "customer"), true);
  assert.equal(canKeepSelfServiceRegistrationRole("driver", "driver"), true);
  assert.equal(canKeepSelfServiceRegistrationRole(null, "customer"), true);
  assert.equal(canKeepSelfServiceRegistrationRole(undefined, "driver"), true);
});
