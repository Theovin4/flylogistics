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

test("every admin API route performs a server-side role check", () => {
  const routes = routeFiles("src/app/api/admin");
  assert.ok(routes.length > 0, "No admin API routes were found");
  for (const route of routes) assert.match(read(route), /requireRole\(/, `${route} has no requireRole check`);
});

test("public mutation APIs retain validation and throttling", () => {
  for (const route of ["src/app/api/quote/route.ts", "src/app/api/quote-requests/route.ts"]) {
    const source = read(route);
    assert.match(source, /enforceRateLimit\(/, `${route} has no rate limit`);
    assert.match(source, /z\.object\(|safeParse|\.parse\(/, `${route} has no schema validation`);
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
