# Cloud Global Billing Configuration

## Release rule

A Fly Logistics Cloud billing currency is customer-visible and checkout-enabled only when all three Starter, Growth, and Scale prices have active catalogue rows with approved Flutterwave recurring-plan identifiers. The application never derives a subscription charge from FX data.

Browser checkout requests submit only the selected plan. The server resolves the amount, currency, price version, provider, provider plan ID, and billing interval. Invalid or unsupported explicit currencies and incomplete foreign catalogues return a safe HTTP 409 before a subscription snapshot, company billing mutation, or provider call.

Existing Nigeria pricing and provider-plan environment configuration remain unchanged:

- Starter: NGN 25,000 monthly
- Growth: NGN 75,000 monthly
- Scale: NGN 200,000 monthly

There are no NGN rows in the international catalogue. Existing subscriptions retain their stored amount, currency, provider plan, and price version.

## Approved `2026-global-v1` catalogue

All rows use `provider='flutterwave'` and `billing_interval='monthly'`.

| Currency | Starter amount / plan ID | Growth amount / plan ID | Scale amount / plan ID |
| --- | --- | --- | --- |
| USD | 37 / `172703` | 94 / `172704` | 331 / `172705` |
| GBP | 27.50 / `172706` | 70 / `172707` | 247 / `172708` |
| EUR | 33 / `172709` | 83.50 / `172710` | 295 / `172711` |
| GHS | 429 / `172712` | 1,090 / `172713` | 3,845 / `172714` |
| KES | 4,800 / `172715` | 12,200 / `172716` | 43,000 / `172717` |
| ZAR | 610 / `172718` | 1,550 / `172719` | 5,460 / `172720` |

The owner supplied these 18 provider plan IDs. They were not independently verified against the Flutterwave dashboard during this configuration task and must be checked there before production activation.

## Staging state

- Schema migration: `supabase/migrations/20261021135732_cloud_globalization.sql`
- Idempotent data migration: `supabase/migrations/20261025_cloud_global_billing_catalogue.sql`
- Staging registration: `20261025210813_cloud_global_billing_catalogue`
- Staging project: `vgrcfuaqxwidgdgtnved`
- Initial seed: 18/18 rows present and 0/18 active
- Controlled staging activation: 18/18 active in one transaction; each foreign currency is 3/3 active
- Final exact comparison: 18 rows, zero mapping mismatches, zero duplicate provider IDs, zero duplicate plan/currency keys, and zero NGN catalogue rows

The migration always writes the approved rows inactive. Activation is a separate controlled operation, so applying the data migration cannot expose foreign pricing by itself.

## Production rollout — pending and not authorized by staging certification

1. Apply the globalization schema migration to production.
2. Apply the catalogue data migration with all foreign rows inactive.
3. Verify the production schema, service-only grants, exact 18-row catalogue, uniqueness, and 0/18 active state.
4. Deploy the certified globalization application source.
5. Smoke-test the unchanged NGN Starter, Growth, and Scale resolution without making a real payment.
6. After independent Flutterwave dashboard confirmation and release approval, activate all 18 foreign rows in one controlled production transaction with a completeness precondition.
7. Verify the public catalogue shows NGN, USD, GBP, EUR, GHS, KES, and ZAR with the approved values, and verify server resolution for all 18 foreign combinations.
8. Monitor billing and runtime logs for catalogue, checkout, callback, and webhook errors; stop the rollout on any mismatch.

Production rollback must deactivate all 18 `2026-global-v1` foreign rows in one transaction. Do not delete the version or alter historical/in-flight payment snapshots. Confirm foreign currencies disappear, NGN remains unchanged, and then investigate before any reactivation.

## Provider verification checklist

Before production activation:

1. Confirm the merchant account supports recurring card subscriptions, settlement, and each approved currency.
2. Independently match every provider plan ID to its currency, amount, monthly interval, and Fly Logistics tier in Flutterwave.
3. Confirm the existing NGN provider mappings remain unchanged.
4. Exercise checkout, callback, webhook replay, cancellation, renewal, and failure paths only in an approved provider sandbox.
5. Record release approval and rollback ownership.

## Security invariants

- `cloud_plan_prices` has RLS enabled and no table grants for `anon` or `authenticated`; `service_role` retains the required access.
- Browser roles cannot query the table directly. Prices reach the public page through the server-controlled interface.
- Provider plan IDs are identifiers, not secrets, but client-supplied amounts, currencies, versions, providers, or plan IDs are ignored and never authoritative.
- Every checkout persists an immutable pending price snapshot before provider redirect.
- Callbacks and webhooks verify reference, success status, exact amount, exact currency, provider, price version, and provider plan when returned.
- Catalogue edits do not change an in-flight or historical payment snapshot.
- FX data is for estimates and reporting only, never charging or payment verification.
- Duplicate webhooks must not repeat company updates, subscription updates, invoices, or notifications.
