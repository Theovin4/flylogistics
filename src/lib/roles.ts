export const flyRoles = [
  "admin",
  "dispatcher",
  "customer_care",
  "moderator",
  "finance",
  "warehouse",
  "driver",
  "customer"
] as const;

export type FlyRole = (typeof flyRoles)[number];
export type SelfServiceRole = "customer" | "driver";

export const assignableFlyRoles = flyRoles;
export const internalAdminRoles = ["admin", "customer_care", "moderator", "finance", "warehouse"] as const;

export const roleLabels: Record<FlyRole, string> = {
  admin: "Admin",
  dispatcher: "Dispatcher",
  customer_care: "Customer Care",
  moderator: "Moderator",
  finance: "Finance",
  warehouse: "Warehouse",
  driver: "Driver/Rider",
  customer: "Customer"
};

export const roleDescriptions: Record<FlyRole, string> = {
  admin: "Full operations control, including role assignment, shipments, quotes, drivers, analytics, payments, and logs.",
  dispatcher: "Fleet coordination, shipment status updates, driver assignment, and route operations.",
  customer_care: "Customer support, shipment communication, quote follow-up, and service issue handling.",
  moderator: "Support moderation, content review, and limited operational supervision.",
  finance: "Payment review, invoice visibility, paid/unpaid shipment checks, and revenue operations.",
  warehouse: "Warehouse handling, pickup/package events, inventory movement, and handoff updates.",
  driver: "Assigned shipment work, live location updates, status changes, and delivery proof upload.",
  customer: "Customer portal access for quotes, shipments, tracking, payments, and delivery confirmations."
};

export function normalizeRole(role: unknown): FlyRole {
  const normalized = String(role ?? "customer").trim().toLowerCase();
  if (normalized === "rider" || normalized === "driver/rider" || normalized === "driver_rider") return "driver";
  return flyRoles.includes(normalized as FlyRole) ? (normalized as FlyRole) : "customer";
}

export function normalizeSelfServiceRole(role: unknown): SelfServiceRole {
  return normalizeRole(role) === "driver" ? "driver" : "customer";
}

export function portalForRole(role: FlyRole) {
  if (role === "admin") return "/dashboard/admin";
  if (role === "customer_care" || role === "moderator" || role === "finance" || role === "warehouse") return "/dashboard/admin";
  if (role === "dispatcher") return "/dispatcher";
  if (role === "driver") return "/driver";
  return "/customer";
}

export function dashboardForRole(role: FlyRole) {
  return portalForRole(role);
}

export function isInternalAdminRole(role: FlyRole) {
  return (internalAdminRoles as readonly FlyRole[]).includes(role);
}

export function canAccessRole(userRole: FlyRole, allowedRoles: FlyRole[]) {
  return userRole === "admin" || allowedRoles.includes(userRole);
}

export function canManageRoles(userRole: FlyRole) {
  return userRole === "admin";
}
