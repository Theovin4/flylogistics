# Fly Logistics Cloud globalization audit

Baseline: production `a6773f933e7655c91a44c68be38583429b38d6e4`  
Development branch: `cloud-globalization`  
Production database and deployment are out of scope for this work.

## Executive finding

The repository contains two different product contexts that must not be conflated:

1. The existing Fly Logistics Nigeria operation intentionally prices Nigerian services in NGN, uses Nigerian routes and state codes, normalizes local phone numbers, and integrates Nigerian carriers. Those assumptions are product behaviour and must remain stable.
2. Fly Logistics Cloud is a tenant SaaS product. Its workspace currently inherits NGN, `en-NG`, `Africa/Lagos`, `Nigeria`, browser/server timezone formatting, and Nigeria-labelled service defaults in places where the tenant's own country, locale, timezone, operational currency, rate currency, or subscription billing currency should be authoritative.

## Incorrect Cloud tenant assumptions

| Area | Evidence | Risk | Required direction |
| --- | --- | --- | --- |
| Plan model | `src/lib/cloud-plans.ts` combines entitlements with NGN amounts and environment-variable plan IDs. | Adding a currency duplicates feature definitions and makes provider configuration client-adjacent. | Keep entitlements static; resolve prices and provider mappings server-side from a versioned catalogue. |
| Signup | `src/app/api/cloud/signup/route.ts` always stores `billing_currency = NGN` and does not collect country, timezone, operating currency, or locale. | Every new tenant starts as Nigerian regardless of its operation. | Validate ISO country/currency and IANA timezone on the server; accept browser timezone only as an owner-confirmed suggestion. |
| Signup UI | `src/components/cloud/cloud-auth-form.tsx` collects identity only. | International configuration is deferred and silently defaults to Nigeria. | Add searchable country/timezone/currency selectors and show billing currency separately. |
| Settings | `src/components/cloud/cloud-dashboard.tsx` uses free-text country/timezone/currency fields and Nigerian fallbacks. | Invalid canonical values and accidental currency changes are possible. | Use validated selectors, locale-aware warnings, and preserve historical rate/shipment currency. |
| Settings API | `src/app/api/cloud/settings/route.ts` checks shape but not ISO/IANA validity. | Invalid timezones or currencies can be persisted and later crash formatting. | Normalize and validate canonical values server-side. |
| Money display | `src/components/cloud/cloud-dashboard.tsx`, `cloud-operations-workspace.tsx`, and the public Cloud pricing page use NGN or locale-free `toLocaleString`. | Non-Nigerian tenants see incorrect symbols/grouping; rate currencies can be mislabeled. | Centralize `formatMoney(amount, currency, locale)` and use the record's currency. |
| Date/time display | `cloud-dashboard.tsx` and `cloud-customer-portal.tsx` use direct locale methods without tenant timezone. | Results vary with operator browser/server timezone and fail DST expectations. | Centralize tenant date/time formatting with an IANA timezone and safe UTC fallback. |
| Rate cards | The table already has `currency`, but the UI/API default it to NGN. | Multi-currency tenant rates are possible in storage but not safely presented. | Default new cards from `company.currency`; keep each card's currency; never aggregate unlike currencies. |
| Analytics | `src/app/api/cloud/analytics/route.ts` sums shipment monetary values into one `revenue` number without selecting a currency; UI labels it NGN. | Mixed-currency totals are meaningless. | Return revenue grouped by stored shipment/rate currency; do not synthesize a total across currencies. |
| Billing checkout | `src/server/cloud-billing.ts` derives amount/currency/provider plan from the NGN static plan object. | Client plan selection can only resolve NGN and provider mappings cannot be independently controlled. | Resolve an active server-only catalogue row by plan and approved billing currency. |
| Pending payment snapshot | Pending facts are spread across mutable company fields and subscription metadata. | A later price change can invalidate or misverify an earlier checkout. | Persist immutable plan, amount, currency, version, provider and provider-plan snapshot against the unique reference before returning checkout. |
| Payment verification | `validateCloudPaymentFacts` compares against the current static NGN plan. | Price-version changes and non-NGN verification are unsafe. | Verify the provider result against the immutable pending snapshot, including tenant, reference, amount, currency, plan, version, provider mapping, and transaction id. |
| Webhook processing | Plan is partly inferred from the reference and amount/currency fall back to mutable company/static plan values. | A changed catalogue or mismatched provider event can activate the wrong terms. | Load the pending snapshot by reference and preserve idempotency before activation. |
| Billing email | `sendCloudBillingEmail` formats with `en-NG` and writes `NGN` literally. | Foreign-currency receipts are mislabeled. | Format the actual snapshot currency with the tenant locale. |
| Receipts | Receipt currency has an NGN fallback and date generation uses Nigerian/server formatting in the shared PDF code. | Missing fields leak Nigerian assumptions into Cloud receipts. | Pass snapshot currency, tenant locale, and tenant timezone explicitly. |
| Public pricing | `src/app/cloud/pricing/page.tsx` server-renders only NGN. | International visitors cannot distinguish operational currency, estimate, and billed currency. | Server-render stable NGN by default, then offer only currencies with configured catalogue prices. |
| FX | No Cloud FX abstraction or cache exists. | Estimates could be trusted from the browser or accidentally alter billing. | Add a server-only provider abstraction and cached rate store; estimates never determine a charge. |

