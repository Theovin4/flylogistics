"use client";

import { FormEvent, useMemo, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { AlertTriangle, Building2, CheckCircle2, Eye, EyeOff, Loader2, LockKeyhole, UserPlus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getSupabaseBrowser } from "@/lib/supabase";
import { strongPasswordIssue, strongPasswordMinimumLength } from "@/lib/account-security";

type CloudAuthMode = "login" | "signup";

type SignupResponse = {
  error?: string;
  redirectTo?: string;
};

const initialForm = {
  companyName: "",
  ownerName: "",
  email: "",
  password: "",
  phone: "",
  slug: ""
};

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

async function parseJson(response: Response) {
  const text = await response.text();
  return text ? (JSON.parse(text) as SignupResponse) : {};
}

export function CloudAuthForm({ mode }: { mode: CloudAuthMode }) {
  const [form, setForm] = useState(initialForm);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const isSignup = mode === "signup";

  const suggestedSlug = useMemo(() => slugify(form.companyName), [form.companyName]);

  function updateField<Key extends keyof typeof form>(field: Key, value: (typeof form)[Key]) {
    setForm((current) => ({
      ...current,
      [field]: value,
      ...(field === "companyName" && !current.slug ? { slug: slugify(value) } : {})
    }));
  }

  async function syncSession(accessToken: string, expiresIn?: number) {
    const response = await fetch("/api/auth/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accessToken, expiresIn })
    });
    if (!response.ok) throw new Error("Unable to create a secure cloud session.");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      const supabase = getSupabaseBrowser();
      if (!supabase) throw new Error("Secure cloud sign-in is temporarily unavailable.");

      if (isSignup) {
        const passwordIssue = strongPasswordIssue(form.password);
        if (passwordIssue) throw new Error(`Choose a stronger password. ${passwordIssue}`);
        const response = await fetch("/api/cloud/signup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...form, slug: form.slug || suggestedSlug })
        });
        const data = await parseJson(response);
        if (!response.ok) throw new Error(data.error ?? "Unable to create company workspace.");
        setMessage("Company workspace created. Opening Fly Logistics Cloud...");
      }

      await fetch("/api/auth/session", { method: "DELETE" }).catch(() => undefined);
      await supabase.auth.signOut().catch(() => undefined);
      const login = await supabase.auth.signInWithPassword({
        email: form.email.trim(),
        password: form.password
      });
      if (login.error || !login.data.session?.access_token) {
        throw new Error(login.error?.message ?? "Unable to sign in to Fly Logistics Cloud.");
      }
      await syncSession(login.data.session.access_token, login.data.session.expires_in);
      window.location.assign("/cloud/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cloud authentication failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-10 lg:grid-cols-[1fr_460px] lg:items-center">
      <section className="glass rounded-md border p-6 sm:p-8">
        <Badge className="border-primary/40 bg-primary/10 text-primary">Fly Logistics Cloud</Badge>
        <h1 className="mt-5 text-3xl font-black tracking-normal sm:text-5xl">
          {isSignup ? "Launch your logistics company workspace." : "Sign in to your logistics cloud workspace."}
        </h1>
        <p className="mt-4 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
          Fly Logistics Cloud gives logistics teams a secure operating system for shipments, drivers, quotes, tracking, payments, and customer visibility.
        </p>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {["Tenant-isolated operations", "Tracking-first customer experience", "Driver and dispatcher workflows", "White-label company basics"].map((item) => (
            <div key={item} className="rounded-md border bg-background/45 p-4 text-sm font-semibold">
              {item}
            </div>
          ))}
        </div>
      </section>

      <Card className="glass">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {isSignup ? <Building2 className="size-5 text-primary" /> : <LockKeyhole className="size-5 text-primary" />}
            {isSignup ? "Create company" : "Cloud login"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4" onSubmit={submit}>
            {isSignup && (
              <>
                <div className="grid gap-2">
                  <Label htmlFor="companyName">Company name</Label>
                  <Input id="companyName" value={form.companyName} onChange={(event) => updateField("companyName", event.target.value)} required />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="ownerName">Owner name</Label>
                  <Input id="ownerName" value={form.ownerName} onChange={(event) => updateField("ownerName", event.target.value)} required />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="phone">Phone</Label>
                  <Input id="phone" value={form.phone} onChange={(event) => updateField("phone", event.target.value)} required />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="slug">Company slug</Label>
                  <Input id="slug" value={form.slug || suggestedSlug} onChange={(event) => updateField("slug", slugify(event.target.value))} required />
                </div>
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
                  minLength={isSignup ? strongPasswordMinimumLength : 1}
                  required
                  className="pr-11"
                />
                <button
                  type="button"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute right-2 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-md text-muted-foreground hover:bg-primary/10 hover:text-primary"
                  onClick={() => setShowPassword((current) => !current)}
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </div>
            {isSignup && <p className="text-xs leading-5 text-muted-foreground">Use at least 10 characters with uppercase, lowercase, and a number.</p>}
            <Button type="submit" disabled={loading}>
              {loading ? <Loader2 className="animate-spin" /> : isSignup ? <UserPlus /> : <LockKeyhole />}
              {isSignup ? "Create cloud workspace" : "Open cloud workspace"}
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

          <div className="mt-5 text-center text-sm text-muted-foreground">
            {isSignup ? (
              <span>
                Already have a cloud workspace? <Link className="text-primary" href={"/cloud/login" as Route}>Sign in</Link>
              </span>
            ) : (
              <span>
                New logistics company? <Link className="text-primary" href={"/cloud/signup" as Route}>Create workspace</Link>
              </span>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
