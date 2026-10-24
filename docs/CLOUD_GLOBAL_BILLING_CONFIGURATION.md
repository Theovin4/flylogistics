# Cloud Global Billing Configuration

## Release rule

A Fly Logistics Cloud billing currency is customer-visible and checkout-enabled only when all three Starter, Growth, and Scale prices have active catalogue rows with approved Flutterwave recurring-plan identifiers. The application must never derive a charge from FX data.

Existing Nigeria pricing remains unchanged:

- Starter: NGN 25,000 monthly
- Growth: NGN 75,000 monthly
- Scale: NGN 200,000 monthly

Existing active subscriptions retain their stored amount, currency, provider plan, and price version.

The 2026-10-24 blocker is closed. The resolver no longer substitutes NGN when an explicit foreign subscription currency lacks a complete catalogue. Invalid or unsupported codes and incomplete foreign catalogues return a safe HTTP 409 before a subscription snapshot, company billing mutation, or Flutterwave call. Only a missing legacy value or explicit NGN may use the existing NGN compatibility path.

Exact Preview `dpl_F4B1LaWbuTKPvB3f7bZ4edRHKzb3` at commit `7e6c6084596767dd0e062c5f82f62036af361899` passed the guarded staging retest 16/16. The unconfigured USD checkout path produced no subscription/company changes and ignored malicious client pricing facts. A complete temporary USD catalogue resolved USD 19/59/149 and the expected provider mappings without invoking checkout. Provider calls were zero, runtime error/Flutterwave log searches were empty, and cleanup residuals were zero. This certifies application fail-closed behavior; it does not replace the manual provider checklist below or authorize a production deployment.

## Provider configuration checklist

Complete this in an approved Flutterwave sandbox or dashboard before enabling a new currency. Never paste secret keys into this document.

| Currency | Starter plan ID | Growth plan ID | Scale plan ID | Catalogue version | Approved |
| --- | --- | --- | --- | --- | --- |
| NGN | Existing environment configuration | Existing environment configuration | Existing environment configuration | Legacy compatibility | Yes |
| USD | Required | Required | Required | Required | No |
| GBP | Required | Required | Required | Required | No |
| EUR | Required | Required | Required | Required | No |
| GHS | Required | Required | Required | Required | No |
| KES | Required | Required | Required | Required | No |
| ZAR | Required | Required | Required | Required | No |

For each currency:

1. Confirm Flutterwave supports recurring card subscriptions for the merchant account, settlement configuration, country, and currency. Provider support and account eligibility can differ.
2. Create separate monthly recurring plans for Starter, Growth, and Scale in the approved non-production environment first.
3. Record the provider plan identifiers in the service-only `cloud_plan_prices` catalogue with a new immutable `price_version`.
4. Verify amounts and currencies independently against the provider dashboard.
5. Activate all three rows in one controlled database change. Partial currency catalogues must remain hidden.
6. Run checkout, callback, webhook replay, cancellation, renewal, and failure tests with sandbox instruments.
7. Obtain release approval before repeating the controlled configuration in production.

## Security invariants

- Browser requests submit only the selected plan; the server resolves amount, currency, version, and provider plan.
- Every checkout creates a pending immutable price snapshot before redirecting to Flutterwave.
- Callbacks and webhooks verify transaction reference, successful status, exact amount, exact currency, provider, price version, and provider plan when Flutterwave returns it.
- Catalogue edits never change an in-flight or historical payment snapshot.
- FX cache data is for estimates and reporting only, never subscription charging or payment verification.
- Catalogue and FX tables are service-role only with row-level security enabled.
- Duplicate webhooks must not repeat company updates, subscription updates, invoices, or notifications.
