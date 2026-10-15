import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

test("admin access uses canonical login and dashboard routes", () => {
  const access = read("src/lib/admin-access.ts");
  const roles = read("src/lib/roles.ts");
  assert.match(access, /adminLoginPath = "\/admin\/login"/);
  assert.match(access, /adminDashboardPath = "\/admin\/dashboard"/);
  assert.match(roles, /return "\/admin\/dashboard"/);
});

test("admin child routes are permission-scoped", () => {
  const access = read("src/lib/admin-access.ts");
  const middleware = read("src/middleware.ts");
  for (const permission of ["users.manage", "finance.manage", "support.manage", "integrations.manage", "audit.view"]) {
    assert.match(access, new RegExp(permission.replace(".", "\\.")));
  }
  assert.match(middleware, /rolesForAdminPath\(pathname\)/);
  assert.match(middleware, /portalForRole\(role\)/);
});

test("legacy admin routes redirect to canonical command center", () => {
  assert.match(read("src/app/dashboard/admin/page.tsx"), /redirect\("\/admin\/dashboard"\)/);
  assert.match(read("src/app/fly-admin-ops/login/page.tsx"), /redirect\("\/admin\/login"\)/);
  assert.match(read("src/app/dashboard/admin/operational-events/page.tsx"), /redirect\("\/admin\/audit"\)/);
});

test("Cloud tenant controls and global search require server-side admin authorization", () => {
  const cloud = read("src/app/api/admin/cloud/route.ts");
  const search = read("src/app/api/admin/search/route.ts");
  assert.match(cloud, /requireRole\(request, \["admin"\]\)/);
  assert.match(cloud, /writeAuditLog/);
  assert.match(cloud, /\.range\(from, to\)/);
  assert.match(search, /requireRole\(request, \["admin", "customer_care", "moderator", "finance", "warehouse"\]\)/);
  assert.match(search, /getTenantContextForProfile/);
  assert.match(search, /company_id/);
});
