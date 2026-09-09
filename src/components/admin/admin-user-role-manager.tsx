"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, KeyRound, Loader2, RefreshCw, ShieldCheck, Trash2, UserCog, UserPlus, Users } from "lucide-react";
import { flyError, flySuccess } from "@/components/feedback/fly-toast";
import { driverTransportationOptions } from "@/lib/driver-data";
import { getSupabaseBrowser } from "@/lib/supabase";
import { assignableFlyRoles, roleDescriptions, roleLabels, type FlyRole } from "@/lib/roles";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type ManagedUser = {
  id: string;
  email: string | null;
  role: FlyRole | null;
  hasProfile: boolean;
  createdAt: string | null;
  lastSignInAt: string | null;
};

type UsersResponse = {
  users?: ManagedUser[];
  roles?: FlyRole[];
  error?: string;
};

type ProfileResponse = {
  id?: string;
  role?: FlyRole;
  error?: string;
};

type ApiErrorResponse = {
  error?: string;
  warning?: string;
  activeShipments?: { tracking_id?: string | null; trackingId?: string | null; status?: string | null }[];
};

const adminCreatableRoles = assignableFlyRoles.filter((role) => role !== "admin") as Exclude<FlyRole, "admin">[];

const emptyCreateForm = {
  fullName: "",
  email: "",
  password: "",
  phone: "",
  company: "",
  vehicleType: "bike",
  role: "customer" as FlyRole
};

function roleBadgeClass(role?: FlyRole | null) {
  if (role === "admin") return "border-primary/40 bg-primary/10 text-primary";
  if (role === "dispatcher") return "border-emerald-500/40 bg-emerald-500/10 text-emerald-500";
  if (role === "driver") return "border-sky-500/40 bg-sky-500/10 text-sky-500";
  if (role === "customer") return "border-muted-foreground/30 bg-background/60 text-muted-foreground";
  return "border-amber-500/40 bg-amber-500/10 text-amber-500";
}

function formatDate(value?: string | null) {
  if (!value) return "Not recorded";
  return new Date(value).toLocaleString();
}

function displayRole(role?: FlyRole | null) {
  return role ? roleLabels[role] : "Profile missing";
}

function apiErrorMessage(data: ApiErrorResponse, fallback: string) {
  const activeShipments = data.activeShipments ?? [];
  const shipmentList = activeShipments
    .map((shipment) => shipment.tracking_id ?? shipment.trackingId)
    .filter(Boolean)
    .join(", ");
  return `${data.error ?? data.warning ?? fallback}${shipmentList ? ` Active shipments: ${shipmentList}.` : ""}`;
}

