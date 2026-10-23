# Fly Logistics Codex Handoff

## Authoritative current checkpoint — 2026-10-19 (Africa/Lagos)

This section supersedes the historical checkpoints below.

- Repository: `C:\Users\USER\Documents\New project\fly-logistics`
- Branch: `pre-deployment-cloud-verification`
- Remote: `https://github.com/Theovin4/flylogistics.git`
- Verified base commit: `3954b313b8b9f678d9dba3010a552553e89dfa17`
- Staging Supabase: `vgrcfuaqxwidgdgtnved`; production `igloqgojviveysjazhmu` was not mutated.
- No push, merge, Preview deployment, production deployment, payment, notification, or carrier booking occurred in this checkpoint.

### Current architecture

- Next.js 15 App Router, React 19, TypeScript, Supabase Auth/Postgres/RLS, Vercel, Flutterwave, FEZ, and Sendbox.
- Tenant ownership is `company_id`-scoped in server routes and RLS. Plans and entitlements live in `src/lib/cloud-plans.ts` and `src/server/tenancy.ts`.
- Flutterwave verification/webhooks live in `src/server/cloud-billing.ts`; carriers are abstracted by `src/server/carriers.ts`.

### Completed and verified

- Preserved prior staging passes: Growth limits; Starter downgrade/trial expiry; 54/54 bilateral isolation; 6/6 tracking privacy; internal-membership cleanup; mismatched-driver POD rejection; genuine token expiry; ownership cases; and 48-case authenticated mobile sweep.
- Applied `20261017_cloud_scale_features.sql` only to staging as `20261019151314 cloud_scale_features`.
- Verified Scale tables have RLS, no anon/authenticated DML grants, and service-role DML only.
- Added Preview-only suppression of external admin email/WhatsApp while retaining the operational event. Production/development behavior is unchanged.
- Added a same-provider carrier-create replay guard when a genuine external reference already exists.
- Added exact pricing tests: Customer NGN 9,250, Merchant NGN 8,787 after one rounded 5% discount; provider cost and tenant rates remain independent.
- `npm run validate` passed TypeScript, ESLint, secret scan, and 58/58 tests.
- Environment-free production build passed and generated 159/159 static pages without loading `.env.local`.

### Database migrations

- `20260920_cloud_operations_remediation.sql`
- `20260930_merchant_portal_foundation.sql`
- `20261004_cloud_white_label_contacts.sql`
- `20261014_service_only_event_tables.sql`
- `20261017_cloud_scale_features.sql` — applied and verified on staging only.

### Outstanding tasks and known issues

- The three inherited runtime variables were absent, so the new notification, Scale API, and carrier replay controls could not be retested on the protected READY Preview.
- Manually confirm Flutterwave dashboard mappings: Starter NGN 25,000/month, Growth NGN 75,000/month, Scale NGN 200,000/month. No payment was attempted.
- Use approved FEZ/Sendbox sandbox credentials for quote/create/status/cancel tests. No booking was attempted.
- Supabase leaked-password protection remains disabled. Nine caller-scoped `SECURITY DEFINER` helper warnings remain pending controlled redesign.
- Scale tables' RLS-without-policy findings are intentional: they are service-only and have no anon/authenticated DML grants.

### Important commands and next action

- `npm run validate`
- Run `npm run build` only in an environment-free copy for staging certification.
- Next: commit the local candidate, restore authorized staging/Preview variables, deploy only this branch to Preview, and retest notification suppression, Scale APIs/isolation, and carrier replay protection. Do not use `.env.local` or promote to production.

### Current checklist

- [x] Recover and preserve existing work.
- [x] Apply and verify Scale staging migration.
- [x] Add notification suppression, pricing, and carrier idempotency coverage.
- [x] Pass full validation and environment-free build.
- [ ] Deploy candidate to Preview and retest new controls.
- [ ] Confirm Flutterwave provider mappings.
- [ ] Run approved FEZ/Sendbox sandbox lifecycle.
- [ ] Approve controlled production deployment.

**NOT READY FOR PRODUCTION DEPLOYMENT**

## Cloud globalization checkpoint — 2026-10-23 (Africa/Lagos)

This section supersedes older globalization and staging-migration status above.

