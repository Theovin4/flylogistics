"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { Building2, Eye, EyeOff, Loader2, LockKeyhole } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isReasonablePhone, strongPasswordIssue } from "@/lib/account-security";
import { canonicalSiteUrl } from "@/lib/site";
import { getSupabaseBrowser } from "@/lib/supabase";

type MerchantAuthMode = "login" | "register";

type AuthResponse = {
  error?: string;
  accessToken?: string;
  refreshToken?: string;
  expiresIn?: number;
};

async function jsonRequest(input: RequestInfo | URL, init: RequestInit, fallback: string) {
  const response = await fetch(input, init);
  const text = await response.text();
  const data = text ? JSON.parse(text) as AuthResponse : {};
  if (!response.ok) throw new Error(data.error ?? fallback);
  return data;
}

function safeMerchantTarget() {
  const target = new URLSearchParams(window.location.search).get("next");
  return target && target.startsWith("/merchant/") && !target.startsWith("//") ? target : "/merchant/dashboard";
}

export function MerchantAuthForm({ mode }: { mode: MerchantAuthMode }) {
  const [form, setForm] = useState({ fullName: "", email: "", phone: "", password: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const isRegister = mode === "register";

  async function establishSession(accessToken: string, refreshToken: string, expiresIn?: number) {
    const supabase = getSupabaseBrowser();
    if (!supabase) throw new Error("Secure merchant sign-in is temporarily unavailable.");
    const stored = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
    if (stored.error) throw new Error(stored.error.message);
    await jsonRequest("/api/auth/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accessToken, expiresIn })
    }, "Unable to secure the merchant session.");
  }

  async function finishLogin(accessToken: string) {
    const access = await jsonRequest("/api/merchant/access", {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store"
    }, "Unable to verify merchant access.") as AuthResponse & { hasMerchantAccess?: boolean };
    window.location.assign(access.hasMerchantAccess ? safeMerchantTarget() : "/merchant/onboarding");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      const supabase = getSupabaseBrowser();
      if (!supabase) throw new Error("Secure merchant access is temporarily unavailable.");

      if (!isRegister) {
        await fetch("/api/auth/session", { method: "DELETE" }).catch(() => undefined);
        await supabase.auth.signOut().catch(() => undefined);
        const login = await jsonRequest("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: form.email.trim(), password: form.password, expectedRole: "customer" })
        }, "Unable to sign in to the merchant portal.");
        if (!login.accessToken || !login.refreshToken) throw new Error("No secure session was returned.");
        await establishSession(login.accessToken, login.refreshToken, login.expiresIn);
        await finishLogin(login.accessToken);
        return;
      }

      const passwordIssue = strongPasswordIssue(form.password);
      if (passwordIssue) throw new Error(`Choose a stronger password. ${passwordIssue}`);
      if (!isReasonablePhone(form.phone)) throw new Error("Enter a valid phone number with country code.");

      const created = await supabase.auth.signUp({
        email: form.email.trim(),
        password: form.password,
        options: {
          emailRedirectTo: `${canonicalSiteUrl}/merchant/onboarding`,
          data: { full_name: form.fullName, phone: form.phone, role: "customer", registration_intent: "merchant" }
        }
      });
      if (created.error) throw new Error(created.error.message);

      if (created.data.user?.id && created.data.session?.access_token) {
        await jsonRequest("/api/auth/register-profile", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${created.data.session.access_token}`
          },
          body: JSON.stringify({
            userId: created.data.user.id,
            email: form.email.trim(),
            fullName: form.fullName,
            phone: form.phone,
            company: null,
            role: "customer"
          })
        }, "The identity was created, but profile setup needs attention.");
      }

      if (created.data.session?.access_token && created.data.session.refresh_token) {
        await establishSession(created.data.session.access_token, created.data.session.refresh_token, created.data.session.expires_in);
        window.location.assign("/merchant/onboarding");
        return;
      }

      setMessage("Account created. Confirm your email, then return to Merchant Login to finish business onboarding.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Merchant authentication failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-background px-4 py-8 sm:py-14">
      <div className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <section className="rounded-md border bg-black p-6 text-white sm:p-8">
          <Logo className="mb-10" />
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-primary">Merchant Portal</p>
          <h1 className="mt-4 text-3xl font-black sm:text-5xl">Manage your business deliveries in one place.</h1>
          <p className="mt-5 max-w-xl text-sm leading-7 text-white/65">
            Built for retailers, online sellers, food businesses, and growing teams that ship regularly with Fly Logistics.
          </p>
          <div className="mt-8 grid gap-3 text-sm text-white/75">
            <p>Customer account: personal and occasional deliveries.</p>
            <p>Merchant account: recurring business fulfilment with team tools and business pricing.</p>
            <p>Fly Logistics Cloud: software for independent logistics companies.</p>
          </div>
        </section>

        <Card className="glass self-start">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-2xl">
              <Building2 className="size-6 text-primary" />
              {isRegister ? "Open a Merchant Account" : "Merchant Login"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form className="grid gap-4" onSubmit={submit}>
              {isRegister && (
                <>
                  <div className="grid gap-2">
                    <Label htmlFor="merchant-name">Your full name</Label>
                    <Input id="merchant-name" autoComplete="name" value={form.fullName} onChange={(event) => setForm((current) => ({ ...current, fullName: event.target.value }))} required />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="merchant-phone">Phone number</Label>
                    <Input id="merchant-phone" type="tel" inputMode="tel" autoComplete="tel" value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} required />
                  </div>
                </>
              )}
              <div className="grid gap-2">
                <Label htmlFor="merchant-email">Email</Label>
                <Input id="merchant-email" type="email" inputMode="email" autoComplete="email" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} required />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="merchant-password">Password</Label>
                <div className="relative">
                  <Input id="merchant-password" className="pr-12" type={showPassword ? "text" : "password"} autoComplete={isRegister ? "new-password" : "current-password"} value={form.password} onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))} required />
                  <button type="button" aria-label={showPassword ? "Hide password" : "Show password"} className="absolute inset-y-0 right-0 grid w-11 place-items-center text-muted-foreground" onClick={() => setShowPassword((current) => !current)}>
                    {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </div>
              {error && <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
              {message && <div role="status" className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-500">{message}</div>}
              <Button size="lg" disabled={loading}>
                {loading ? <Loader2 className="animate-spin" /> : <LockKeyhole />}
                {isRegister ? "Continue to business setup" : "Continue to merchant portal"}
              </Button>
              <div className="grid gap-2 text-center text-sm text-muted-foreground">
                <Link className="text-primary hover:underline" href={isRegister ? "/merchant/login" : "/merchant/register"}>{isRegister ? "Already have an account? Merchant login" : "New business? Open a Merchant Account"}</Link>
                {!isRegister && <Link className="text-primary hover:underline" href="/customer/forgot-password">Forgot password?</Link>}
                <span><Link className="hover:text-foreground" href="/customer/login">Customer login</Link> · <Link className="hover:text-foreground" href="/cloud/login">Cloud login</Link></span>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

