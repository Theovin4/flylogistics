export type SelfServiceRegistrationRole = "customer" | "driver";

export function matchesAuthenticatedRegistrationAccount(
  authenticatedUser: { id: string; email?: string | null } | null | undefined,
  input: { userId: string; email: string }
) {
  return Boolean(
    authenticatedUser &&
    authenticatedUser.id === input.userId &&
    authenticatedUser.email?.toLowerCase() === input.email.toLowerCase()
  );
}

export function canKeepSelfServiceRegistrationRole(
  existingRole: string | null | undefined,
  requestedRole: SelfServiceRegistrationRole
) {
  const currentRole = String(existingRole ?? "").trim().toLowerCase();
  return !currentRole || currentRole === requestedRole;
}
