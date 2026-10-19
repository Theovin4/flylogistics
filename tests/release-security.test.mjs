import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const read = (path) => readFileSync(join(root, path), "utf8");

const publicRoutes = [
  "src/app/page.tsx",
  "src/app/services/page.tsx",
  "src/app/pricing/page.tsx",
  "src/app/tracking/page.tsx",
  "src/app/quote/page.tsx",
  "src/app/customer/login/page.tsx",
  "src/app/customer/register/page.tsx",
  "src/app/fly-admin-ops/login/page.tsx",
  "src/app/api/health/route.ts",
  "src/app/sitemap.ts",
  "src/app/robots.ts"
];

function routeFiles(directory) {
  return readdirSync(join(root, directory), { withFileTypes: true }).flatMap((entry) => {
    const relative = join(directory, entry.name);
    if (entry.isDirectory()) return routeFiles(relative);
    return entry.name === "route.ts" ? [relative] : [];
  });
}

test("critical public and authentication routes exist", () => {
  for (const route of publicRoutes) assert.equal(existsSync(join(root, route)), true, `${route} is missing`);
});

test("middleware protects private role workspaces and clears invalid sessions", () => {
  const middleware = read("src/middleware.ts");
  for (const prefix of ["/customer", "/driver", "/dispatcher", "/dashboard", "/cloud"]) {
    assert.match(middleware, new RegExp(prefix.replace("/", "\\/")));
  }
  assert.match(middleware, /sessionRole\(session, pathname\)/);
  assert.match(middleware, /fly_session/);
  assert.match(middleware, /maxAge:\s*0/);
  assert.doesNotMatch(middleware, /user_metadata\?\.role/);
});

