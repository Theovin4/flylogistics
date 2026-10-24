# FLY LOGISTICS FINAL RELEASE-CANDIDATE STAGING CERTIFICATION

## Authoritative final staging gate — 2026-10-20 (Africa/Lagos)

This section supersedes the earlier Preview-retest blockers and final-gate decisions later in this historical document. It covers only the three previously outstanding runtime checks; previously passed certification matrices were not rerun.

### Locked target and safety preflight

- Branch: `pre-deployment-cloud-verification`
- Commit: `37a508b7a20ecd18fd032dd0173dc93b01c65bec`
- Deployment: `dpl_Bb9S7H5fz8qW7ugzcLgRJJjb6o5f`
- Preview URL: `https://flylogistics-5poxwx4sb-vincent-theos-projects.vercel.app`
- Vercel reported `READY`, Next.js, Preview target, the exact branch, and the exact commit. The deployment health endpoint returned HTTP 200 with `ok=true` and classification `healthy`.
- `VERCEL_AUTOMATION_BYPASS_SECRET`, `STAGING_SUPABASE_URL`, and `STAGING_SUPABASE_SECRET_KEY` were present. No secret value was printed or persisted. `STAGING_SUPABASE_URL` exactly matched `https://vgrcfuaqxwidgdgtnved.supabase.co`.
- Only staging project `vgrcfuaqxwidgdgtnved` and the exact Preview deployment above were exercised. Production project `igloqgojviveysjazhmu`, production deployments, production data, payments, and real recipients/providers were untouched.

### Remaining runtime checks

| Area | Result | Actual runtime evidence |
|---|---|---|
| Preview/staging external notification suppression | **PASS** | A synthetic staging-only `POST /api/growth/leads` returned HTTP 201. Two operational events were written; the notification event recorded `deliverySuppressed=true` and `deliverySuppressionReason=vercel_preview`. Zero matching `notification_messages` rows were created. Vercel runtime logs scoped to deployment `dpl_Bb9S7H5fz8qW7ugzcLgRJJjb6o5f` recorded the warning `Admin external notification delivery suppressed for Vercel Preview.` for `POST /api/growth/leads` at `2026-10-20T08:41:09.288Z` (`09:41:09.288` Africa/Lagos), with reason `vercel_preview`. No real recipient was used. |
| Scale APIs, feature gating, and cross-tenant isolation | **PASS** | Two synthetic active Scale tenants and one synthetic active Starter tenant were created. Scale custom-domain GET returned 200; both tenant-specific custom-domain PATCH requests returned 201. Both tenant-specific custom-integration POST requests returned 201 with `deliveryEnabled=false`; no endpoint delivery was attempted. Scale branding removal PATCH returned 200. Starter access to custom domains, custom integrations, and platform-branding removal returned 403/403/403 and created zero domain, integration, or branding rows. Tenant A's integration list excluded Tenant B's row; Tenant A PATCH and DELETE attempts against Tenant B's integration both returned 404, and direct staging reads confirmed Tenant B's row remained unchanged. Tenant A's domain read returned only Tenant A's hostname, and Tenant B's branding preference remained unchanged. |
| Carrier duplicate/replay booking rejection | **PASS** | Synthetic same-tenant shipments were seeded with existing non-Fly references for Sendbox and FEZ. Replaying `POST /api/shipments/[trackingId]/carriers/create` returned HTTP 409 for `sendbox` and HTTP 409 for `fez_logistics`, returning the existing reference in each case. Direct staging reads confirmed both shipment rows were byte-for-byte unchanged across the selected carrier fields. Each case created zero shipment audit rows, zero shipment operational events, and zero background jobs. The deployed handler rejected on the existing same-provider reference before carrier rates or carrier-create code, so no Sendbox or FEZ booking call was reached. |

### Synthetic fixture cleanup

Cleanup completed in a guaranteed `finally` path and was directly verified. Residual counts were zero for all synthetic companies, Auth-backed profiles, memberships, shipments, custom integrations, custom domains, branding preferences, growth leads, notification operational events, and notification messages. Cleanup reported no errors. No real notifications, payments, FEZ bookings, or Sendbox bookings occurred.

