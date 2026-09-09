"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import type { Route as NextRoute } from "next";
import { AlertTriangle, CheckCircle2, Eye, EyeOff, Loader2, LockKeyhole, Smartphone, Truck, Users } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getSupabaseBrowser } from "@/lib/supabase";

type DriverLoginResponse = {
  error?: string;
  accessToken?: string;
  refreshToken?: string;
  expiresIn?: number;
  role?: string;
  driverId?: number | string | null;
};

const initialForm = {
  userId: "",
  phone: ""
};

async function fetchJson(input: RequestInfo | URL, init: RequestInit, fallbackError: string) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(input, { ...init, signal: controller.signal });
    const text = await response.text();
    const data = text ? (JSON.parse(text) as DriverLoginResponse) : {};

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

type OperationsAccessRole = "driver" | "dispatcher";

const accessCopy: Record<OperationsAccessRole, {
  badge: string;
  title: string;
  description: string;
  cardTitle: string;
  idLabel: string;
  idPlaceholder: string;
  phoneLabel: string;
  endpoint: string;
  portal: "/driver" | "/dispatcher";
  icon: typeof Truck;
}> = {
  driver: {
    badge: "Driver and rider access",
    title: "Fast rider login for live delivery work.",
    description: "Riders sign in with the name or user ID saved by Fly Logistics operations and their phone number password. If they changed their password in the rider portal, they can use the new password here.",
    cardTitle: "Rider login",
    idLabel: "Name or user ID",
    idPlaceholder: "Driver B or 12",
    phoneLabel: "Phone number or password",
    endpoint: "/api/auth/driver-login",
    portal: "/driver",
    icon: Truck
  },
  dispatcher: {
    badge: "Dispatcher access",
    title: "Fast dispatcher login for operations control.",
    description: "Dispatchers sign in with the name or user ID saved by Fly Logistics admin and their phone number password. If they changed their password in the dispatcher portal, they can use the new password here.",
    cardTitle: "Dispatcher login",
    idLabel: "Dispatcher name or user ID",
    idPlaceholder: "Dispatcher name or profile ID",
    phoneLabel: "Phone number or password",
    endpoint: "/api/auth/dispatcher-login",
    portal: "/dispatcher",
    icon: Users
  }
};

function requestedNext(access: OperationsAccessRole) {
  const next = new URLSearchParams(window.location.search).get("next");
  if (access === "dispatcher" && (next?.startsWith("/dispatcher") || next?.startsWith("/dashboard/dispatcher"))) return next;
  if (access === "driver" && (next?.startsWith("/driver") || next?.startsWith("/dashboard/driver"))) return next;
  return accessCopy[access].portal;
}

export function DriverQuickLoginForm({ access = "driver" }: { access?: OperationsAccessRole }) {
  const [form, setForm] = useState(initialForm);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showPhonePassword, setShowPhonePassword] = useState(false);
  const copy = accessCopy[access];
  const Icon = copy.icon;

  function updateField(field: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function clearServerSession() {
    await fetch("/api/auth/session", { method: "DELETE" });
  }

  async function syncServerSession(accessToken: string, expiresIn?: number) {
    await fetchJson(
      "/api/auth/session",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessToken, expiresIn })
      },
      "Unable to create a secure driver session."
    );
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    let navigating = false;
    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      const supabase = getSupabaseBrowser();
      if (!supabase) throw new Error(`Secure ${access} sign-in is temporarily unavailable.`);

      await clearServerSession().catch(() => undefined);
      await supabase.auth.signOut().catch(() => undefined);
      window.localStorage.removeItem("fly_role");
      window.sessionStorage.removeItem("fly_role");

      const login = await fetchJson(
        copy.endpoint,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId: form.userId.trim(),
            phone: form.phone.trim()
          })
        },
        `Unable to sign in as ${access}.`
      );

      if (!login.accessToken || !login.refreshToken) throw new Error("No secure driver session was returned.");

      const { error: sessionError } = await supabase.auth.setSession({
        access_token: login.accessToken,
        refresh_token: login.refreshToken
      });
      if (sessionError) throw new Error(`Unable to persist driver session: ${sessionError.message}`);

      await syncServerSession(login.accessToken, login.expiresIn);

      const target = requestedNext(access);
      setMessage(`Signed in. Opening ${access} operations...`);
      window.location.assign(target);
      navigating = true;
      window.setTimeout(() => {
        setError(`You are signed in, but the redirect did not complete. Open ${target} from your browser.`);
        setLoading(false);
      }, 8000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Driver authentication failed.");
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
            <Badge className="border-primary/40 bg-primary/10 text-primary">{copy.badge}</Badge>
            <h1 className="mt-5 text-3xl font-black tracking-normal sm:text-5xl">
              {copy.title}
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-muted-foreground">
              {copy.description}
            </p>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {[
                "Assigned shipments",
                "Live location updates",
                "Pickup and delivery status",
                "Proof of delivery upload"
              ].map((item) => (
                <div key={item} className="rounded-md border bg-background/40 p-3 text-sm font-medium">
                  {item}
                </div>
              ))}
            </div>
            <div className="mt-5 rounded-md border border-primary/30 bg-primary/10 p-4 text-sm leading-6 text-muted-foreground">
              Example: enter your saved name or user ID. Your phone number works as your initial password unless you have changed it inside the portal.
            </div>
          </section>

          <Card className="glass">
            <CardHeader className="p-5 sm:p-6">
              <CardTitle className="flex items-center gap-2 text-xl sm:text-2xl">
                <Icon className="size-5 text-primary" />
                {copy.cardTitle}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-5 pt-0 sm:p-6 sm:pt-0">
              <form className="grid gap-4" onSubmit={submit}>
                <div className="grid gap-2">
                  <Label htmlFor="driverUserId">{copy.idLabel}</Label>
                  <Input
                    id="driverUserId"
                    autoComplete="username"
                    value={form.userId}
                    onChange={(event) => updateField("userId", event.target.value)}
                    placeholder={copy.idPlaceholder}
                    required
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="driverPhone">{copy.phoneLabel}</Label>
                  <div className="relative">
                    <Input
                      id="driverPhone"
                      type={showPhonePassword ? "text" : "password"}
                      inputMode="tel"
                      autoComplete="current-password"
                      value={form.phone}
                      onChange={(event) => updateField("phone", event.target.value)}
                      placeholder="+234..."
                      required
                      className="pr-11"
                    />
                    <button
                      type="button"
                      aria-label={showPhonePassword ? "Hide phone password" : "Show phone password"}
                      className="absolute right-2 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-md text-muted-foreground transition hover:bg-primary/10 hover:text-primary"
                      onClick={() => setShowPhonePassword((current) => !current)}
                    >
                      {showPhonePassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  </div>
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? <Loader2 className="animate-spin" /> : <LockKeyhole />}
                  Continue to {access} portal
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
                {access === "driver" && (
                  <Link className="inline-flex items-center justify-center gap-2 text-primary" href={"/driver/register" as NextRoute}>
                    <Smartphone className="size-4" />
                    Register as driver/rider
                  </Link>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}
