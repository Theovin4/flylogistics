"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import type { Route as NextRoute } from "next";
import { AlertTriangle, CheckCircle2, Eye, EyeOff, Loader2, LockKeyhole, PackageCheck, UserPlus } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getSupabaseBrowser } from "@/lib/supabase";
import { normalizeRole } from "@/lib/roles";
import { canonicalSiteUrl } from "@/lib/site";
import { isReasonablePhone, strongPasswordIssue, strongPasswordMinimumLength } from "@/lib/account-security";

type CustomerAuthMode = "login" | "signup";

type JsonResponse = {
  error?: string;
  role?: unknown;
  accessToken?: string;
  refreshToken?: string;
  expiresIn?: number;
};

const initialForm = {
  fullName: "",
  company: "",
  email: "",
  password: "",
  phone: ""
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

export function CustomerAuthForm({ mode }: { mode: CustomerAuthMode }) {
  const [form, setForm] = useState(initialForm);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const email = params.get("email");
    const request = params.get("requestId");
    if (email) setForm((current) => ({ ...current, email }));
    if (mode === "signup" && request) setRequestId(request);
    if (mode === "login" && request) {
      params.delete("requestId");
      const nextUrl = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ""}${window.location.hash}`;
      window.history.replaceState(null, "", nextUrl);
    }
  }, [mode]);

  function updateField<Key extends keyof typeof form>(field: Key, value: (typeof form)[Key]) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function nextTarget() {
    const next = new URLSearchParams(window.location.search).get("next");
    return next?.startsWith("/customer") ? next : "/customer";
  }

  async function syncCustomerSession(accessToken: string, expiresIn?: number) {
    const profile = await fetchJson(
      "/api/auth/profile",
      { headers: { Authorization: `Bearer ${accessToken}` } },
      "Unable to verify your customer account."
    );
    const role = normalizeRole(profile.role);

    if (role !== "customer") {
      const supabase = getSupabaseBrowser();
      await supabase?.auth.signOut();
      await fetch("/api/auth/session", { method: "DELETE" });
      throw new Error("This sign-in is for customer accounts. Admins should use the admin login.");
    }

    await fetchJson(
      "/api/auth/session",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessToken, expiresIn })
      },
      "Unable to create a secure customer session."
    );
  }

  function navigateToCustomer() {
    setMessage("Opening your customer portal...");
    window.location.assign(nextTarget());
    window.setTimeout(() => {
      setError("You are signed in, but the redirect did not complete. Open the customer portal from the navigation.");
      setLoading(false);
    }, 8000);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    let navigating = false;
    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      const supabase = getSupabaseBrowser();
      if (!supabase) throw new Error("Secure customer sign-in is temporarily unavailable.");

      if (mode === "signup") {
        const passwordIssue = strongPasswordIssue(form.password);
        if (passwordIssue) throw new Error(`Choose a stronger password. ${passwordIssue}`);
        if (!isReasonablePhone(form.phone)) throw new Error("Enter a valid phone number with country code, for example +234 706 107 2929.");
      }

      if (mode === "login") {
        await fetch("/api/auth/session", { method: "DELETE" }).catch(() => undefined);
        await supabase.auth.signOut().catch(() => undefined);
        window.localStorage.removeItem("fly_role");
        window.sessionStorage.removeItem("fly_role");

        const login = await fetchJson(
          "/api/auth/login",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: form.email.trim(), password: form.password, expectedRole: "customer" })
          },
          "Unable to sign in as customer."
        );

        if (!login.accessToken || !login.refreshToken) throw new Error("No secure customer session was returned.");
        if (login.role && normalizeRole(login.role) !== "customer") {
          throw new Error(`This sign-in is for customer accounts. Your account is ${normalizeRole(login.role)}.`);
        }

        const { error: sessionError } = await supabase.auth.setSession({
          access_token: login.accessToken,
          refresh_token: login.refreshToken
        });
        if (sessionError) throw new Error(`Unable to persist customer session: ${sessionError.message}`);

        await syncCustomerSession(login.accessToken, login.expiresIn);
        navigating = true;
        navigateToCustomer();
        return;
      }

      const { data, error: signUpError } = await supabase.auth.signUp({
        email: form.email.trim(),
        password: form.password,
        options: {
          emailRedirectTo: `${canonicalSiteUrl}/customer`,
          data: {
            full_name: form.fullName,
            company: form.company,
            phone: form.phone,
            role: "customer"
          }
        }
      });

      if (signUpError) throw new Error(`Customer signup failed: ${signUpError.message}`);

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
                role: "customer"
              })
            },
            "Your customer account was created, but profile setup needs attention."
          );
        } catch (profileError) {
          console.warn("Customer profile setup will be retried during session verification.", profileError);
        }
      }

      if (data.session?.access_token) {
        await syncCustomerSession(data.session.access_token, data.session.expires_in);
        navigating = true;
        navigateToCustomer();
        return;
      }

      setMessage("Account created. Check your email to confirm access, then sign in to open your customer portal.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Customer authentication failed.";
      setError(
        message.includes("Invalid email or password")
          ? "The email or password does not match this customer account. Use Forgot password to create a fresh password securely."
          : message
      );
    } finally {
      if (!navigating) setLoading(false);
    }
  }

  const isSignup = mode === "signup";
  const showQuoteLinkContext = isSignup && Boolean(requestId);

  return (
    <main className="grid min-h-screen place-items-center px-4 py-6 sm:py-10">
      <div className="w-full max-w-5xl">
        <div className="mb-6 flex justify-center">
          <Logo />
        </div>
        <div className="grid gap-5 lg:grid-cols-[1fr_440px] lg:items-stretch">
          <section className="glass rounded-md border p-5 sm:p-8">
            <Badge className="border-primary/40 bg-primary/10 text-primary">Customer account</Badge>
            <h1 className="mt-5 text-3xl font-black tracking-normal sm:text-5xl">
              {isSignup ? "Create your account." : "Welcome back."}
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-muted-foreground">
              {isSignup ? "Book and track shipments from one account." : "Sign in to manage your shipments."}
            </p>
            {showQuoteLinkContext && (
              <div className="mt-5 rounded-md border border-primary/30 bg-primary/10 p-4 text-sm">
                <div className="flex items-center gap-2 font-semibold text-primary">
                  <PackageCheck className="size-4" />
                  Quote request linked
                </div>
                <p className="mt-2 text-muted-foreground">
                  We will connect request <span className="font-mono text-foreground">{requestId}</span> to shipments and payments that use this email.
                </p>
              </div>
            )}
          </section>

          <Card className="glass">
            <CardHeader className="p-5 sm:p-6">
              <CardTitle className="flex items-center gap-2 text-xl sm:text-2xl">
                {isSignup ? <UserPlus className="size-5 text-primary" /> : <LockKeyhole className="size-5 text-primary" />}
                {isSignup ? "Create account" : "Customer login"}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-5 pt-0 sm:p-6 sm:pt-0">
              <form className="grid gap-4" onSubmit={submit}>
                {isSignup && (
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
                  </>
                )}
                <div className="grid gap-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" inputMode="email" autoComplete="email" enterKeyHint="next" value={form.email} onChange={(event) => updateField("email", event.target.value)} required />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="password">Password</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      autoComplete={isSignup ? "new-password" : "current-password"}
                      enterKeyHint="go"
                      value={form.password}
                      onChange={(event) => updateField("password", event.target.value)}
                      required
                      minLength={isSignup ? strongPasswordMinimumLength : 1}
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
                {isSignup && <p className="text-xs leading-5 text-muted-foreground">Use at least 10 characters with uppercase, lowercase, and a number. Confirm your email before first sign-in.</p>}
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? <Loader2 className="animate-spin" /> : isSignup ? <UserPlus /> : <LockKeyhole />}
                  {isSignup ? "Create customer account" : "Continue as customer"}
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

              <div className="mt-5 grid gap-2 text-center text-sm text-muted-foreground">
                {isSignup ? (
                  <span>
                    Already have an account? <Link className="text-primary" href="/customer/login">Customer login</Link>
                  </span>
                ) : (
                  <>
                    <span>
                      New customer? <Link className="text-primary" href={"/customer/register" as NextRoute}>Create account</Link>
                    </span>
                    <Link className="text-primary" href={"/customer/forgot-password" as NextRoute}>Forgot password?</Link>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}