### External manual evidence retained

- Flutterwave — MANUAL DASHBOARD CONFIRMATION REQUIRED
- FEZ/Sendbox — APP-SIDE PASS — EXTERNAL SANDBOX LIFECYCLE MANUAL

## Final gate result

**APP-SIDE FINAL STAGING GATE PASS — MANUAL EXTERNAL CONFIRMATIONS REMAIN — PRODUCTION NOT DEPLOYED**

## Authoritative continuation — 2026-10-19 (Africa/Lagos)

This section supersedes stale blocker lists and scores later in this historical document.

Only staging project `vgrcfuaqxwidgdgtnved` was changed. Production project `igloqgojviveysjazhmu`, production deployment, real payments, real notifications, and real carrier bookings were not touched. Secrets were not printed or stored. The current shell did not inherit the three authorized Preview/staging variables, so no runtime claim is made for newly changed code on the protected Preview. The production-targeted `.env.local` was not used.

| Area | Result | Evidence |
|---|---|---|
| Growth, Starter, trial | **PASS** | Growth caps/success paths, Starter downgrade preservation, and genuine expiry were previously exercised in staging. |
| Tenant isolation | **PASS** | Prior 54/54 bilateral probes passed across customers, drivers, rates, team, shipments, POD, analytics, and carriers. |
| Ownership, POD, tracking | **PASS** | Ownership matrix passed after `3954b31`; mismatched driver POD returned 403; 6/6 public tracking privacy probes passed. |
| Mobile Cloud workspace | **PASS** | Prior 48-case authenticated sweep passed across eight routes and six widths. |
| Scale schema/security | **PASS** | Migration applied only to staging as `20261019151314`; three tables have RLS, no anon/authenticated DML, and service-role DML only. |
| Scale source controls | **PASS** | Scale-only server entitlements, validation, tenant queries, and tests pass. Preview runtime retest is blocked by missing inherited variables. |
| Notification safety | **PASS locally; Preview retest required** | Vercel Preview suppresses external admin email/WhatsApp while retaining operational events; other environments remain unchanged. |
| Pricing | **PASS** | Customer NGN 9,250; Merchant NGN 8,787; one rounded NGN 463 discount at exactly 5%. Tenant rates and provider cost use independent paths. |
| Flutterwave app controls | **PASS** | Exact trusted amount, NGN, success, reference, and plan mapping required; duplicate subscription state exits before side effects. Provider dashboard mapping remains manual. |
| FEZ/Sendbox app controls | **PASS** | Signed webhooks, tenant rejection before provider calls, provider-cost persistence, safe errors, FEZ reconciliation, and same-provider replay rejection are present. External lifecycle remains manual. |

### Changes and verification

- Applied and verified `20261017_cloud_scale_features.sql` on staging only.
- Added Preview notification suppression, same-provider carrier-create replay protection, and pricing/idempotency regression tests.
- Focused suite: 18/18 passed.
- `npm run validate`: TypeScript, ESLint, client-secret scan, and 58/58 tests passed.
- Environment-free `npm run build`: passed; 159/159 static pages generated.
- Non-elevated attempts hit Windows `spawn EPERM`; the identical permitted runs passed. This was an execution sandbox limitation, not an assertion failure.

### Remaining blockers and deployment status

- Deploy this local candidate only to Preview and retest the new notification, Scale, and carrier replay controls with authorized staging variables.
- Confirm Flutterwave dashboard plan mappings and run approved FEZ/Sendbox sandbox lifecycle checks.
- Enable Supabase leaked-password protection and recheck the advisor. The nine required caller-scoped `SECURITY DEFINER` warnings remain documented; Scale RLS-without-policy notices are intentional service-only posture.
- No push, merge, Preview deployment, or production deployment occurred in this checkpoint.

**NOT READY FOR PRODUCTION DEPLOYMENT**

## Cloud globalization staging evidence — 2026-10-23 (Africa/Lagos)

This is an additive staging checkpoint for branch `cloud-globalization` at baseline `a6773f933e7655c91a44c68be38583429b38d6e4`. Production was not changed or deployed.

