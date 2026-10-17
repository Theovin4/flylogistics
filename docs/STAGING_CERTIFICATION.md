# FLY LOGISTICS FINAL STAGING CERTIFICATION

## Scope and safety

This continues the previously blocked authenticated runtime certification; it does not restart the existing baseline. Staging-only variables were checked for presence, and `STAGING_SUPABASE_URL` matched exactly `https://vgrcfuaqxwidgdgtnved.supabase.co`. Their values were not recorded or exposed. The production Supabase ref `igloqgojviveysjazhmu` remained read-only. `.env.local` was not used.

All created certification tenants, identities, and test data were synthetic. The plan, pricing, and escalation batches were cleaned up. A synthetic mobile fixture left by an earlier interrupted run was located by its certification-only slug prefix and cleaned up. A later mobile-login attempt also ran its cleanup path. No real email, notification, payment, provider booking, production mutation, production deployment, or merge to `main` occurred.

The protected Preview health endpoint returned HTTP 200. Certification was performed against the READY Preview for commit `5005d75` on `pre-deployment-cloud-verification`.

## Runtime certification results

| Section | Result | Evidence and limitations |
|---|---|---|
| Growth limits and features | **PASS** for tested limits; **NOT CERTIFIED** for the complete feature matrix | 20 staff were allowed; staff #21 was rejected with HTTP 409. 100 drivers were allowed; driver #101 was rejected with HTTP 403. Growth advanced analytics succeeded. Not every Growth-versus-Scale feature boundary was independently exercised. |
| Scale entitlements and surfaces | **PASS** for tested entitlement behavior; **NOT IMPLEMENTED** for identified surfaces | Usage beyond Growth staff/driver thresholds succeeded and Scale entitlement responses represented those limits as unlimited. Custom-domain and integration-management routes were not implemented. The complete Scale-only surface matrix was not certified. |
| Trial expiry | **PASS** | A future-expiry trial permitted protected access. After expiry, protected reads and writes returned HTTP 402; the customer count did not change after the rejected write. |
| Downgrade to Starter | **PASS** | An over-cap tenant was downgraded. Existing users, drivers, customers, and rates remained. New staff and driver creation above Starter caps and premium analytics were blocked. No existing data was silently deleted. |
| Two-tenant isolation | **NOT CERTIFIED** | Direct authenticated RLS cross-tenant reads for customers, rates, team, drivers, and shipments returned no rows; customer cross-tenant update/delete returned no rows and the foreign customer remained unchanged. Some API reads also appeared isolated. The complete Tenant A-to-B and Tenant B-to-A read/write/update/delete matrix for drivers, customers, rates, team, analytics, shipments, POD, and carrier operations was not completed; one combined API mutation-preservation attempt was inconclusive. No successful cross-tenant access was demonstrated, but isolation is a release blocker until the full matrix passes. |
| Privilege escalation | **PASS** for tested role escalation; **NOT CERTIFIED** for all cross-tenant privilege cases | Reproduced unauthenticated Customer-to-Driver escalation, fixed it, and verified the Preview response was HTTP 401. An authenticated attempt to change the existing Customer role returned HTTP 409; the profile remained Customer and no driver identity was created. Customer, Merchant, Cloud owner, and Driver probes did not obtain Fly admin or dispatcher access; the legitimate Driver operations endpoint remained available. Attempts to obtain another tenant's membership/owner/admin privileges were not exhaustively tested. |
| Shipment ownership | **NOT CERTIFIED** | Malformed UUID and tenant-slug inputs returned HTTP 400. A valid unauthorized Tenant B UUID produced HTTP 500, not a safe expected 4xx response; no successful unauthorized mutation was demonstrated. The root cause was that the ownership resolver threw for an explicit tenant selection by a non-admin and the route converted it to HTTP 500. The route now rejects that request with HTTP 403 before ownership resolution or mutation, with regression coverage. The fix is awaiting Preview deployment and runtime retest. Runtime ownership for normal Fly Admin, tenant operator, and explicitly verified Fly admin acting for a tenant was not fully established. |
| Shipment workflow, POD, tracking | **NOT CERTIFIED** | The synthetic workflow did not complete: assignment/status/POD/tracking requests returned HTTP 404. Invalid-driver POD rejection, Tenant B manipulation of Tenant A shipments, ownership continuity, and public tracking privacy were therefore not certified. No carrier booking was made. |
| Tenant pricing | **PASS** | The authenticated runtime tenant-rate preview returned NGN 5,000 at 5 kg and NGN 6,000 at 7 kg for the staging rate (NGN 5,000 base including 5 kg, then NGN 500/kg). |
| Customer versus Merchant pricing | **NOT CERTIFIED** | The Merchant quote preview applied exactly one 5% discount relative to the normal Fly customer price. Provider/carrier-cost invariance and absence of Cloud-tenant pricing impact were not verified. |
| Cloud external customers | **PASS** for storage location; **NOT CERTIFIED** for isolation | A tenant customer was created in `cloud_customers`, not `company_members`. Cross-tenant customer isolation was not fully verified. |
| Authenticated Cloud mobile workspace | **NOT CERTIFIED** | The synthetic authenticated browser setup did not reach `/cloud/dashboard` before its 30-second navigation timeout, so none of the requested workspace pages were measured at 320, 360, 375, 390, 430, or 768 px. Navigation, overflow, branding flicker, usability, and console errors remain uncertified. The synthetic setup was cleaned up. |
| Flutterwave | **MANUAL CHECK REQUIRED** | No charge was made. Trusted application plan amounts are defined in code, but the provider dashboard plan amounts/mappings could not be independently confirmed. |
| FEZ / Sendbox | **MANUAL CHECK REQUIRED** | No safe configured sandbox/mock verification was available in this run. No production carrier booking was attempted. |

## Defect and verification record

- Reproduced a profile-registration privilege-escalation defect: an unauthenticated request could change a synthetic Customer to Driver and create a pending driver record.
- Fixed the root cause by requiring the matching authenticated bearer session and rejecting self-service changes to an existing role. Added regression coverage.
- Deployed the fix only to the `pre-deployment-cloud-verification` Preview. The post-fix runtime regression passed: anonymous attempt HTTP 401, authenticated role-change attempt HTTP 409, unchanged Customer profile, and no driver identity.
- Fixed the shipment ownership denial path so a non-admin's explicit tenant selection returns HTTP 403 instead of HTTP 500, before any shipment mutation. Focused shipment ownership tests cover the permission policy. Preview deployment and runtime retest are pending.
- `npm run validate` passed TypeScript, ESLint, secret scanning, and 41/41 tests after the shipment ownership fix.
- The production build passed in an isolated temporary source tree that excluded `.env.local`; 159/159 static pages were generated. The ordinary build was not allowed to consume production-targeted `.env.local`.
- The focused self-service registration regression tests passed (2/2), and focused shipment ownership tests passed (5/5). No unrelated application changes were made for the remaining uncertified checks.

## Score and decision

**Score: 58/100.** The score reflects completed authenticated entitlement, expiry, downgrade, pricing, customer-storage, and fixed privilege-escalation checks, while accounting for incomplete cross-tenant, shipment, mobile, and provider certifications.

**NOT READY FOR PRODUCTION DEPLOYMENT**