- Repository: `C:\Users\USER\Documents\New project\fly-logistics`
- Branch: `cloud-globalization`
- Baseline commit: `a6773f933e7655c91a44c68be38583429b38d6e4`
- Production remains unchanged. No production deployment, database write, payment, notification, or carrier booking occurred.
- Tenant globalization now uses ISO country codes, IANA timezones, BCP 47 locales, and per-record ISO currencies. Nigeria remains the backward-compatible default.
- Cloud plan entitlements are separate from the versioned billing catalogue. Existing NGN prices remain Starter 25,000, Growth 75,000, and Scale 200,000 monthly.
- Checkout accepts only a plan selection. The server resolves and persists an immutable price/currency/provider-plan/version snapshot before redirecting to Flutterwave; an unpaid attempt does not change active company billing facts.
- Callback and webhook verification use the persisted snapshot and do not re-resolve the live catalogue. Duplicate webhook state exits before database or notification side effects.
- Public pricing advertises a currency only when active Starter, Growth, and Scale catalogue rows are present. FX data is isolated from charging and payment verification.
- Local validation passed TypeScript, ESLint, client-secret scanning, and 67/67 tests. An environment-free production build passed and generated 158/158 static pages.
- Migration `20261021135732_cloud_globalization.sql` was applied only to staging project `vgrcfuaqxwidgdgtnved`, registered as `20261023210455_cloud_globalization`.
- Staging verification: locale column present; five subscription snapshot columns present; catalogue and FX tables have RLS; `anon` and `authenticated` have no table access; `service_role` has access; both tables contain zero rows.
- Supabase reports the two new tables as RLS-without-policy. This is intentional service-only posture, not a missing tenant policy.
- No foreign-currency Flutterwave provider plans were invented or activated. See `docs/CLOUD_GLOBAL_BILLING_CONFIGURATION.md` for the controlled provider checklist.

### Progress checklist

- [x] Recover and audit the existing globalization work.
- [x] Preserve Nigeria behavior and existing subscription values.
- [x] Add locale-aware UI, record-currency formatting, and currency-grouped analytics.
- [x] Add service-only versioned plan catalogue and FX cache migration.
- [x] Bind checkout, callback, and webhook handling to immutable billing snapshots.
- [x] Add catalogue-change and webhook-replay regression checks.
- [x] Pass full local validation and an environment-free production build.
- [x] Apply and verify the additive migration on staging only.
- [ ] Commit and push the release candidate, excluding the pre-existing untracked runtime script.
- [ ] Deploy only the branch to Preview and verify the exact matching deployment.
- [ ] Run synthetic international tenant and billing runtime checks, then verify complete cleanup.
- [ ] Obtain Flutterwave dashboard confirmation for every enabled currency/plan mapping.

### Next recommended action

Commit and push the validated branch, wait for its exact Vercel Preview to become READY, then run only staging-safe synthetic international tenant scenarios. Do not enable a non-NGN billing currency until all three approved Flutterwave recurring plan IDs for that currency are configured and independently verified.

**NOT READY FOR PRODUCTION DEPLOYMENT**

## Authenticated staging checkpoint — 2026-10-16

- Repository: `C:\Users\USER\Documents\New project\fly-logistics`
- Branch: `pre-deployment-cloud-verification`
- Verified commit: `4a5c8b7897bc90a21d3ebd9c418ace90bbe713a1`
- Preview deployment: `dpl_EwgB2TpSe18ZWK6qP6mn8wXCNGyA`, READY and matched to the branch/commit.
- Staging Supabase: `vgrcfuaqxwidgdgtnved`.
- Production Supabase: `igloqgojviveysjazhmu`; it remained read-only and received no certification writes.
- No production deployment, merge, carrier order, notification, or payment was performed.

### Verified in this checkpoint

- `npm run validate`: TypeScript, ESLint, client-secret scan, and 38/38 tests passed.
- `npm run build`: passed and generated 159 pages.
- Starter staging runtime: driver #11 returned 403 and count stayed 10; seats 2-5 succeeded, seat #6 returned 409, and count stayed 5; advanced analytics, AI dispatch, and WhatsApp APIs returned 403.
- `crypto_payment_requests` and `resend_webhook_events`: anon INSERT/UPDATE/DELETE returned 401; normal authenticated operations returned 403; service-role INSERT/UPDATE/DELETE succeeded in a rollback-only transaction.
- SECURITY DEFINER audit: anon can execute none of the audited functions; authenticated access is limited to the nine caller-scoped RLS helpers; trigger/wallet functions are service-only. Anonymous and authenticated roles cannot create objects in `public`.
- Public Cloud landing, signup, and login pages had no horizontal overflow at 320, 360, 375, 390, 430, or 768 px. Protected workspace routes correctly redirected unauthenticated requests to `/cloud/login`.