export function AdminUserRoleManager() {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [selectedRoles, setSelectedRoles] = useState<Record<string, FlyRole>>({});
  const [loading, setLoading] = useState(true);
  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState(emptyCreateForm);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const authHeaders = useCallback(async () => {
    const supabase = getSupabaseBrowser();
    const { data } = supabase ? await supabase.auth.getSession() : { data: { session: null } };
    return data.session?.access_token ? { Authorization: `Bearer ${data.session.access_token}` } : {};
  }, []);

  const authorizedFetch = useCallback(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const headers = new Headers(init.headers);
    const auth = await authHeaders();
    Object.entries(auth).forEach(([key, value]) => headers.set(key, value));
    return fetch(input, { ...init, headers });
  }, [authHeaders]);

  const stats = useMemo(() => {
    const roleCounts = new Map<FlyRole, number>();
    for (const user of users) {
      if (!user.role) continue;
      roleCounts.set(user.role, (roleCounts.get(user.role) ?? 0) + 1);
    }
    return {
      total: users.length,
      admins: roleCounts.get("admin") ?? 0,
      staff: users.filter((user) => user.role && !["customer", "driver"].includes(user.role)).length,
      missingProfiles: users.filter((user) => !user.hasProfile).length
    };
  }, [users]);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      const profileResponse = await authorizedFetch("/api/auth/profile");
      const profileData = (await profileResponse.json()) as ProfileResponse;
      if (profileResponse.ok) setCurrentUserId(profileData.id ?? null);

      const response = await authorizedFetch("/api/admin/users");
      const data = (await response.json()) as UsersResponse;
      if (!response.ok) throw new Error(data.error ?? "Unable to load user accounts.");

      const records = data.users ?? [];
      setUsers(records);
      setSelectedRoles(Object.fromEntries(records.map((user) => [user.id, user.role ?? "customer"])));
    } catch (err) {
      const nextError = err instanceof Error ? err.message : "Unable to load user accounts.";
      setError(nextError);
      flyError("Unable to load user accounts", nextError);
    } finally {
      setLoading(false);
    }
  }, [authorizedFetch]);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  function updateSelectedRole(userId: string, role: FlyRole) {
    setSelectedRoles((current) => ({ ...current, [userId]: role }));
  }

  function updateCreateField<Key extends keyof typeof createForm>(field: Key, value: (typeof createForm)[Key]) {
    setCreateForm((current) => ({ ...current, [field]: value }));
  }

  async function createAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreating(true);
    setError(null);
    setMessage(null);

    try {
      const response = await authorizedFetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(createForm)
      });
      const data = (await response.json()) as ManagedUser & { error?: string; emailConfirmed?: boolean; driverId?: number | string | null };
      if (!response.ok) throw new Error(data.error ?? "Unable to create account.");

      setUsers((current) => [data, ...current.filter((item) => item.id !== data.id)]);
      setSelectedRoles((current) => ({ ...current, [data.id]: data.role ?? createForm.role }));
      const createdRole = data.role ?? createForm.role;
      const success = createdRole === "driver" || createdRole === "dispatcher"
        ? `${createForm.fullName} can now sign in from /${createdRole}/login with their name or user ID and phone number.`
        : `${data.email ?? createForm.email} can now sign in immediately from the ${roleLabels[createdRole]} login page with the password you set.`;
      setMessage(success);
      flySuccess("Account created", success);
      setCreateForm(emptyCreateForm);
    } catch (err) {
      const nextError = err instanceof Error ? err.message : "Unable to create account.";
      setError(nextError);
      flyError("Unable to create account", nextError);
    } finally {
      setCreating(false);
    }
  }

  async function saveRole(user: ManagedUser) {
    const nextRole = selectedRoles[user.id];
    if (!nextRole) return;

    setSavingUserId(user.id);
    setError(null);
    setMessage(null);

    try {
      const response = await authorizedFetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, role: nextRole })
      });
      const data = (await response.json()) as ManagedUser & { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Unable to update user role.");

      setUsers((current) => current.map((item) => (item.id === user.id ? { ...item, ...data } : item)));
      setSelectedRoles((current) => ({ ...current, [user.id]: data.role ?? nextRole }));
      const success = `${user.email ?? user.id} is now ${roleLabels[data.role ?? nextRole]}.`;
      setMessage(success);
      flySuccess("Role updated", success);
    } catch (err) {
      const nextError = err instanceof Error ? err.message : "Unable to update user role.";
      setError(nextError);
      flyError("Unable to update role", nextError);
    } finally {
      setSavingUserId(null);
    }
  }

  async function deleteUser(user: ManagedUser) {
    if (user.id === currentUserId) {
      setError("You cannot delete your own active admin account.");
      flyError("Protected admin account", "You cannot delete your own active admin account.");
      return;
    }

    const label = user.email ?? user.id;
    const confirmed = window.confirm(`Delete ${label} from Fly Logistics Auth and user_profiles? This cannot be undone.`);
    if (!confirmed) return;

    setDeletingUserId(user.id);
    setError(null);
    setMessage(null);

    try {
      const response = await authorizedFetch(`/api/admin/users/${encodeURIComponent(user.id)}`, {
        method: "DELETE"
      });
      const data = (await response.json()) as ApiErrorResponse;
      if (!response.ok) throw new Error(apiErrorMessage(data, "Unable to delete account."));

      setUsers((current) => current.filter((item) => item.id !== user.id));
      setSelectedRoles((current) => {
        const next = { ...current };
        delete next[user.id];
        return next;
      });
      const success = `${label} was deleted from Fly Logistics accounts${data.warning ? `, but ${data.warning.toLowerCase()}` : "."}`;
      setMessage(success);
      flySuccess("Account deleted", success);
    } catch (err) {
      const nextError = err instanceof Error ? err.message : "Unable to delete account.";
      setError(nextError);
      flyError("Unable to delete account", nextError);
    } finally {
      setDeletingUserId(null);
    }
  }

  return (
    <section className="mt-8 grid gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Badge className="border-primary/40 bg-primary/10 text-primary">Role control</Badge>
          <h2 className="mt-3 text-2xl font-black tracking-normal sm:text-3xl">User and role management</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
            Assign operational roles from a protected admin-only console. Public signup remains limited to customer and driver accounts.
          </p>
        </div>
        <Button type="button" variant="outline" onClick={loadUsers} disabled={loading} className="w-full sm:w-auto">
          <RefreshCw className={loading ? "animate-spin" : ""} />
          Refresh users
        </Button>
      </div>

      {message && (
        <div className="flex gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-500">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
          {message}
        </div>
      )}
      {error && (
        <div className="flex gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          {error}
        </div>
      )}

      <Card className="glass">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserPlus className="size-5 text-primary" />
            Create login-ready account
          </CardTitle>
          <p className="text-sm leading-6 text-muted-foreground">
            Admin-created accounts are email-confirmed immediately. Customers and staff use email/password. Drivers, riders, and dispatchers use their name or user ID plus the saved phone number.
          </p>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4" onSubmit={(event) => void createAccount(event)}>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <div className="grid gap-2">
                <Label htmlFor="createFullName">Full name</Label>
                <Input id="createFullName" value={createForm.fullName} onChange={(event) => updateCreateField("fullName", event.target.value)} required />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="createEmail">Email</Label>
                <Input id="createEmail" type="email" value={createForm.email} onChange={(event) => updateCreateField("email", event.target.value)} required />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="createPassword">Temporary password</Label>
                <Input id="createPassword" type="password" value={createForm.password} onChange={(event) => updateCreateField("password", event.target.value)} minLength={8} required />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="createPhone">Phone</Label>
                <Input id="createPhone" value={createForm.phone} onChange={(event) => updateCreateField("phone", event.target.value)} required={createForm.role === "driver" || createForm.role === "dispatcher"} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="createCompany">Company</Label>
                <Input id="createCompany" value={createForm.company} onChange={(event) => updateCreateField("company", event.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="createRole">Role</Label>
                <select
                  id="createRole"
                  value={createForm.role}
                  onChange={(event) => updateCreateField("role", event.target.value as FlyRole)}
                  className="h-11 rounded-md border bg-background/70 px-3 text-sm"
                >
                  {adminCreatableRoles.map((role) => (
                    <option key={role} value={role}>{roleLabels[role]}</option>
                  ))}
                </select>
              </div>
              {createForm.role === "driver" && (
                <div className="grid gap-2">
                  <Label htmlFor="createVehicleType">Transportation type</Label>
                  <select
                    id="createVehicleType"
                    value={createForm.vehicleType}
                    onChange={(event) => updateCreateField("vehicleType", event.target.value)}
                    className="h-11 rounded-md border bg-background/70 px-3 text-sm"
                    required
                  >
                    {driverTransportationOptions.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            <div className="flex flex-col gap-3 rounded-md border bg-background/35 p-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
              <span className="flex items-start gap-2">
                <KeyRound className="mt-0.5 size-4 shrink-0 text-primary" />
                Admin accounts stay private. To grant admin power, create a staff user first, then promote from the role table below.
              </span>
              <Button type="submit" disabled={creating} className="w-full sm:w-auto">
                {creating ? <Loader2 className="animate-spin" /> : <UserPlus />}
                Create account
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Total accounts", stats.total],
          ["Admins", stats.admins],
          ["Internal staff", stats.staff],
          ["Missing profiles", stats.missingProfiles]
        ].map(([label, value]) => (
          <Card key={label} className="glass">
            <CardHeader className="pb-2">
              <CardTitle className="font-mono text-2xl">{value}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">{label}</CardContent>
          </Card>
        ))}
      </div>

      <Card className="glass">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="size-5 text-primary" />
            Account roles
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          {loading && (
            <div className="flex items-center gap-3 rounded-md border bg-background/40 p-4 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin text-primary" />
              Loading Fly Logistics users...
            </div>
          )}
          {!loading && users.length === 0 && (
            <div className="rounded-md border bg-background/40 p-4 text-sm text-muted-foreground">
              No user accounts were returned from Supabase yet.
            </div>
          )}
          {users.map((user) => {
            const selectedRole = selectedRoles[user.id] ?? user.role ?? "customer";
            const changed = selectedRole !== (user.role ?? "customer") || !user.hasProfile;
            const saving = savingUserId === user.id;
            const deleting = deletingUserId === user.id;
            const selfDemotion = user.id === currentUserId && selectedRole !== "admin";
            const selfAccount = user.id === currentUserId;

            return (
              <div key={user.id} className="grid gap-4 rounded-md border bg-background/45 p-4 xl:grid-cols-[1fr_360px] xl:items-center">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="truncate text-base font-bold">{user.email ?? "No email recorded"}</h3>
                    <Badge className={roleBadgeClass(user.role)}>{displayRole(user.role)}</Badge>
                    {!user.hasProfile && <Badge className="border-destructive/40 bg-destructive/10 text-destructive">profile needed</Badge>}
                    {user.id === currentUserId && <Badge>you</Badge>}
                  </div>
                  <p className="mt-2 font-mono text-xs text-muted-foreground">{user.id}</p>
                  <div className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
                    <span>Created: {formatDate(user.createdAt)}</span>
                    <span>Last sign-in: {formatDate(user.lastSignInAt)}</span>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-muted-foreground">{roleDescriptions[selectedRole]}</p>
                </div>
                <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                  <label className="grid gap-2 text-sm font-medium">
                    Assign role
                    <select
                      value={selectedRole}
                      onChange={(event) => updateSelectedRole(user.id, event.target.value as FlyRole)}
                      className="h-11 rounded-md border bg-background/70 px-3 text-sm"
                    >
                      {(assignableFlyRoles as readonly FlyRole[]).map((role) => (
                        <option key={role} value={role}>{roleLabels[role]}</option>
                      ))}
                    </select>
                  </label>
                  <Button
                    type="button"
                    disabled={!changed || saving || deleting || selfDemotion}
                    onClick={() => void saveRole(user)}
                    className="self-end"
                  >
                    {saving ? <Loader2 className="animate-spin" /> : <UserCog />}
                    Save
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    disabled={selfAccount || deleting || saving}
                    onClick={() => void deleteUser(user)}
                    className="sm:col-span-2"
                  >
                    {deleting ? <Loader2 className="animate-spin" /> : <Trash2 />}
                    Delete account
                  </Button>
                  {selfDemotion && (
                    <div className="rounded-md border border-primary/30 bg-primary/10 p-3 text-xs text-primary sm:col-span-2">
                      <ShieldCheck className="mr-1 inline size-3" />
                      You cannot remove admin access from your own active session.
                    </div>
                  )}
                  {selfAccount && (
                    <div className="rounded-md border border-primary/30 bg-primary/10 p-3 text-xs text-primary sm:col-span-2">
                      <ShieldCheck className="mr-1 inline size-3" />
                      Your active admin account is locked from self-delete.
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </section>
  );
}