test("every admin API route performs a server-side role or Cloud entitlement check", () => {
  const routes = routeFiles("src/app/api/admin");
  assert.ok(routes.length > 0, "No admin API routes were found");
  for (const route of routes) assert.match(read(route), /require(?:Role|CloudFeature)\(/, `${route} has no server-side authorization check`);
});

test("legacy Cloud operational mutations use central entitlements and company scope", () => {
  const scopedRoutes = [
    "src/app/api/shipments/[trackingId]/proof/route.ts",
    "src/app/api/shipments/[trackingId]/carriers/create/route.ts",
    "src/app/api/shipments/[trackingId]/carriers/rates/route.ts",
    "src/app/api/shipments/[trackingId]/carriers/sync/route.ts",
    "src/app/api/drivers/[driverId]/location/route.ts",
    "src/app/api/admin/dispatch/suggest/route.ts"
  ];
  for (const route of scopedRoutes) {
    const source = read(route);
    assert.match(source, /requireCloudFeature\(/, `${route} bypasses central Cloud entitlements`);
    assert.match(source, /companyId|company_id/, `${route} has no tenant scope`);
  }
  assert.match(read("src/app/api/notifications/whatsapp/route.ts"), /requireCloudFeature\(request, "whatsapp_notifications"/);
  assert.match(read("src/app/api/drivers/[driverId]/route.ts"), /requireCloudFeature\(request, "team_management"/);
});

test("public mutation APIs retain validation and throttling", () => {
  for (const route of ["src/app/api/quote/route.ts", "src/app/api/quote-requests/route.ts"]) {
    const source = read(route);
    assert.match(source, /enforceRateLimit\(/, `${route} has no rate limit`);
    assert.match(source, /z\.object\(|safeParse|\.parse\(|customerBookingSchema/, `${route} has no schema validation`);
  }
});

test("payment and carrier webhooks reject invalid production requests", () => {
  const flutterwave = read("src/app/api/webhooks/flutterwave/route.ts");
  assert.match(flutterwave, /FLUTTERWAVE_WEBHOOK_SECRET_HASH/);
  assert.match(flutterwave, /Invalid Flutterwave webhook signature/);
  assert.match(flutterwave, /status:\s*401/);

  for (const route of ["src/app/api/webhooks/fez/route.ts", "src/app/api/webhooks/sendbox/route.ts"]) {
    const source = read(route);
    assert.match(source, /WEBHOOK_SECRET/);
    assert.match(source, /status:\s*401/);
    assert.match(source, /status:\s*503|NODE_ENV\s*===\s*"production"/);
  }
});

test("private server credentials are not declared as public variables", () => {
  const files = routeFiles("src/app/api");
  const forbidden = /NEXT_PUBLIC_(?:SUPABASE_SERVICE_ROLE_KEY|CLOUDINARY_API_SECRET|FLUTTERWAVE_SECRET_KEY|FEZ_PASSWORD|FEZ_SECRET_KEY|WHATSAPP_CLOUD_ACCESS_TOKEN|RESEND_API_KEY)/;
  for (const file of files) assert.doesNotMatch(read(file), forbidden, `${file} exposes a private environment variable`);
});

test("customer-facing tracking uses concise Fly-only milestones", () => {
  const shipments = read("src/lib/shipments.ts");
  const customerOverview = read("src/app/api/customer/overview/route.ts");

  assert.match(shipments, /const publicTimelineLimit = 7/);
  assert.match(shipments, /export function publicShipmentTimeline/);
  assert.match(shipments, /location: "Fly Logistics network"/);
  assert.match(shipments, /publicTracking \? publicShipmentTimeline\(record\)/);
  assert.match(customerOverview, /timeline: publicShipmentTimeline\(shipment\)/);
  assert.match(read("src/lib/tracking-status.ts"), /delivery\\s\+partner/);
  assert.doesNotMatch(read("src/lib/tracking-status.ts"), /Delivery partner assigned/);
});

test("cloud operations enforce company roles and tenant row filters", () => {
  const tenantRoutes = [
    "src/app/api/cloud/customers/route.ts",
    "src/app/api/cloud/team/route.ts",
    "src/app/api/cloud/rates/route.ts",
    "src/app/api/cloud/analytics/route.ts"
  ];
  for (const route of tenantRoutes) {
    const source = read(route);
    assert.match(source, /require(?:CompanyRole|CloudFeature)\(/, `${route} has no company role or entitlement check`);
    assert.match(source, /companyId|company_id/, `${route} has no company scope`);
  }
  for (const route of ["src/app/api/shipments/route.ts", "src/app/api/drivers/route.ts"]) {
    assert.match(read(route), /requireCompanyRole\(/, `${route} does not support protected Cloud company roles`);
  }

  const shipmentUpdate = read("src/app/api/shipments/[trackingId]/route.ts");
  assert.match(shipmentUpdate, /driverQuery\s*=\s*driverQuery\.eq\("company_id",\s*tenant\.companyId\)/, "Driver assignment is not company-scoped");
  assert.match(shipmentUpdate, /enforceRateLimit\(request,\s*"shipment-update"/, "Shipment updates are not rate limited");
  assert.equal(existsSync(join(root, "src/app/cloud/(workspace)/operations/page.tsx")), true, "Cloud operations page is missing");
  assert.match(read("src/components/cloud/cloud-operations-workspace.tsx"), /export function CloudDispatchWorkspace/);
});

test("Cloud and self-service provisioning removes default Fly company memberships", () => {
  const tenancy = read("src/server/tenancy.ts");
  assert.match(tenancy, /export async function removeDefaultCompanyMembership/);
  assert.match(tenancy, /\.from\("companies"\)\s*\.select\("id"\)\s*\.eq\("slug",\s*DEFAULT_COMPANY_SLUG\)/);
  assert.match(tenancy, /\.from\("company_members"\)\s*\.delete\(\)\s*\.eq\("company_id",\s*company\.data\.id\)\s*\.eq\("user_id",\s*userId\)/);

  for (const route of [
    "src/app/api/cloud/signup/route.ts",
    "src/app/api/cloud/team/route.ts",
    "src/app/api/auth/register-profile/route.ts"
  ]) {
    const source = read(route);
    assert.match(source, /removeDefaultCompanyMembership/);
    assert.match(source, /defaultMembershipError/);
  }
});

test("private Cloud workspaces are noindex and private-cache protected", () => {
  const middleware = read("src/middleware.ts");
  const layout = read("src/app/layout.tsx");
  for (const route of ["/cloud/operations", "/cloud/rates", "/cloud/support", "/cloud/team"]) {
    assert.match(middleware, new RegExp(route.replaceAll("/", "\\/")), `${route} is missing from private Cloud prefixes`);
    assert.match(layout, new RegExp(route.replaceAll("/", "\\/")), `${route} is missing from private analytics exclusions`);
  }
});

test("cloud public tracking is tenant-scoped and customer-safe", () => {
  const portal = read("src/app/api/cloud/portal/[tenantSlug]/tracking/[trackingId]/route.ts");
  assert.match(portal, /shipmentIdentity/);
  assert.match(portal, /getPublicTenantProfileById/);
  assert.match(portal, /company\.profile\.slug !== slug\.data/);
  assert.match(portal, /company_id/);
  assert.match(portal, /normalizeShipment/);
  assert.match(portal, /includeProof:\s*false/);
  assert.match(portal, /publicTracking:\s*true/);
  assert.doesNotMatch(portal, /proof_of_delivery_url/);
  assert.doesNotMatch(portal, /carrier_order_no/);
});

test("tenant driver and foreign mutation routes reject missing rows safely", () => {
  const proof = read("src/app/api/shipments/[trackingId]/proof/route.ts");
  const driverUpdate = read("src/app/api/drivers/[driverId]/route.ts");
  const rateDelete = read("src/app/api/cloud/rates/[rateId]/route.ts");
  assert.match(proof, /isShipmentDriver\(access\.profile\.role,\s*access\.tenant\?\.companyRole\)/);
  assert.match(proof, /isDriver\s*&&\s*assignedDriverApproval\s*!==\s*"approved"/);
  assert.match(driverUpdate, /query\.select\(driverBaseSelect\)\.maybeSingle\(\)/);
  assert.match(driverUpdate, /if\s*\(!data\)\s*return\s+NextResponse\.json\(\{\s*error:\s*"Driver not found\."\s*\},\s*\{\s*status:\s*404\s*\}\)/);
  assert.match(rateDelete, /\.delete\(\).*\.select\("id"\)\.maybeSingle\(\)/);
  assert.match(rateDelete, /if\s*\(!result\.data\)\s*return\s+NextResponse\.json\(\{\s*error:\s*"Company rate not found\."\s*\},\s*\{\s*status:\s*404\s*\}\)/);
});

test("cloud branding is resolved before workspace hydration", () => {
  const layout = read("src/app/cloud/(workspace)/layout.tsx");
  const provider = read("src/components/cloud/cloud-tenant-context.tsx");
  const dashboard = read("src/components/cloud/cloud-dashboard.tsx");
  assert.match(layout, /resolveFreshProfileFromAccessToken/);
  assert.match(layout, /getTenantContextForProfile/);
  assert.match(layout, /CloudTenantProvider company=\{company\}/);
  assert.match(provider, /tenantCssVariables\(company\)/);
  assert.match(provider, /data-cloud-tenant/);
  assert.doesNotMatch(dashboard, /style=\{company\?\.brand_color/);
});

test("cloud marketing stays static while authenticated workspaces resolve tenant state", () => {
  assert.equal(existsSync(join(root, "src/app/cloud/layout.tsx")), false, "A dynamic root Cloud layout would force public marketing pages to render per request");
  assert.equal(existsSync(join(root, "src/app/cloud/(workspace)/layout.tsx")), true, "The authenticated Cloud workspace layout is missing");
  for (const route of ["page.tsx", "pricing/page.tsx", "features/page.tsx", "demo/page.tsx"]) {
    assert.equal(existsSync(join(root, "src/app/cloud", route)), true, `Public Cloud route ${route} is missing`);
  }
});

test("cloud brand assets are tenant-authorized and content validated", () => {
  const upload = read("src/app/api/cloud/branding/logo/route.ts");
  const dashboard = read("src/components/cloud/cloud-dashboard.tsx");
  assert.match(upload, /require(?:CompanyRole|CloudFeature)\(request, (?:"basic_branding", )?\["owner", "admin"\]\)/);
  assert.match(upload, /MAX_LOGO_BYTES = 5_000_000/);
  assert.match(upload, /detectedFormat/);
  assert.match(upload, /company-media\/\$\{companyId\}\/logo/);
  assert.doesNotMatch(upload, /paramsToSign/);
  assert.match(dashboard, /credentials:\s*"same-origin"/);
});

test("cloud logo file picker stays visually hidden without causing horizontal overflow", () => {
  const dashboard = read("src/components/cloud/cloud-dashboard.tsx");
  assert.match(dashboard, /id="companyLogo" type="file"[^>]*className="sr-only !h-px !w-px"/);
});

test("cloud public contacts expose only explicit safe tenant fields", () => {
  const profile = read("src/server/public-tenant-profile.ts");
  const branding = read("src/lib/tenant-branding.ts");
  assert.match(profile, /PUBLIC_TENANT_SELECT/);
  for (const field of ["public_address", "public_phone", "public_whatsapp", "public_support_email", "show_contact_on_tracking"]) assert.match(profile, new RegExp(field));
  for (const forbidden of ["billing_email", "flutterwave", "subscription_plan", "owner", "user_id"]) assert.doesNotMatch(profile, new RegExp(forbidden));
  assert.match(profile, /Cloud branding preferences are unavailable/);
  assert.match(profile, /logWarn\(/);
  assert.match(branding, /https:\/\/wa\.me\/\$\{phone\}/);
  assert.match(branding, /encodeURIComponent\(message\)/);
});

test("whatsapp verification remains strict while blog model is environment-driven", () => {
  const whatsapp = read("src/app/api/webhooks/whatsapp/route.ts");
  const blog = read("src/server/blog-publisher.ts");
  assert.match(whatsapp, /mode === "subscribe"/);
  assert.match(whatsapp, /safeTimingEqual\(verifyToken, configuredToken\)/);
  assert.match(whatsapp, /new Response\("Forbidden", \{ status: 403 \}\)/);
  assert.match(blog, /BLOG_GROQ_MODEL/);
  assert.match(blog, /GROQ_MODEL/);
  assert.doesNotMatch(blog, /model:\s*cleanEnv\([^\n]+\) \?\? "llama-3\.3-70b-versatile"/);
});

test("merchant portal has dedicated authentication, onboarding, and protected workspaces", () => {
  for (const route of [
    "src/app/merchant/login/page.tsx",
    "src/app/merchant/register/page.tsx",
    "src/app/merchant/onboarding/page.tsx",
    "src/app/merchant/dashboard/page.tsx",
    "src/app/merchant/shipments/page.tsx",
    "src/app/merchant/shipments/bulk/page.tsx"
  ]) assert.equal(existsSync(join(root, route)), true, `${route} is missing`);

  const middleware = read("src/middleware.ts");
  assert.match(middleware, /pathname\.startsWith\("\/merchant\/"\)/);
  assert.match(middleware, /if \(pathname\.startsWith\("\/merchant"\)\) return \["customer"\]/);
  assert.match(read("src/components/merchant/merchant-gate.tsx"), /\/api\/merchant\/access/);
  assert.doesNotMatch(read("src/app/merchant/page.tsx"), /\/customer\/(?:login|register)/);
});

test("merchant pricing is server-side, fixed at five percent, and persisted once", () => {
  const pricing = read("src/server/merchant-pricing.ts");
  const merchantApi = read("src/app/api/merchant/overview/route.ts");
  const quoteWorkflow = read("src/server/quote-workflow.ts");
  const shipmentConversion = read("src/server/quote-to-shipment.ts");
  const manualShipmentConversion = read("src/app/api/quote-requests/[requestId]/convert/route.ts");

  assert.match(pricing, /MERCHANT_DEFAULT_DISCOUNT_RATE = 0\.05/);
  assert.match(pricing, /normalizedStandard - discountAmount/);
  assert.match(pricing, /status.*ACTIVE/);
  assert.match(merchantApi, /calculateLogisticsPrice/);
  assert.match(merchantApi, /resolveMerchantPrice\(quote\.amount, account\.data\)/);
  for (const field of ["standard_price", "discountable_amount", "discount_rate", "discount_amount", "final_price", "pricing_rule_version"]) {
    assert.match(merchantApi, new RegExp(field), `merchant quote does not persist ${field}`);
    assert.match(shipmentConversion, new RegExp(field), `shipment conversion does not retain ${field}`);
    assert.match(manualShipmentConversion, new RegExp(field), `manual shipment conversion does not retain ${field}`);
  }
  assert.match(quoteWorkflow, /quote\.final_price \?\? quote\.quoted_price/);
  assert.doesNotMatch(read("src/app/api/quote/route.ts"), /resolveMerchantPrice/);
  assert.doesNotMatch(read("src/app/api/cloud/rates/route.ts"), /resolveMerchantPrice/);
});

test("merchant recipient data is isolated with row level security", () => {
  const migration = read("supabase/migrations/20260930_merchant_portal_foundation.sql");
  assert.match(migration, /alter table public\.merchant_recipients enable row level security/);
  assert.match(migration, /business_account_members/);
  assert.match(migration, /member\.user_id = \(select auth\.uid\(\)\)/);
  assert.match(migration, /revoke all on table public\.merchant_recipients from anon/);
});

test("customer booking separates instant local pricing from reviewed international requests", () => {
  const workspace = read("src/components/customer/customer-booking-workspace.tsx");
  const quoteRoute = read("src/app/api/quote-requests/route.ts");
  const bookingSchema = read("src/lib/customer-booking.ts");

  for (const mode of ["local_nigeria", "international_import", "international_export"]) {
    assert.match(workspace, new RegExp(mode), `booking workspace is missing ${mode}`);
    assert.match(bookingSchema, new RegExp(mode), `booking schema is missing ${mode}`);
  }
  assert.match(workspace, /Submit for final review/);
  assert.match(workspace, /\/api\/pricing\/quote/);
  assert.match(quoteRoute, /internationalReview \? "PENDING_REVIEW" : "QUOTED"/);
  assert.match(quoteRoute, /requiresReview: internationalReview/);
  assert.match(bookingSchema, /Local deliveries must start and end in Nigeria/);
});

test("customer booking supports saved addresses and scoped international documents", () => {
  const dashboard = read("src/components/customer/customer-dashboard.tsx");
  const workspace = read("src/components/customer/customer-booking-workspace.tsx");
  const cloudSign = read("src/app/api/cloudinary/sign/route.ts");

  assert.match(dashboard, /addresses=\{overview\?\.addresses \?\? \[\]\}/);
  assert.match(workspace, /<SavedAddress kind="pickup" \/>/);
  assert.match(workspace, /fly-logistics\/packages\/international-documents/);
  assert.match(workspace, /acceptDocuments/);
  assert.match(cloudSign, /\["admin", "dispatcher", "driver", "customer"\]/);
  assert.match(cloudSign, /isInternationalDocument && resourceType === "raw"/);
});

test("customer self-registration does not request or persist a company", () => {
  const access = read("src/components/auth/role-access-form.tsx");
  assert.match(access, /role !== "customer"/);
  assert.match(access, /signupRole === "customer" \? undefined : form\.company/);
});