| Gate | Result | Evidence |
| --- | --- | --- |
| Local validation | **PASS** | TypeScript, ESLint, client-secret scan, and 67/67 tests passed. Tests cover country/locale defaults, IANA timezone and DST behavior, record-currency formatting, foreign-currency snapshot matching, server-resolved checkout, catalogue changes between checkout and verification, webhook replay ordering, and service-only schema posture. |
| Production build | **PASS** | Environment-free isolated build contained zero `.env*` files, compiled successfully, and generated 158/158 static pages. The temporary build copy was removed afterward. |
| Staging identity | **PASS** | Exact project `vgrcfuaqxwidgdgtnved`, named Fly Logistics Staging, was ACTIVE_HEALTHY. Production ref `igloqgojviveysjazhmu` was not mutated. |
| Globalization migration | **PASS** | `20261021135732_cloud_globalization.sql` applied only to staging and registered as `20261023210455_cloud_globalization`. |
| Service-only security | **PASS** | `cloud_plan_prices` and `cloud_fx_rates` have RLS enabled; `anon` and `authenticated` have no SELECT privilege; `service_role` has SELECT/DML privileges. Their no-policy advisor notices are intentional because browser roles must have no path to these tables. |
| Schema preservation | **PASS** | `companies.locale` exists. All five subscription snapshot fields exist. Both new tables contain zero rows; no fabricated billing catalogue or FX data was seeded. |
| Runtime Preview | **PARTIAL PASS** | Exact deployment `dpl_7trHongCTGJH8jEahirpJPYVMH49` for commit `0cac878fb41ddeab596f449a2521ae4549483d43` became READY. Health returned 200. A complete synthetic GBP catalogue rendered £19/£59/£149; unsupported USD did not render those GBP prices; after deletion GBP was no longer advertised and NGN remained. Runtime logs had no warning/error/fatal entries. |
| Synthetic cleanup | **PASS** | All three GBP catalogue rows were deleted in a guaranteed cleanup path. Direct staging query returned zero rows for price version `codex-global-preview-20261024`. No checkout or provider call occurred. |
| Authenticated international tenants | **BLOCKED** | The four approved staging process variables were absent. Production-targeted `.env.local` was not read. Authenticated tenant settings, rate-card, analytics, billing-fallback, and isolation flows therefore remain uncertified on this Preview. |

### External evidence retained

- Flutterwave — MANUAL DASHBOARD CONFIRMATION REQUIRED
- FEZ/Sendbox — APP-SIDE PASS — EXTERNAL SANDBOX LIFECYCLE MANUAL

### Current decision

The code, staging schema, exact Preview, public catalogue, unsupported-currency display, and fixture-cleanup gates pass. Authenticated international tenant runtime scenarios and manual provider confirmation are still required before a production decision.

**NOT READY FOR PRODUCTION DEPLOYMENT**

## Scope and safety

This is a continuation of the prior authenticated staging certification, not a restart. The three required staging environment variables were present, and `STAGING_SUPABASE_URL` resolved exactly to `https://vgrcfuaqxwidgdgtnved.supabase.co`. Secret values were not printed, persisted, or committed. Production Supabase ref `igloqgojviveysjazhmu` remained read-only. An initial standard build attempt auto-loaded `.env.local`; it was stopped after the environment banner appeared, during compilation and before static-page generation. The successful isolated build used a copy with no `.env*` files.

The earlier authenticated runtime checks used the READY Preview for `adaaa4c`. Fixes were committed only to `pre-deployment-cloud-verification` as `280e75c3ab9ad877fd0d372c2893d0d7ac739afb`, followed by certification record commit `77b4390`. The Preview for `77b4390` is READY: deployment `7143973420`, `https://flylogistics-fztfea42b-vincent-theos-projects.vercel.app`. The updated shipment/privacy fixes and Scale surfaces have not been fully runtime-certified on this candidate. Preview protection was bypassed only through a local server-side proxy; its secret was not sent to the browser. All accounts and tenant data were synthetic.

