import assert from "node:assert/strict";
import test from "node:test";
import { externalNotificationDeliveryPolicy } from "../src/server/notifications/delivery-policy";

test("admin external notifications are suppressed only on Vercel Preview", () => {
  assert.deepEqual(externalNotificationDeliveryPolicy({ VERCEL_ENV: "preview" }), {
    suppressed: true,
    reason: "vercel_preview"
  });
  assert.deepEqual(externalNotificationDeliveryPolicy({ VERCEL_ENV: "production" }), {
    suppressed: false,
    reason: null
  });
  assert.deepEqual(externalNotificationDeliveryPolicy({ VERCEL_ENV: "development" }), {
    suppressed: false,
    reason: null
  });
  assert.deepEqual(externalNotificationDeliveryPolicy({}), {
    suppressed: false,
    reason: null
  });
});
