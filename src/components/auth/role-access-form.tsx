"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import type { Route as NextRoute } from "next";
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  LockKeyhole,
  ShieldCheck,
  Truck,
  UserPlus,
  Users
} from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getSupabaseBrowser } from "@/lib/supabase";
import { driverTransportationOptions } from "@/lib/driver-data";
import { isInternalAdminRole, normalizeRole, portalForRole, roleLabels, type FlyRole, type SelfServiceRole } from "@/lib/roles";
import { canonicalSiteUrl } from "@/lib/site";
import { isReasonablePhone, strongPasswordIssue, strongPasswordMinimumLength } from "@/lib/account-security";

type RoleAccessMode = "login" | "register";
type AccessFormRole = "admin" | "customer" | "driver" | "dispatcher";

type JsonResponse = {
  error?: string;
  role?: unknown;
  accessToken?: string;
  refreshToken?: string;
  expiresIn?: number;
};

const roleCopy: Record<AccessFormRole, {
  eyebrow: string;
  title: string;
  description: string;
  icon: typeof ShieldCheck;
  loginLabel: string;
}> = {
  admin: {
    eyebrow: "Admin access",
    title: "Admin sign in.",
    description: "Manage Fly Logistics operations.",
    icon: ShieldCheck,
    loginLabel: "Continue to admin dashboard"
  },
  customer: {
    eyebrow: "Customer access",
    title: "Welcome back.",
    description: "Sign in to manage your shipments.",
    icon: UserPlus,
    loginLabel: "Continue to customer portal"
  },
  driver: {
    eyebrow: "Driver and rider access",
    title: "Driver sign in.",
    description: "View assignments and update deliveries.",
    icon: Truck,
    loginLabel: "Continue to driver portal"
  },
  dispatcher: {
    eyebrow: "Dispatcher access",
    title: "Dispatcher sign in.",
    description: "Coordinate drivers and active shipments.",
    icon: Users,
    loginLabel: "Continue to dispatcher portal"
  }
} as const;

const selfServiceRoles = new Set<FlyRole>(["customer", "driver"]);

const initialForm = {
  fullName: "",
  company: "",
  phone: "",
  vehicleType: "bike",
  email: "",
  password: ""
};

