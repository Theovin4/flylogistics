export const flyRoles = ["admin", "dispatcher", "driver", "customer"] as const;

export type FlyRole = (typeof flyRoles)[number];

export function normalizeRole(role: unknown): FlyRole {
  const normalized = String(role ?? "customer").trim().toLowerCase();
  return flyRoles.includes(normalized as FlyRole) ? (normalized as FlyRole) : "customer";
}

export function dashboardForRole(role: FlyRole) {
  if (role === "admin") return "/dashboard/admin";
  if (role === "dispatcher") return "/dashboard/dispatcher";
  if (role === "driver") return "/dashboard/driver";
  return "/dashboard/customer";
}

export function canAccessRole(userRole: FlyRole, allowedRoles: FlyRole[]) {
  return userRole === "admin" || allowedRoles.includes(userRole);
}