## Existing locale fields

`companies.country`, `companies.timezone`, `companies.currency`, and `companies.billing_currency` already exist and should remain the canonical tenant settings. A `locale` field is justified because language/formatting cannot be reliably inferred from country alone (for example Canada, Switzerland, and multilingual countries). Existing companies must retain their current values; the compatibility locale fallback remains `en-NG` until an owner changes it.

All timestamps remain `timestamptz`/UTC. Tenant-local rendering must use `Intl.DateTimeFormat` with the configured IANA zone so daylight-saving transitions are handled by the runtime's timezone database.

## Intentional Nigeria behaviour to preserve

The following findings are outside the Cloud globalization correction unless a Cloud-specific data path explicitly reuses them:

- Public Fly Logistics quote and booking flows in `src/components/shipments/**` and `src/server/pricing.ts`.
- Nigerian state-code, local/import/export route, and distance logic in `src/lib/pricing.ts` and `src/server/operations-intelligence.ts`.
- Customer and merchant portal NGN defaults, wallet currency, Nigerian shipping rate copy, and existing 5% merchant pricing.
- FEZ/Sendbox carrier payload defaults, Nigeria pickup semantics, and carrier quote currency.
- Existing Flutterwave shipment/wallet/payment flows outside Cloud subscriptions.
- Nigerian SEO pages, local-rate documents, marketing copy, and public price examples.
- The three existing Cloud NGN subscription prices: Starter 25,000; Growth 75,000; Scale 200,000, including their current provider plan IDs.

## Data-model gaps

- No server-controlled, versioned Cloud plan-price catalogue exists.
- `subscriptions` lacks first-class immutable `price_version`, `provider`, `provider_plan_id`, `billing_interval`, and provider transaction-id snapshot columns.
- No cached FX-rate table exists.
- `shipments` stores monetary values and `quote_currency`, so Cloud analytics must select that currency and group totals rather than infer the company default.

## Security constraints for implementation

- Catalogue and FX tables must have RLS enabled and no `anon` or `authenticated` table privileges or policies.
- Only `service_role` may read/write provider plan IDs and billing catalogue records.
- Checkout accepts only a plan choice; the server resolves every billing fact.
- Provider-plan IDs never come from the browser and never use an NGN mapping for another currency.
- Active subscription currency is not mutated in place.
- No live provider plan creation or charge is part of this development task.

## Initial supported billing currency architecture

The application may recognize `NGN`, `USD`, `GBP`, `EUR`, `GHS`, `KES`, and `ZAR`, but checkout is enabled only for an active, explicitly configured catalogue row whose provider plan ID has been manually created and verified. Operational currency remains independent and may be any valid ISO-4217 code supported by the tenant's rate cards.

## Migration boundary

The required migration is additive: tenant locale, a versioned service-only plan-price catalogue, immutable pending/active subscription snapshot fields, and a service-only FX cache. It must be applied and verified on staging `vgrcfuaqxwidgdgtnved` only. Production `igloqgojviveysjazhmu` must remain untouched.