async function fetchJson(input: RequestInfo | URL, init: RequestInit, fallbackError: string) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(input, { ...init, signal: controller.signal });
    const text = await response.text();
    const data = text ? (JSON.parse(text) as JsonResponse) : {};

    if (!response.ok) {
      throw new Error(`${fallbackError}${data.error ? ` ${data.error}` : ""} (${response.status}).`);
    }

    return data;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error(`${fallbackError} The request timed out. Please try again.`);
    }
    if (error instanceof SyntaxError) {
      throw new Error(`${fallbackError} The server returned an unreadable response.`);
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

function requestedNext(role: FlyRole) {
  const next = new URLSearchParams(window.location.search).get("next");
  const portal = portalForRole(role);
  if (!next?.startsWith("/")) return portal;
  if (next.startsWith(portal)) return next;
  if (role === "admin" && (next === "/dashboard" || next.startsWith("/dashboard/admin"))) return next;
  if (role === "driver" && next.startsWith("/dashboard/driver")) return next;
  if (role === "dispatcher" && next.startsWith("/dashboard/dispatcher")) return next;
  if (role === "customer" && next.startsWith("/dashboard/customer")) return next;
  return portal;
}

function canUseAccessPage(pageRole: AccessFormRole, resolvedRole: FlyRole) {
  return normalizeRole(pageRole) === resolvedRole;
}

function roleLoginName(role: FlyRole) {
  if (isInternalAdminRole(role)) return "private admin/staff login";
  if (role === "customer") return "customer login";
  if (role === "driver") return "driver login";
  if (role === "dispatcher") return "dispatcher login";
  return `${roleLabels[role]} login`;
}

export function RoleAccessForm({
  mode,
  role
}: {
  mode: RoleAccessMode;
  role: AccessFormRole;
}) {
  const [form, setForm] = useState(initialForm);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const copy = roleCopy[role];
  const Icon = copy.icon;
  const isRegister = mode === "register";
  const canRegister = selfServiceRoles.has(role);

  function updateField<Key extends keyof typeof form>(field: Key, value: (typeof form)[Key]) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function clearServerSession() {
    await fetch("/api/auth/session", { method: "DELETE" });
  }

  async function verifyRole(accessToken: string) {
    const profile = await fetchJson(
      "/api/auth/profile",
      { headers: { Authorization: `Bearer ${accessToken}` } },
      "Unable to verify your Fly Logistics account."
    );
    return normalizeRole(profile.role);
  }

  async function syncServerSession(accessToken: string, expiresIn?: number) {
    const session = await fetchJson(
      "/api/auth/session",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessToken, expiresIn })
      },
      "Unable to create a secure browser session."
    );
    return session.role ? normalizeRole(session.role) : null;
  }

  function navigateTo(roleToOpen: FlyRole) {
    const target = requestedNext(roleToOpen);
    setMessage(`Signed in. Opening ${isInternalAdminRole(roleToOpen) ? "admin operations" : `${roleToOpen} portal`}...`);
    window.location.assign(target);
    window.setTimeout(() => {
      setError(`You are signed in, but the redirect did not complete. Open ${target} from your browser.`);
      setLoading(false);
    }, 8000);
  }

  async function finishSignIn(accessToken: string, refreshToken: string, expiresIn?: number, freshLoginRole?: FlyRole) {
    const supabase = getSupabaseBrowser();
    if (!supabase) throw new Error("Secure sign-in is temporarily unavailable.");

    const { error: sessionError } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken
    });
    if (sessionError) throw new Error(`Unable to persist browser session: ${sessionError.message}`);

    const resolvedRole = freshLoginRole ?? await verifyRole(accessToken);

    if (!canUseAccessPage(role, resolvedRole)) {
      await supabase.auth.signOut();
      await clearServerSession();
      throw new Error(`This page is for ${role} accounts. Your account is ${resolvedRole}. Please use the ${roleLoginName(resolvedRole)}.`);
    }

    const serverRole = await syncServerSession(accessToken, expiresIn);
    const finalRole = serverRole ?? resolvedRole;
    if (!canUseAccessPage(role, finalRole)) {
      await supabase.auth.signOut();
      await clearServerSession();
      throw new Error(`This page is for ${role} accounts. Your account is ${finalRole}. Please use the ${roleLoginName(finalRole)}.`);
    }

    navigateTo(finalRole);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    let navigating = false;
    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      const supabase = getSupabaseBrowser();
      if (!supabase) throw new Error("Secure sign-in is temporarily unavailable.");

      if (isRegister) {
        const passwordIssue = strongPasswordIssue(form.password);
        if (passwordIssue) throw new Error(`Choose a stronger password. ${passwordIssue}`);
        if (!isReasonablePhone(form.phone)) throw new Error("Enter a valid phone number with country code.");
      }

      if (isRegister) {
        if (!canRegister) throw new Error("This role cannot be self-registered. Please contact Fly Logistics operations.");

        const signupRole = role as SelfServiceRole;
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: form.email.trim(),
          password: form.password,
          options: {
            emailRedirectTo: `${canonicalSiteUrl}${portalForRole(signupRole)}`,
            data: {
              full_name: form.fullName,
              company: form.company,
              phone: form.phone,
              vehicle_type: signupRole === "driver" ? form.vehicleType : undefined,
              role: signupRole
            }
          }
        });

        if (signUpError) throw new Error(`Account creation failed: ${signUpError.message}`);

        if (data.user?.id && data.session?.access_token) {
          const headers = new Headers({ "Content-Type": "application/json" });
          headers.set("Authorization", `Bearer ${data.session.access_token}`);
          try {
            await fetchJson(
              "/api/auth/register-profile",
              {
                method: "POST",
                headers,
                body: JSON.stringify({
                  userId: data.user.id,
                  email: form.email.trim(),
                  fullName: form.fullName,
                  company: form.company,
                  phone: form.phone,
                  vehicleType: signupRole === "driver" ? form.vehicleType : undefined,
                  role: signupRole
                })
              },
              "Your account was created, but profile setup needs attention."
            );
          } catch (profileError) {
            console.warn("Role profile setup will be retried during session verification.", profileError);
          }
        }

        if (data.session?.access_token && data.session.refresh_token) {
          await finishSignIn(data.session.access_token, data.session.refresh_token, data.session.expires_in);
          navigating = true;
          return;
        }

        setMessage(`Account created. Check your email to confirm access, then sign in from the ${role} login page.`);
        return;
      }

      await clearServerSession().catch(() => undefined);
      await supabase.auth.signOut().catch(() => undefined);
      window.localStorage.removeItem("fly_role");
      window.sessionStorage.removeItem("fly_role");

      const login = await fetchJson(
        "/api/auth/login",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: form.email.trim(), password: form.password, expectedRole: role })
        },
        `Unable to sign in as ${role}.`
      );

        if (!login.accessToken || !login.refreshToken) throw new Error("No secure session was returned.");

      const loginRole = login.role ? normalizeRole(login.role) : undefined;
      await finishSignIn(login.accessToken, login.refreshToken, login.expiresIn, loginRole);
      navigating = true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed.");
    } finally {
      if (!navigating) setLoading(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center px-4 py-6 sm:py-10">
      <div className="w-full max-w-5xl">
        <div className="mb-6 flex justify-center">
          <Logo />
        </div>
        <div className="grid gap-5 lg:grid-cols-[1fr_440px] lg:items-stretch">
          <section className="glass rounded-md border p-5 sm:p-8">
            <Badge className="border-primary/40 bg-primary/10 text-primary">{copy.eyebrow}</Badge>
            <h1 className="mt-5 text-3xl font-black tracking-normal sm:text-5xl">{copy.title}</h1>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-muted-foreground">{copy.description}</p>
            {role === "driver" && isRegister && (
              <div className="mt-5 rounded-md border border-primary/30 bg-primary/10 p-4 text-sm leading-6 text-muted-foreground">
                Driver/rider accounts are created as pending. An admin approves the profile before live location updates, assignment responses, and delivery proof actions are unlocked.
              </div>
            )}
          </section>

          <Card className="glass">
            <CardHeader className="p-5 sm:p-6">
              <CardTitle className="flex items-center gap-2 text-xl sm:text-2xl">
                <Icon className="size-5 text-primary" />
                {isRegister ? "Create account" : `${role[0].toUpperCase()}${role.slice(1)} login`}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-5 pt-0 sm:p-6 sm:pt-0">
              {!canRegister && isRegister ? (
                <div className="rounded-md border border-primary/30 bg-primary/10 p-4 text-sm text-muted-foreground">
                  {role === "admin" ? "Admin accounts cannot be publicly registered. Fly Logistics assigns admin access privately." : "This role is invite-only for now."}
                </div>
              ) : (
                <form className="grid gap-4" onSubmit={submit}>
                  {isRegister && (
                    <>
                      <div className="grid gap-2">
                        <Label htmlFor="fullName">Full name</Label>
                        <Input id="fullName" value={form.fullName} onChange={(event) => updateField("fullName", event.target.value)} required />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="company">Company</Label>
                        <Input id="company" value={form.company} onChange={(event) => updateField("company", event.target.value)} />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="phone">Phone</Label>
                        <Input id="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="+234 706 107 2929" value={form.phone} onChange={(event) => updateField("phone", event.target.value)} required />
                      </div>
                      {role === "driver" && (
                        <div className="grid gap-2">
                          <Label htmlFor="vehicleType">Transportation type</Label>
                          <select
                            id="vehicleType"
                            value={form.vehicleType}
                            onChange={(event) => updateField("vehicleType", event.target.value)}
                            className="h-11 rounded-md border bg-background/70 px-3 text-sm"
                            required
                          >
                            {driverTransportationOptions.map((option) => (
                              <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                          </select>
                        </div>
                      )}
                    </>
                  )}
                  <div className="grid gap-2">
                    <Label htmlFor="email">Email</Label>
                    <Input id="email" type="email" value={form.email} onChange={(event) => updateField("email", event.target.value)} required />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="password">Password</Label>
                    <div className="relative">
                      <Input
                        id="password"
                        type={showPassword ? "text" : "password"}
                        value={form.password}
                        onChange={(event) => updateField("password", event.target.value)}
                        required
                        minLength={isRegister ? strongPasswordMinimumLength : 1}
                        className="pr-11"
                      />
                      <button
                        type="button"
                        aria-label={showPassword ? "Hide password" : "Show password"}
                        className="absolute right-2 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-md text-muted-foreground transition hover:bg-primary/10 hover:text-primary"
                        onClick={() => setShowPassword((current) => !current)}
                      >
                        {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                      </button>
                    </div>
                  </div>
                  {isRegister && <p className="text-xs leading-5 text-muted-foreground">Use at least 10 characters with uppercase, lowercase, and a number. Confirm the account email before first sign-in.</p>}
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? <Loader2 className="animate-spin" /> : isRegister ? <UserPlus /> : <LockKeyhole />}
                    {isRegister ? `Create ${role} account` : copy.loginLabel}
                  </Button>
                </form>
              )}

              {message && (
                <div role="status" aria-live="polite" className="mt-4 flex gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-500">
                  <CheckCircle2 className="size-4" />
                  {message}
                </div>
              )}
              {error && (
                <div role="alert" aria-live="assertive" className="mt-4 flex gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                  <AlertTriangle className="size-4" />
                  {error}
                </div>
              )}

              <div className="mt-5 grid gap-2 text-center text-sm text-muted-foreground">
                {role === "customer" && !isRegister && <Link className="text-primary" href={"/customer/register" as NextRoute}>Create customer account</Link>}
                {role === "driver" && !isRegister && <Link className="text-primary" href={"/driver/register" as NextRoute}>Register as driver/rider</Link>}
                {role === "driver" && !isRegister && <Link className="text-primary" href={"/driver/forgot-password" as NextRoute}>Forgot password?</Link>}
                {isRegister && <Link className="text-primary" href={`/${role}/login` as NextRoute}>Back to {role} login</Link>}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}