### Current release blockers

1. Authenticated Preview POST automation is incomplete: the local Vercel CLI login expired and deployment protection rejected POSTs made through a short-lived share bypass. Do not weaken protection as a workaround.
2. Growth and Scale runtime boundaries and success paths remain uncertified through Preview.
3. Trial-expiry HTTP 402, downgrade preservation, two-tenant direct API/RLS isolation, role-escalation attempts, shipment/POD workflow, runtime tenant pricing, and authenticated workspace responsive layouts remain incomplete.
4. Flutterwave provider-side plan amounts require dashboard verification; FEZ and Sendbox require approved sandbox verification.
5. Fly-as-carrier linked tenant/fulfilment shipment architecture is not implemented as a completed runtime feature.

### Safe next action

Refresh authorized Vercel CLI access for `flylogistics`, pull Preview-only variables to a temporary ignored file, re-verify the staging ref, and run the remaining authenticated matrix. Never use the existing `.env.local` for runtime certification: it resolves to production Supabase.

### Current decision

`NOT READY FOR PRODUCTION DEPLOYMENT`

Last updated: 2026-10-14 (Africa/Lagos)

## Recovery checkpoint

- Repository: `C:\Users\USER\Documents\New project\fly-logistics`
- Branch: `main`
- Remote: `https://github.com/Theovin4/flylogistics.git`
- Latest local commit: `fa9de4b` (`perf: isolate cloud workspace rendering`)
- Git state at recovery: `main` is five commits ahead of `origin/main`; the uncommitted admin command-center batch contains 22 modified files and 6 new files.
- Safety: no reset, clean, database mutation, production shipment, customer notification, payment, or deployment was performed.
- Baseline verification: `npm run validate` passed TypeScript, ESLint, the client-secret scan, and 25 tests on 2026-10-13.
- Continuation verification: the full `npm run build` passed on 2026-10-13, including 30 tests and generation of 159 static pages.
- Billing-hardening checkpoint: Cloud activation now requires independently verified Flutterwave status, exact trusted plan amount, NGN currency, transaction reference, and pending company plan. Duplicate webhook states short-circuit before repeated side effects. The focused suite now contains 33 passing tests.
- Final local checkpoint: remaining legacy operational mutations (POD, carrier create/rates/sync, driver update/location, notifications, and AI dispatch) now use the central entitlement resolver and tenant scope. `npm run build` passed with 34/34 tests and 159 generated pages on 2026-10-14.
- External checkpoint: the linked Vercel project is `flylogistics` (`prj_3Fd9oQ9QzaIJ4C72ESzrK58KAwaU`); `flylogistics.com.ng` and `www.flylogistics.com.ng` are verified domains. The current READY production deployment is still commit `fa9de4b`; this recovery batch has not been deployed.
- Pre-deployment remediation checkpoint: local backup branch `backup/pre-deployment-remediation-2026-10-14` points to `fa9de4b`. Shipment creation now uses a central trusted-ID ownership resolver; global Fly administrators cannot inherit a stale tenant profile, Cloud operators remain tenant-scoped, and an administrator acting for a tenant must send an explicit server-verified tenant UUID. TypeScript and 4 focused ownership tests pass. No production shipment was changed.
- Verification checkpoint: `npm run validate` passed TypeScript, ESLint, client-secret scanning, and 38/38 tests. `npm run build` then passed with the same 38 tests and 159 generated pages. This remains local and undeployed.

## Current architecture

