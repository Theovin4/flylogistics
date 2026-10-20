import type { FlyRole } from "@/lib/roles";

export const adminLoginPath = "/admin/login";
export const adminDashboardPath = "/admin/dashboard";

export type AdminPermission =
  | "command.view"
  | "shipments.manage"
  | "users.manage"
  | "drivers.manage"
  | "quotes.manage"
  | "finance.manage"
  | "support.manage"
  | "analytics.view"
  | "integrations.manage"
  | "audit.view"
  | "settings.manage";

const allAdminPermissions: readonly AdminPermission[] = [
  "command.view",
  "shipments.manage",
  "users.manage",
  "drivers.manage",
  "quotes.manage",
  "finance.manage",
  "support.manage",
  "analytics.view",
  "integrations.manage",
  "audit.view",
  "settings.manage"
];

const permissionsByRole: Record<FlyRole, readonly AdminPermission[]> = {
  admin: allAdminPermissions,
  customer_care: ["command.view", "quotes.manage", "support.manage"],
  moderator: ["command.view", "support.manage"],
  finance: ["command.view", "finance.manage", "analytics.view"],
  warehouse: ["command.view", "shipments.manage"],
  dispatcher: [],
  driver: [],
  customer: []
};

const adminRoutePermission: Record<string, AdminPermission> = {
  dashboard: "command.view",
  leads: "analytics.view",
  shipments: "shipments.manage",
  users: "users.manage",
  customers: "users.manage",
  merchants: "users.manage",
  cloud: "users.manage",
  drivers: "drivers.manage",
  dispatchers: "drivers.manage",
  quotes: "quotes.manage",
  payments: "finance.manage",
  wallets: "finance.manage",
  pricing: "finance.manage",
  tracking: "shipments.manage",
  carriers: "integrations.manage",
  support: "support.manage",
  notifications: "support.manage",
  whatsapp: "support.manage",
  analytics: "analytics.view",
  growth: "analytics.view",
  intelligence: "analytics.view",
  audit: "audit.view",
  integrations: "integrations.manage",
  settings: "settings.manage"
};

export const canonicalAdminSections = Object.freeze(Object.keys(adminRoutePermission));

export function hasAdminPermission(role: FlyRole, permission: AdminPermission) {
  return permissionsByRole[role].includes(permission);
}

export function adminPermissionForPath(pathname: string): AdminPermission | null {
  if (!pathname.startsWith("/admin/")) return null;
  const section = pathname.split("/").filter(Boolean)[1];
  if (!section || section === "login") return null;
  return adminRoutePermission[section] ?? "settings.manage";
}

export function canAccessAdminPath(role: FlyRole, pathname: string) {
  const permission = adminPermissionForPath(pathname);
  return permission ? hasAdminPermission(role, permission) : role === "admin";
}

export function rolesForAdminPath(pathname: string): FlyRole[] | null {
  const permission = adminPermissionForPath(pathname);
  if (!permission) return null;
  return (Object.keys(permissionsByRole) as FlyRole[]).filter((role) => hasAdminPermission(role, permission));
}