No payments, FEZ or Sendbox bookings, production database mutations, production deployment, or merge to `main` occurred. Shipment flow checks used the internal Fly carrier only. A zero-price synthetic tenant rate and cleared contact fields were used to avoid paid-booking and notification paths. An earlier malformed synthetic setup created two `notification_messages` rows and eight `operational_events`; all were deleted. No real recipient details were configured, but delivery status was not preserved, so provider delivery cannot be independently ruled out.

## Runtime certification results

| Section | Result | Evidence and limitations |
|---|---|---|
| Growth limits and features | **PASS** for measured limits; **NOT CERTIFIED** for the complete feature matrix | 20 staff were allowed and staff #21 was rejected with HTTP 409. 100 drivers were allowed and driver #101 was rejected with HTTP 403. Growth advanced analytics succeeded. Not every Growth-versus-Scale feature boundary was exercised. |
| Scale limits and promised features | **PASS** for measured unlimited entitlements; **NOT CERTIFIED** for runtime surfaces | Scale use beyond Growth staff/driver thresholds succeeded and entitlements represented the limits as unlimited. This branch now contains custom-domain configuration, branding-preference, and custom-integration surfaces/APIs with Scale entitlement checks. Migration `20261017_cloud_scale_features.sql` has not been applied to staging, so those APIs and their tenant isolation cannot be runtime-certified. No DNS or external-provider changes were made. |
| Trial expiry | **PASS** | Future trial expiry permitted protected access. Expired trial actions returned HTTP 402 and the rejected write did not change the customer count. |
| Downgrade to Starter | **PASS** | An over-cap tenant was downgraded. Existing users, drivers, customers, and rates remained; additional staff/drivers and premium analytics were blocked. No existing data was silently deleted. |
| Two-tenant isolation | **PASS** | The corrected bilateral staging matrix passed 54/54 probes across `cloud_customers`, drivers, rates, team, shipments, shipment updates, POD, analytics, carrier rates, and carrier create/sync endpoints. GET/POST/PATCH/PUT/DELETE were exercised where implemented. Foreign reads were empty or returned scoped 403/404; direct staging queries after attempted foreign writes/deletes confirmed no foreign rows changed. Foreign carrier actions were rejected before provider calls; only the internal Fly carrier was used. |
| Privilege escalation | **NOT CERTIFIED** overall; **PASS** for default-membership cleanup | On the READY `Vercel – flylogistics` Preview for commit `145fb05` (deployment `DKvkdHawvd3aScsaL3FP6nxXmUuh`), Cloud signup, Cloud team provisioning, and authenticated self-service profile setup completed with HTTP 201/201/200. Direct staging queries after each returned zero internal Fly-company memberships. The broader privilege matrix previously scored 31/33 and was not rerun in this focused retest. |
| Session and authentication boundaries | **PASS** for genuine token expiry; broader session checks remain as previously certified | A staging-only Cloud owner received a Supabase access token with a real 3,600-second lifetime; the token was not modified. Before expiry, `/api/cloud/settings` and `/api/cloud/overview` both returned HTTP 200 for the expected tenant. After the JWT's actual `exp` plus a 20-second buffer, both returned HTTP 401 with no protected workspace/metrics data. The synthetic tenant and Auth user were removed and cleanup verified. |
| Shipment ownership | **PASS** for the ownership assertions; **NOT CERTIFIED** for the no-notification execution constraint | On the matching READY Preview for `145fb05`, a normal Fly Admin create returned HTTP 201; direct staging reads confirmed `company_id` was the staging internal Fly company UUID `2d8eee72-ed36-4d59-8669-2b2ff95e9124`, regardless of client-supplied `company_id`, `companyId`, or tenant slug. Audit metadata was `ownershipSource=fly_operations`, `explicitlySelectedTenant=false`. Explicit verified Tenant A creation stored Tenant A's UUID and recorded `ownershipSource=cloud_tenant`, `explicitlySelectedTenant=true`. The same-context admin's Tenant B request was reproduced returning HTTP 201 and creating a Tenant B shipment. Fix `3954b31` binds explicit selection to the verified active Cloud tenant; its matching READY Preview returned HTTP 403 for the Tenant B attempt, with no shipment, audit, or operational row. Malformed UUID and tenant slug returned HTTP 400; nonexistent UUID returned HTTP 404; none created a shipment. All synthetic fixtures were removed. **Execution caveat:** the normal-admin create triggered the application's automatic admin-alert side effect; staging recorded the WhatsApp alert as `FAILED`. The mail-send outcome was not retained before cleanup, so delivery of an admin email cannot be independently ruled out. |
| Shipment workflow, POD, and tracking privacy | **PASS** for the previously completed workflow/tracking checks and targeted POD retest | The existing synthetic internal-carrier workflow and 6/6 public tracking privacy checks remain as previously certified; they were not rerun here. On the READY Preview for `145fb05`, direct pre-request staging reads confirmed the Cloud driver membership, same-tenant shipment, and mismatched profile-driver versus shipment-assigned-driver IDs. The POD request returned HTTP 403. The shipment row was identical before and after, and POD, operational, audit, and notification event counts did not change. |
| Tenant pricing | **PASS** | The authenticated tenant-rate runtime path returned NGN 5,000 at 5 kg and NGN 6,000 at 7 kg for a NGN 5,000 base including 5 kg plus NGN 500/kg. |
| Customer versus Merchant pricing | **PASS** for Fly quote amounts; **NOT CERTIFIED** for provider and Cloud invariants | Identical synthetic quote input returned a normal Customer price of NGN 9,250 and a Merchant price of NGN 8,787: one rounded NGN 463 discount, exactly 5%. No carrier quote/booking was made; provider-cost invariance and Cloud-tenant pricing independence were not verified. |
| Cloud external customers | **PASS** | Tenant customers were stored in `cloud_customers`, not `company_members`. Tenant A↔B and B↔A reads and update/delete attempts were included in the 54/54 isolation matrix; direct staging queries confirmed no foreign customer was changed or deleted. |
| Authenticated Cloud workspace loading | **PASS** | On READY deployment `7143973420` (application source unchanged by the later documentation-only commit), the same authenticated synthetic session reproduced “Loading secure workspace...” only in the shared background tab. Its `document.visibilityState` was `hidden`; a requested animation frame did not run during the observation window, leaving the streamed suspense fallback displayed. Opening the same session in a visible tab resolved the workspace shell, tenant branding/navigation, and overview metrics; a full reload returned HTTP 200 with `readyState=complete`, no loading fallback, and no browser console/page errors. A normal sign-in button click in the visible tab also reached the dashboard. This was a browser-tab visibility/test-harness condition, not a confirmed application defect; no code change was needed. |
| Authenticated Cloud mobile workspace | **PASS** | On the visible authenticated session against READY deployment `7143973420`, all eight routes (`/cloud/dashboard`, `/cloud/settings`, `/cloud/drivers`, `/cloud/shipments`, `/cloud/customers`, `/cloud/rates`, `/cloud/team`, and `/cloud/analytics`) were checked at 320, 360, 375, 390, 430, and 768 px. All 48 settled route/viewport cases returned HTTP 200, showed the synthetic tenant's correct branding/data, and had no document horizontal overflow, clipped content, offscreen content controls, wrong-tenant content, permanent workspace fallback, console errors, or page errors. The 11-link mobile navigation remained horizontally scrollable and clickable; controls were reachable. Settings had no overflow at any width, including the 320 px file-input regression check. Team's initial 320 px automated navigation timed out while the page was still streaming; a visible-tab retry then returned HTTP 200, loaded the team data, and exposed the Invite controls. Four initial samples (320 px Shipments and Team, 430 px Analytics, 768 px Customers) briefly showed the neutral streamed loading fallback before settling; none flashed Fly branding. Non-fatal font-preload warnings and aborted third-party analytics/prefetch requests were observed, not application console/page errors. The synthetic tenant/user was deleted; cleanup verified the tenant absent, and the local proxy listener stopped. |
| Flutterwave | **MANUAL CHECK REQUIRED** | No charge was made. Trusted application plan amounts and code paths were reviewed, but provider-dashboard plan amount/mapping confirmation is unavailable. |
| FEZ / Sendbox | **MANUAL CHECK REQUIRED** | No safe configured sandbox/mock verification was available. No production carrier booking was attempted. |

