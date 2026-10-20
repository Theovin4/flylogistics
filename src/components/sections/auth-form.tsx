"use client";

import { FormEvent, useState } from "react";
import type { Route as NextRoute } from "next";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Eye, EyeOff, Loader2 } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { canonicalSiteUrl } from "@/lib/site";
import { getSupabaseBrowser } from "@/lib/supabase";
import { canAccessRole, dashboardForRole, normalizeRole, type FlyRole } from "@/lib/roles";

type AuthMode = "login" | "register" | "forgot" | "otp";

const titles = {
  login: "Welcome back",
  register: "Create your logistics command center",
  forgot: "Reset your password",
  otp: "Verify secure access"
};

const initialForm = {
  fullName: "",
  company: "",
  email: "",
  password: "",
  role: "customer" as FlyRole,
  otp: ""
};

type JsonResponse = {
  error?: string;
  role?: unknown;
  accessToken?: string;
  refreshToken?: string;
  expiresIn?: number;
};

async function fetchJson(input: RequestInfo | URL, init: RequestInit, fallbackError: string) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(input, { ...init, signal: controller.signal });
    const text = await response.text();
    const data = text ? (JSON.parse(text) as JsonResponse) : {};

    if (!response.ok) {
      const detail = data.error ? ` ${data.error}` : "";
      throw new Error(`${fallbackError}${detail} (${response.status}).`);
    }

    return data;
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error(`${fallbackError} The request timed out. Please try again.`);
    }
    if (err instanceof SyntaxError) {
      throw new Error(`${fallbackError} The server returned an unreadable response.`);
    }
    throw err;
  } finally {
    window.clearTimeout(timeout);
  }
}