- Next.js 15 App Router, React 19, and TypeScript.
- Supabase Auth/Postgres with server-side service-role access, tenant-scoped `company_id` queries, and RLS migrations.
- Fly Logistics Cloud workspace under `/cloud/(workspace)` with tenant context resolved in the persistent layout.
- Flutterwave Cloud subscriptions with trusted server plan definitions in `src/lib/cloud-plans.ts` and billing persistence in `src/server/cloud-billing.ts`.
- Tenant rates in `tenant_rate_cards`, calculated server-side by `src/server/tenant-pricing.ts`.
- Vercel production deployment; third-party fulfilment remains behind Fly Logistics carrier abstractions.

## Completed work recovered

- Tenant-scoped customers, rates, team, analytics, portal tracking, branding, and Cloud workspace routes.
- Customer, merchant, Cloud, carrier, tracking, notification, and admin security regression coverage.
- Persistent server-resolved Cloud branding and route-group isolation.
- Consolidated admin command center is present as uncommitted, validated work.

## Outstanding work

- Create a safe Supabase staging branch/environment. The connected Fly Logistics project currently reports no database branches, so authenticated destructive/runtime checks must not use production.
- Configure `FLY_INTERNAL_COMPANY_ID` in Vercel preview and production after confirming the exact corporate company UUID. It was absent from the environment-name inventory on 2026-10-14.
- Verify the Flutterwave dashboard mappings manually: Starter NGN 25,000/month, Growth NGN 75,000/month, Scale NGN 200,000/month. The three plan-ID variables exist in Vercel preview and production, but provider-side amounts were not available.
- Run authenticated Starter/Growth/Scale, expired-trial, downgrade-overage, two-tenant isolation, mobile viewport, customer journey, POD, and carrier handoff tests against staging test tenants.
- Reconcile local SQL migrations with the Supabase migration registry. Production reports only three registered migrations, which do not match all three repository migration filenames.
- Review and remediate Supabase security-advisor findings before certification, especially authenticated execution of nine `SECURITY DEFINER` functions, two RLS-enabled tables without policies, and leaked-password protection being disabled.
- Apply and verify `20261014_service_only_event_tables.sql` on staging. It documents the intended service-only posture for `crypto_payment_requests` and `resend_webhook_events`; it has not been applied to production.
- Redesign or explicitly accept the nine authenticated-executable helper functions only after staging RLS regression tests. They are currently used by RLS policies, have fixed `search_path=public`, schema-qualified object references, and return caller-scoped context; blindly revoking `EXECUTE` could break tenant policies.
- Review explicit Data API grants. Several tenant tables still expose broad `anon`/`authenticated` table grants and depend on RLS; do not change production grants without staging verification.

## Known issues

- No safe staging database is connected, so runtime entitlement certification is incomplete.
- The production database contains one expired and one active trial record, but no production tenant was mutated for testing.
- Database RLS is tenant-scoped, and staff/driver limit triggers exist, but plan entitlement behavior has not been proven through direct authenticated Data API bypass attempts.
- `FLY_INTERNAL_COMPANY_ID` is missing from the linked Vercel project environments; ordinary tenant logic must not be weakened as a workaround.
- Supabase security advisor reports two RLS tables without policies, nine authenticated-executable `SECURITY DEFINER` functions, and leaked-password protection disabled.
- Shipment ownership history for `FLY-2026-BFYJJ6RM` and `FLY-2026-FQAKYGLC` is ambiguous: both are stored under 360 Logistics, while their create audit rows carry Fly Logistics' company ID and an operations message. The actor was a global `customer`, 360 Logistics owner, and Fly Logistics customer. Both already have FEZ references. **MANUAL REVIEW REQUIRED; do not reassign automatically.** A read-only contamination comparison found no additional mismatches under the same heuristic.
- Supabase performance advisor reports unindexed foreign keys, per-row auth function evaluation, overlapping permissive policies, and duplicate indexes. These are not production-blocking code errors but require a controlled database remediation phase.
- Live unauthenticated content was reachable for `/` and `/cloud` through the web verifier. The local Windows TLS client could not complete deeper route smoke checks, so those routes remain manually required.

## Important commands

- `npm run validate` — TypeScript, ESLint, secret scan, and tests.
- `npm run build` — full validated production build plus Prisma generation.
- `npm run db:verify:supabase` — non-destructive schema verification.
- `npm run security:scan` — checks client-facing code for private environment variables.

## Database migrations

