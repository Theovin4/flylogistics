# FLY LOGISTICS FINAL RELEASE-CANDIDATE STAGING CERTIFICATION

## Scope and safety

This is a continuation of the prior authenticated staging certification, not a restart. The three required staging environment variables were present, and `STAGING_SUPABASE_URL` resolved exactly to `https://vgrcfuaqxwidgdgtnved.supabase.co`. Secret values were not printed, persisted, or committed. Production Supabase ref `igloqgojviveysjazhmu` remained read-only; `.env.local` was not used.

The prior READY Preview for commit `adaaa4c` was used for the authenticated runtime checks. New source fixes described below are local until pushed and verified on a new READY Preview. Vercel Preview protection was bypassed only by a local server-side proxy; its secret was not sent to the browser. All browser accounts and tenant names were synthetic.

No real messages, payments, FEZ or Sendbox bookings, production mutations, production deployment, or merge to `main` occurred. Shipment flow checks used the internal Fly carrier only. A zero-price synthetic tenant rate and cleared contact fields were used to avoid paid-booking and notification paths.

## Runtime certification results

| Section | Result | Evidence and limitations |
|---|---|---|
| Growth limits and features | **PASS** for measured limits; **NOT CERTIFIED** for the complete feature matrix | 20 staff were allowed and staff #21 was rejected with HTTP 409. 100 drivers were allowed and driver #101 was rejected with HTTP 403. Growth advanced analytics succeeded. Not every Growth-versus-Scale feature boundary was exercised. |
| Scale limits and promised features | **PASS** for measured unlimited entitlements; **NOT CERTIFIED** for runtime surfaces | Scale use beyond Growth staff/driver thresholds succeeded and entitlements represented the limits as unlimited. This branch now contains custom-domain configuration, branding-preference, and custom-integration surfaces/APIs with Scale entitlement checks. Migration `20261017_cloud_scale_features.sql` has not been applied to staging, so those APIs and their tenant isolation cannot be runtime-certified. No DNS or external-provider changes were made. |
| Trial expiry | **PASS** | Future trial expiry permitted protected access. Expired trial actions returned HTTP 402 and the rejected write did not change the customer count. |
| Downgrade to Starter | **PASS** | An over-cap tenant was downgraded. Existing users, drivers, customers, and rates remained; additional staff/drivers and premium analytics were blocked. No existing data was silently deleted. |
| Two-tenant isolation | **NOT CERTIFIED** | Tenant A selecting Tenant B's UUID was rejected with HTTP 403. Some authenticated RLS reads and customer mutation probes returned no foreign rows. The full bilateral A↔B GET/POST/PATCH/DELETE matrix for drivers, cloud customers, rates, team, analytics, shipments, shipment updates, POD, and carrier operations was not completed. No successful cross-tenant mutation was observed, but the missing matrix remains a release blocker. |
| Privilege escalation | **NOT CERTIFIED** | The previously fixed anonymous Customer→Driver registration attempt returned HTTP 401; an authenticated self-role change returned HTTP 409 and left the Customer profile unchanged. A Cloud owner self-promotion attempt returned HTTP 409. Customer, Merchant, and Cloud identity checks did not demonstrate Fly-admin/dispatcher access. The full Customer, Merchant, Cloud owner/admin/dispatcher/driver matrix for Fly roles, driver IDs, foreign memberships, and foreign owner/admin mutation was not completed. |
| Shipment ownership | **NOT CERTIFIED** | Malformed UUID and tenant-slug inputs returned HTTP 400. Tenant A selecting Tenant B returned HTTP 403 on the prior READY Preview with no shipment row. A valid nonexistent UUID previously returned HTTP 500 without a row; local route handling now maps that failure safely and has regression coverage, but the fix has not been retested on a candidate Preview. Normal Fly Admin and Fly Admin explicitly acting for verified Tenant A were not both runtime-certified. |
| Shipment workflow, POD, and tracking privacy | **NOT CERTIFIED** | The correctly routed synthetic internal-carrier flow completed shipment creation, operations lookup, valid driver assignment, status transitions, POD, and tracking with tenant ownership preserved. A Cloud membership driver whose Fly profile was Customer could submit POD for a different assigned driver (HTTP 200), and public tracking exposed private shipment/customer details. Both defects have local fixes and regression tests, but the fixed Preview behavior has not been rerun. Public tracking privacy, invalid-driver POD rejection, Tenant B shipment mutation rejection, and full ownership continuity therefore remain uncertified. |
| Tenant pricing | **PASS** | The authenticated tenant-rate runtime path returned NGN 5,000 at 5 kg and NGN 6,000 at 7 kg for a NGN 5,000 base including 5 kg plus NGN 500/kg. |
| Customer versus Merchant pricing | **PASS** for Fly quote amounts; **NOT CERTIFIED** for provider and Cloud invariants | Identical synthetic quote input returned a normal Customer price of NGN 9,250 and a Merchant price of NGN 8,787: one rounded NGN 463 discount, exactly 5%. No carrier quote/booking was made; provider-cost invariance and Cloud-tenant pricing independence were not verified. |
| Cloud external customers | **PASS** for storage location; **NOT CERTIFIED** for isolation | Tenant customers were stored in `cloud_customers`, not `company_members`. The bilateral Tenant A↔B read/update/delete matrix was not completed. |
| Authenticated Cloud mobile workspace | **NOT CERTIFIED** | Synthetic sign-in now reached the authenticated dashboard. All eight requested pages returned HTTP 200 at 320, 360, 375, 390, 430, and 768 px (48 page/viewport combinations). Navigation exposed all 11 workspace links in a horizontally scrollable, reachable bar; tenant branding/data appeared after hydration; no browser console errors, page errors, or HTTP errors were recorded. The settings page had horizontal document overflow at every width (document widths 328, 368, 383, 398, 438, and 1008 px respectively), caused by the hidden company-logo file input inheriting the shared `w-full` input style. A local fix and regression test now constrain that hidden input; candidate Preview mobile verification has not yet been performed. |
| Flutterwave | **MANUAL CHECK REQUIRED** | No charge was made. Trusted application plan amounts and code paths were reviewed, but provider-dashboard plan amount/mapping confirmation is unavailable. |
| FEZ / Sendbox | **MANUAL CHECK REQUIRED** | No safe configured sandbox/mock verification was available. No production carrier booking was attempted. |