## Defects and fixes

- The earlier unauthenticated Customer→Driver escalation was fixed by requiring the matching authenticated bearer session and preventing self-service changes to an existing role. Regression checks and the prior Preview retest passed.
- Foreign driver updates and rate deletions previously produced HTTP 500/false success when no tenant-scoped row existed. The routes now return 404 for missing scoped rows.
- Shipment ownership failures now map to safe authorization, not-found, or configuration responses rather than server errors.
- A Cloud member with role `driver` is now treated as a driver actor for shipment status/POD authorization; POD requires an explicitly approved assigned driver.
- Auth provisioning was observed to create an internal Fly-company `customer` membership for synthetic identities. Commit `145fb05` performs cleanup after Cloud signup, team provisioning, and authenticated self-service profile writes; all three paths passed direct staging membership checks on the matching READY Preview.
- Public tracking now omits private addresses, names, package/commercial data, driver identity/location, proof, checklist, and arbitrary stored status text.
- The authenticated settings mobile sweep reproduced horizontal overflow from the visually hidden company-logo file input. It now has constrained one-pixel dimensions, with a regression assertion in `tests/release-security.test.mjs`.
- The Scale custom-domain, branding-preference, and integration features are implemented in source with validation, tenant scoping, and Scale entitlement checks. They are blocked from runtime certification until the migration is applied through an authorized staging migration process. The staging test-data admin credential was not used to apply schema changes.
- The authenticated dashboard loading symptom was caused by the shared browser tab being backgrounded: the tab reported `document.visibilityState === "hidden"` and its animation-frame callback did not run. In a visible tab with the same staging session, the streamed workspace content replaced the fallback and loaded metrics; a normal sign-in button click also reached the workspace. No application defect or code change was identified.

