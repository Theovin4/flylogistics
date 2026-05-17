"use client";

import { FormEvent, useState } from "react";
import type { Route as NextRoute } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getSupabaseBrowser } from "@/lib/supabase";
import { normalizeRole, type FlyRole } from "@/lib/roles";

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

export function AuthForm({ mode }: { mode: AuthMode }) {
  const router = useRouter();
  const [form, setForm] = useState(initialForm);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function updateField<Key extends keyof typeof form>(field: Key, value: (typeof form)[Key]) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function loadProfile(accessToken: string) {
    const response = await fetch("/api/auth/profile", {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "Unable to load your role.");
    return normalizeRole(data.role);
  }

  async function syncServerSession(accessToken: string, expiresIn?: number) {
    const response = await fetch("/api/auth/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accessToken, expiresIn })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "Unable to create secure session.");
  }

  async function clearServerSession() {
    await fetch("/api/auth/session", { method: "DELETE" });
  }

  function adminRedirectTarget() {
    const next = new URLSearchParams(window.location.search).get("next");
    return next?.startsWith("/dashboard") ? next : "/dashboard/admin";
  }

  async function finishAdminSignIn(accessToken: string, expiresIn?: number) {
    const role = await loadProfile(accessToken);
    if (role !== "admin") {
      const supabase = getSupabaseBrowser();
      await supabase?.auth.signOut();
      await clearServerSession();
      throw new Error("Admin access is required for Fly Logistics dashboards.");
    }

    await syncServerSession(accessToken, expiresIn);
    router.push(adminRedirectTarget() as NextRoute);
    router.refresh();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      const supabase = getSupabaseBrowser();
      if (!supabase) throw new Error("Supabase Auth is not configured.");

      if (mode === "login") {
        const { data, error: signInError } = await supabase.auth.signInWithPassword({
          email: form.email,
          password: form.password
        });
        if (signInError) throw signInError;
        if (!data.session?.access_token) throw new Error("No Supabase session was returned.");
        await finishAdminSignIn(data.session.access_token, data.session.expires_in);
        return;
      }

      if (mode === "register") {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: form.email,
          password: form.password,
          options: {
            data: {
              full_name: form.fullName,
              company: form.company,
              role: form.role
            }
          }
        });
        if (signUpError) throw signUpError;
        if (data.session?.access_token) {
          await finishAdminSignIn(data.session.access_token, data.session.expires_in);
          return;
        }
        setMessage("Account created. Check your email to confirm access, then sign in.");
        return;
      }

      if (mode === "forgot") {
        const redirectTo = `${window.location.origin}/login`;
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(form.email, { redirectTo });
        if (resetError) throw resetError;
        setMessage("Password reset instructions sent.");
        return;
      }

      const { data, error: otpError } = await supabase.auth.verifyOtp({
        email: form.email,
        token: form.otp,
        type: "email"
      });
      if (otpError) throw otpError;
      if (!data.session?.access_token) throw new Error("No Supabase session was returned.");
      await finishAdminSignIn(data.session.access_token, data.session.expires_in);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center">
          <Logo />
        </div>
        <Card className="glass">
          <CardHeader>
            <CardTitle>{titles[mode]}</CardTitle>
          </CardHeader>
          <CardContent>
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
                      <option value="driver">Driver</option>
                      <option value="dispatcher">Dispatcher</option>
                      <option value="admin">Admin</option>
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
                  <Input id="password" type="password" value={form.password} onChange={(event) => updateField("password", event.target.value)} required minLength={8} />
                </div>
              )}

              {mode === "otp" && (
                <div className="grid gap-2">
                  <Label htmlFor="otp">One-time passcode</Label>
                  <Input id="otp" value={form.otp} onChange={(event) => updateField("otp", event.target.value)} required />
                </div>
              )}

              <Button type="submit" className="mt-2" disabled={loading}>
                {loading ? <Loader2 className="animate-spin" /> : null}
                {mode === "register" ? "Create account" : "Continue"}
              </Button>
            </form>

            {message && (
              <div className="mt-4 flex gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-500">
                <CheckCircle2 className="size-4" />
                {message}
              </div>
            )}
            {error && (
              <div className="mt-4 flex gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                <AlertTriangle className="size-4" />
                {error}
              </div>
            )}

            <div className="mt-5 flex flex-wrap justify-center gap-3 text-sm text-muted-foreground">
              {mode === "login" ? (
                <>
                  <span>No account? <Link className="text-primary" href="/auth/register">Register</Link></span>
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