## Defects and fixes

- The earlier unauthenticated Customer→Driver escalation was fixed by requiring the matching authenticated bearer session and preventing self-service changes to an existing role. Regression checks and the prior Preview retest passed.
- Foreign driver updates and rate deletions previously produced HTTP 500/false success when no tenant-scoped row existed. The routes now return 404 for missing scoped rows.
- Shipment ownership failures now map to safe authorization, not-found, or configuration responses rather than server errors.
- A Cloud member with role `driver` is now treated as a driver actor for shipment status/POD authorization; POD requires an explicitly approved assigned driver.
- Public tracking now omits private addresses, names, package/commercial data, driver identity/location, proof, checklist, and arbitrary stored status text.
- The authenticated settings mobile sweep reproduced horizontal overflow from the visually hidden company-logo file input. It now has constrained one-pixel dimensions, with a regression assertion in `tests/release-security.test.mjs`.
- The Scale custom-domain, branding-preference, and integration features are implemented in source with validation, tenant scoping, and Scale entitlement checks. They are blocked from runtime certification until the migration is applied through an authorized staging migration process. The staging test-data admin credential was not used to apply schema changes.

## Validation and synthetic cleanup

- `npm run validate`: TypeScript passed, ESLint passed, secret scan passed, and 51/51 automated tests passed.
- The isolated production build excluded environment files, passed validation, and generated 159/159 static pages. `.env.local` was not loaded.
- The authenticated mobile tenant and user are synthetic and must be removed through the dedicated cleanup path; cleanup status is recorded in the final certification report after verification.
- The pre-existing `scripts/staging-runtime-certification.mjs` reads production-targeted `.env.local` and was not executed.

## Remaining release blockers

1. Push fixes to `pre-deployment-cloud-verification`, wait for its Preview to become READY, and rerun the affected POD authorization, public-tracking privacy, foreign driver/rate mutation, nonexistent-tenant ownership, and settings mobile-overflow checks on that exact Preview.
2. Complete the bilateral A↔B isolation matrix, including valid `company_members.id` values, foreign shipment/POD/carrier mutations, and Cloud-customer update/delete.
3. Complete the requested privilege-escalation personas and shipment ownership matrix, including Fly Admin internal-company and explicit verified-tenant creation.
4. Apply the Scale-feature migration through an authorized staging migration process, then certify domain, branding, integrations, and tenant isolation.
5. Verify provider-cost invariance without a real carrier booking, or leave it uncertified.
6. Obtain Flutterwave dashboard confirmation and an approved FEZ/Sendbox sandbox/mock path.
7. Complete the post-fix authenticated mobile usability and tenant-branding verification.

## Score and decision

**Score: 55/100.** Core plan limits, expiry, downgrade preservation, tenant pricing, Merchant discount, customer storage, and the synthetic happy-path workflow were exercised. A reproduced POD authorization bypass, public tracking privacy leak, and settings overflow are fixed locally but are not yet verified on a candidate Preview; substantial isolation, role, ownership, Scale-migration, and provider checks remain.

**NOT READY FOR PRODUCTION DEPLOYMENT**
