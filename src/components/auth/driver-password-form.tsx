"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import type { Route as NextRoute } from "next";
import { AlertTriangle, CheckCircle2, Eye, EyeOff, KeyRound, Loader2, LockKeyhole, Truck } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { canonicalSiteUrl } from "@/lib/site";
import { getSupabaseBrowser } from "@/lib/supabase";

type DriverPasswordMode = "request" | "update";

export function DriverPasswordForm({ mode }: { mode: DriverPasswordMode }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [ready, setReady] = useState(mode === "request");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  useEffect(() => {
    if (mode !== "update") return;

    let mounted = true;
    const supabase = getSupabaseBrowser();
    if (!supabase) {
      setError("Secure account recovery is temporarily unavailable.");
      setReady(false);
      return;
    }
    const client = supabase;

    const code = new URLSearchParams(window.location.search).get("code");

    async function prepareSession() {
      if (code) {
        const { error: exchangeError } = await client.auth.exchangeCodeForSession(code);
        if (exchangeError && mounted) {
          setError(`Password reset link could not be verified: ${exchangeError.message}`);
          setReady(false);
          return;
        }
      }

      const { data } = await client.auth.getSession();
      if (!mounted) return;
      setReady(Boolean(data.session));
      if (!data.session) setError("Open the password reset link from your email, then set a new driver password here.");
    }

    const { data: listener } = client.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setReady(true);
        setError(null);
      }
    });

    void prepareSession();
    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, [mode]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      const supabase = getSupabaseBrowser();
      if (!supabase) throw new Error("Secure account recovery is temporarily unavailable.");

      if (mode === "request") {
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: `${canonicalSiteUrl}/driver/reset-password`
        });
        if (resetError) throw new Error(resetError.message);
        setMessage("Password reset instructions sent. Check your email and open the secure reset link.");
        return;
      }

      if (password.length < 8) throw new Error("Use at least 8 characters for your new password.");
      if (password !== confirmPassword) throw new Error("The two passwords do not match.");

      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw new Error(updateError.message);

      await fetch("/api/auth/session", { method: "DELETE" }).catch(() => undefined);
      await supabase.auth.signOut().catch(() => undefined);
      setMessage("Password updated. You can now sign in with your new driver password.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update driver password.");
    } finally {
      setLoading(false);
    }
  }

  const isRequest = mode === "request";

  return (
    <main className="grid min-h-screen place-items-center px-4 py-6 sm:py-10">
      <div className="w-full max-w-4xl">
        <div className="mb-6 flex justify-center">
          <Logo />
        </div>
        <div className="grid gap-5 lg:grid-cols-[1fr_420px]">
          <section className="glass rounded-md border p-5 sm:p-8">
            <Badge className="border-primary/40 bg-primary/10 text-primary">Driver security</Badge>
            <h1 className="mt-5 text-3xl font-black tracking-normal sm:text-5xl">
              {isRequest ? "Reset your driver password." : "Set a new driver password."}
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-muted-foreground">
              Recover access to assignments, live location tools, ETA updates, and proof-of-delivery workflows without changing customer or admin access.
            </p>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {["Secure account recovery", "Driver-only return path", "Session cleared after update", "Mobile-ready access"].map((item) => (
                <div key={item} className="rounded-md border bg-background/40 p-3 text-sm font-medium">
                  {item}
                </div>
              ))}
            </div>
          </section>

          <Card className="glass">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {isRequest ? <KeyRound className="size-5 text-primary" /> : <LockKeyhole className="size-5 text-primary" />}
                {isRequest ? "Forgot password" : "New password"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form className="grid gap-4" onSubmit={submit}>
                {isRequest ? (
                  <div className="grid gap-2">
                    <Label htmlFor="driverResetEmail">Driver email</Label>
                    <Input id="driverResetEmail" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
                  </div>
                ) : (
                  <>
                    <div className="grid gap-2">
                      <Label htmlFor="driverNewPassword">New password</Label>
                      <div className="relative">
                        <Input id="driverNewPassword" type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} required minLength={8} disabled={!ready} className="pr-11" />
                        <button
                          type="button"
                          aria-label={showPassword ? "Hide password" : "Show password"}
                          className="absolute right-2 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-md text-muted-foreground transition hover:bg-primary/10 hover:text-primary disabled:pointer-events-none disabled:opacity-40"
                          onClick={() => setShowPassword((current) => !current)}
                          disabled={!ready}
                        >
                          {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                        </button>
                      </div>
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="driverConfirmPassword">Confirm password</Label>
                      <div className="relative">
                        <Input id="driverConfirmPassword" type={showConfirmPassword ? "text" : "password"} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required minLength={8} disabled={!ready} className="pr-11" />
                        <button
                          type="button"
                          aria-label={showConfirmPassword ? "Hide confirm password" : "Show confirm password"}
                          className="absolute right-2 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-md text-muted-foreground transition hover:bg-primary/10 hover:text-primary disabled:pointer-events-none disabled:opacity-40"
                          onClick={() => setShowConfirmPassword((current) => !current)}
                          disabled={!ready}
                        >
                          {showConfirmPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                        </button>
                      </div>
                    </div>
                  </>
                )}
                <Button type="submit" disabled={loading || (!isRequest && !ready)}>
                  {loading ? <Loader2 className="animate-spin" /> : isRequest ? <KeyRound /> : <LockKeyhole />}
                  {isRequest ? "Send reset link" : "Update password"}
                </Button>
              </form>

              {message && (
                <div role="status" className="mt-4 flex gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-500">
                  <CheckCircle2 className="size-4" />
                  {message}
                </div>
              )}
              {error && (
                <div role="alert" className="mt-4 flex gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                  <AlertTriangle className="size-4" />
                  {error}
                </div>
              )}

              <div className="mt-5 grid gap-2 text-center text-sm text-muted-foreground">
                <Link className="text-primary" href={"/driver/login" as NextRoute}>Back to driver login</Link>
                <Link className="inline-flex items-center justify-center gap-2 text-primary" href={"/driver/register" as NextRoute}>
                  <Truck className="size-4" />
                  Register as driver/rider
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}