- `20260920_cloud_operations_remediation.sql`
- `20260930_merchant_portal_foundation.sql`
- `20261004_cloud_white_label_contacts.sql`
- `20261014_service_only_event_tables.sql` (local only; staging verification required)

## Deployment requirements

- Do not deploy until validation, production build, tenant-isolation tests, entitlement tests, billing idempotency tests, and staging migration verification pass.
- Use Flutterwave sandbox/mocks for payment tests and staging carrier credentials for fulfilment tests.
- Do not print environment-variable values in logs or reports.

## Progress checklist

- [x] Locate authoritative repository and branch.
- [x] Preserve and inventory uncommitted work.
- [x] Recover prior-session context and latest verified deployment notes.
- [x] Run baseline TypeScript, lint, secret scan, and test suite.
- [x] Implement authoritative subscription entitlements.
- [x] Harden expired-trial handling and initial server-side plan gates.
- [x] Reject manipulated Cloud payment amount, currency, reference, status, or plan mappings.
- [x] Add duplicate Cloud webhook state protection.
- [x] Add deterministic tenant pricing and a no-side-effect simulator.
- [x] Fix mobile Cloud navigation with a swipeable horizontal tab bar.
- [x] Run full local production build.
- [x] Audit legacy operational mutations and close role-only entitlement bypasses.
- [x] Verify Vercel project/domain linkage and Flutterwave plan-ID variable presence without reading values.
- [x] Run production Supabase advisors and inspect tenant RLS/grants/triggers read-only.
- [x] Add a central trusted-ID shipment ownership resolver and focused regression tests.
- [x] Investigate the two disputed shipments without mutating production; mark them for manual review.
- [x] Prepare a local service-only RLS migration for the two advisor-reported tables.
- [ ] Provision/identify an approved staging database and authenticated staging tenants.
- [ ] Configure and verify the trusted Fly internal company ID.
- [ ] Run authenticated critical runtime smoke tests in staging.
- [ ] Obtain manual Flutterwave dashboard mapping confirmation.
- [ ] Commit, push, and deploy only after the external blockers pass.

## Next recommended action

Create or identify an approved Supabase staging branch, configure preview-only test tenants and `FLY_INTERNAL_COMPANY_ID`, then execute the authenticated plan/tenant-isolation matrix before any commit, push, or production deployment.

**STAGING INFRASTRUCTURE MANUAL ACTION REQUIRED** — the connected Supabase project still has no development branches. Creating one may incur account charges and must be approved before provisioning.

## External blocker closure check — 2026-10-14

- The database-owned `public.fly_default_company_id()` resolves to an existing company with memberships. Masked value: `ceba317a-****-****-****-d5e162e11fa1`. This is the authoritative internal-company source used for verification; no company-name matching was used.
- The linked Vercel project does **not** contain `FLY_INTERNAL_COMPANY_ID` for Production or Preview. Adding it remains a manual/approved configuration action; no value was written.
- All three Flutterwave Cloud plan-ID variables exist for both Preview and Production. Provider-side NGN amount mappings remain unverified because no Flutterwave dashboard/provider-plan access is connected.
- Supabase reports zero database branches. No production mutation was used to simulate staging, and no potentially chargeable branch was created.
- Production grants confirm `crypto_payment_requests` and `resend_webhook_events` are service-only: `anon` and `authenticated` have no DML privileges, while `service_role` does. The local policy migration remains staging-only and unapplied.
- The nine flagged `SECURITY DEFINER` helpers have explicit `authenticated` and `service_role` execute grants, no `anon`/`PUBLIC` execute grant, fixed `search_path=public`, and caller-scoped membership/JWT checks. Direct authenticated execution is required by current RLS policies; permission tightening must be tested on staging before changing production.
- Supabase security advisor still reports leaked-password protection disabled. Dashboard action and a follow-up advisor check are required.
- Latest READY production deployment remains `dpl_8ud83aK4RddeeenUsivZykW8dCxy` at commit `fa9de4b155f5db61b504db0759260a21a45f64dc`. The recovery batch remains uncommitted, unpushed, and undeployed.
- Because staging and authenticated test tenants are unavailable, Starter/Growth/Scale boundary tests, trial expiry, downgrade preservation, webhook replay, two-tenant isolation, mobile viewport verification, POD journey, and carrier sandbox regression remain blocked rather than inferred from local tests.