export function AuthForm({ mode }: { mode: AuthMode }) {
  const [form, setForm] = useState(initialForm);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  function updateField<Key extends keyof typeof form>(field: Key, value: (typeof form)[Key]) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function loadProfile(accessToken: string) {
    const data = await fetchJson(
      "/api/auth/profile",
      { headers: { Authorization: `Bearer ${accessToken}` } },
      "Unable to verify your Fly Logistics role."
    );
    return normalizeRole(data.role);
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

  async function clearServerSession() {
    await fetch("/api/auth/session", { method: "DELETE" });
  }

  function requestedRedirectTarget() {
    const next = new URLSearchParams(window.location.search).get("next");
    return next && (next.startsWith("/dashboard") || next.startsWith("/customer")) ? next : null;
  }

  function redirectTargetForRole(role: FlyRole) {
    const next = requestedRedirectTarget();

    if (role === "admin") return "/admin/dashboard";
    if (role === "customer") return "/customer";

    if (next?.startsWith(dashboardForRole(role))) return next;
    if (next?.startsWith("/customer") && canAccessRole(role, ["customer"])) return next;

    return dashboardForRole(role);
  }

  async function finishSignIn(accessToken: string, expiresIn?: number) {
    const role = await loadProfile(accessToken);
    let target: string;

    try {
      target = redirectTargetForRole(role);
    } catch (error) {
      const supabase = getSupabaseBrowser();
      await supabase?.auth.signOut();
      await clearServerSession();
      throw error;
    }

    const serverRole = await syncServerSession(accessToken, expiresIn);
    if (serverRole && serverRole !== role) {
      throw new Error(`Your account role changed during sign-in. Please sign in again.`);
    }
    setMessage(role === "customer" ? "Signed in. Opening your customer portal..." : "Signed in. Opening your dashboard...");
    return target;
  }

  function navigateAfterAuth(target: string) {
    window.location.assign(target);
    window.setTimeout(() => {
      setError("You are signed in, but the redirect did not complete. Please open your dashboard from the navigation.");
      setLoading(false);
    }, 8000);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    let navigating = false;
    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      const supabase = getSupabaseBrowser();
      if (!supabase) throw new Error("Secure sign-in is temporarily unavailable.");

      if (mode === "login") {
        await clearServerSession().catch(() => undefined);
        await supabase.auth.signOut().catch(() => undefined);
        window.localStorage.removeItem("fly_role");
        window.sessionStorage.removeItem("fly_role");

        const login = await fetchJson(
          "/api/auth/login",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: form.email.trim(), password: form.password })
          },
          "Unable to sign in."
        );
        if (!login.accessToken || !login.refreshToken) {
          throw new Error("No secure session was returned.");
        }
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: login.accessToken,
          refresh_token: login.refreshToken
        });
        if (sessionError) throw new Error(`Unable to persist browser session: ${sessionError.message}`);

        const target = await finishSignIn(login.accessToken, login.expiresIn);
        navigating = true;
        navigateAfterAuth(target);
        return;
      }

      if (mode === "register") {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: form.email.trim(),
          password: form.password,
          options: {
            emailRedirectTo: `${canonicalSiteUrl}/login`,
            data: {
              full_name: form.fullName,
              company: form.company,
              role: form.role
            }
          }
        });
        if (signUpError) throw signUpError;
        if (data.session?.access_token) {
          const target = await finishSignIn(data.session.access_token, data.session.expires_in);
          navigating = true;
          navigateAfterAuth(target);
          return;
        }
        setMessage("Account created. Check your email to confirm access, then sign in.");
        return;
      }

      if (mode === "forgot") {
        const redirectTo = `${canonicalSiteUrl}/login`;
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(form.email.trim(), { redirectTo });
        if (resetError) throw resetError;
        setMessage("Password reset instructions sent.");
        return;
      }

      const { data, error: otpError } = await supabase.auth.verifyOtp({
        email: form.email.trim(),
        token: form.otp,
        type: "email"
      });
      if (otpError) throw otpError;
      if (!data.session?.access_token) throw new Error("No secure session was returned.");
      const target = await finishSignIn(data.session.access_token, data.session.expires_in);
      navigating = true;
      navigateAfterAuth(target);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed.");
    } finally {
      if (!navigating) setLoading(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center px-4 py-6 sm:py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex justify-center sm:mb-8">
          <Logo />
        </div>
        <Card className="glass">
          <CardHeader className="p-5 sm:p-6">
            <CardTitle className="text-xl sm:text-2xl">{titles[mode]}</CardTitle>
          </CardHeader>
          <CardContent className="p-5 pt-0 sm:p-6 sm:pt-0">
            <form className="grid gap-4" onSubmit={handleSubmit}>
              {mode === "register" && (
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
                    <Label htmlFor="role">Workspace role</Label>
                    <select
                      id="role"
                      value={form.role}
                      onChange={(event) => updateField("role", normalizeRole(event.target.value))}
                      className="h-11 rounded-md border bg-background/70 px-3 text-sm"
                    >
                      <option value="customer">Customer</option>
                      <option value="driver">Driver/Rider</option>
                    </select>
                  </div>
                </>
              )}

              {(mode === "login" || mode === "register" || mode === "forgot" || mode === "otp") && (
                <div className="grid gap-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" value={form.email} onChange={(event) => updateField("email", event.target.value)} required />
                </div>
              )}

              {(mode === "login" || mode === "register") && (
                <div className="grid gap-2">
                  <Label htmlFor="password">Password</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      value={form.password}
                      onChange={(event) => updateField("password", event.target.value)}
                      required
                      minLength={mode === "register" ? 8 : 1}
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
              )}

              {mode === "otp" && (
                <div className="grid gap-2">
                  <Label htmlFor="otp">One-time passcode</Label>
                  <Input id="otp" value={form.otp} onChange={(event) => updateField("otp", event.target.value)} required />
                </div>
              )}

              <Button type="submit" className="mt-2 w-full" disabled={loading}>
                {loading ? <Loader2 className="animate-spin" /> : null}
                {mode === "register" ? "Create account" : "Continue"}
              </Button>
            </form>

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

            <div className="mt-5 flex flex-wrap justify-center gap-3 text-sm text-muted-foreground">
              {mode === "login" ? (
                <>
                  <span>No account? <Link className="text-primary" href={"/register" as NextRoute}>Register</Link></span>
                  <Link className="text-primary" href="/auth/forgot-password">Forgot password?</Link>
                </>
              ) : (
                <Link className="text-primary" href={"/login" as NextRoute}>Back to login</Link>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