## Validation and synthetic cleanup

- `npm run validate`: TypeScript passed, ESLint passed, secret scan passed, and 52/52 automated tests passed.
- The isolated production build excluded environment files, passed validation, and generated 159/159 static pages. The separate initial build attempt auto-loaded `.env.local` and was stopped before static-page generation.
- Synthetic fixtures from the focused security retest were removed. Direct staging verification found zero certification records in `companies`, `company_members`, `user_profiles`, `drivers`, `shipments`, `proof_of_delivery_events`, `operational_events`, `audit_logs`, `company_invitations`, and `notification_messages`, and zero synthetic Auth users. No emails or notifications were sent. A leftover synthetic certification probe company with no dependent rows was also removed.
- The pre-existing `scripts/staging-runtime-certification.mjs` reads production-targeted `.env.local` and was not executed.

## Remaining release blockers

1. Complete the authenticated eight-page, six-viewport mobile usability sweep, including settings overflow. The specific “Loading secure workspace...” blocker is closed: it was reproduced only in a hidden browser tab and resolved in a visible tab with the same authenticated session.
2. Obtain a genuinely expired staging access token and verify protected access is rejected; the tampered-token check is not equivalent.
3. Complete the remaining shipment ownership cases: normal Fly Admin internal-company creation and explicit verified-tenant creation. The bilateral cross-tenant shipment/POD mutation matrix itself passed.
4. Apply the Scale-feature migration through an authorized staging migration process, then certify domain, branding, integrations, and tenant isolation.
5. Verify provider-cost invariance without a real carrier booking, or leave it uncertified.
6. Obtain Flutterwave dashboard confirmation and an approved FEZ/Sendbox sandbox/mock path.

## Score and decision

**Score: 55/100.** Core plan limits, expiry, downgrade preservation, tenant pricing, Merchant discount, customer storage, and the earlier synthetic happy-path workflow were exercised. The authenticated dashboard loading blocker is closed as a hidden-tab test-harness artifact; no app change was required. The previously reproduced mismatched-driver POD authorization bypass was retested on the READY candidate and rejected with HTTP 403 without shipment or event mutation. Bilateral isolation, the broader privilege matrix, ownership, Scale migration/surfaces, provider-cost invariance, and manual provider checks remain incomplete.

**NOT READY FOR PRODUCTION DEPLOYMENT**
