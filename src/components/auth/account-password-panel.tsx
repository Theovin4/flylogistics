"use client";

import { FormEvent, useState } from "react";
import { Eye, EyeOff, KeyRound, Loader2, ShieldCheck } from "lucide-react";
import { flyError, flySuccess } from "@/components/feedback/fly-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getSupabaseBrowser } from "@/lib/supabase";

type AccountPasswordPanelProps = {
  title?: string;
  description?: string;
  successTitle?: string;
  successDescription?: string;
  className?: string;
};

function passwordStrengthError(password: string) {
  if (password.length < 12) return "Use at least 12 characters for your new password.";

  const checks = [
    /[a-z]/.test(password),
    /[A-Z]/.test(password),
    /\d/.test(password),
    /[^A-Za-z0-9]/.test(password)
  ];

  if (checks.filter(Boolean).length < 3) {
    return "Use a stronger password with at least three of these: uppercase letters, lowercase letters, numbers, and symbols.";
  }

  return null;
}

export function AccountPasswordPanel({
  title = "Account security",
  description = "Change your signed-in account password securely. Fly Logistics verifies your current password first.",
  successTitle = "Password updated",
  successDescription = "Use your new password the next time you sign in.",
  className
}: AccountPasswordPanelProps) {
  const [form, setForm] = useState({ currentPassword: "", password: "", confirmPassword: "" });
  const [visible, setVisible] = useState({ current: false, next: false, confirm: false });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    setError(null);

    try {
      if (!form.currentPassword) throw new Error("Enter your current password first.");
      const strengthError = passwordStrengthError(form.password);
      if (strengthError) throw new Error(strengthError);
      if (form.password !== form.confirmPassword) throw new Error("The password confirmation does not match.");
      if (form.currentPassword === form.password) throw new Error("Choose a new password that is different from your current password.");

      const supabase = getSupabaseBrowser();
      if (!supabase) throw new Error("Secure account session is not available.");

      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData.user?.email) throw new Error("Unable to verify your signed-in account.");

      const { error: verifyError } = await supabase.auth.signInWithPassword({
        email: userData.user.email,
        password: form.currentPassword
      });
      if (verifyError) throw new Error("Your current password is incorrect.");

      const { error: updateError } = await supabase.auth.updateUser({ password: form.password });
      if (updateError) throw updateError;

      setForm({ currentPassword: "", password: "", confirmPassword: "" });
      setMessage(successTitle);
      flySuccess(successTitle, successDescription);
    } catch (err) {
      const nextError = err instanceof Error ? err.message : "Unable to update password.";
      setError(nextError);
      flyError("Unable to update password", nextError);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className={className ?? "glass"}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="size-5 text-primary" />
          {title}
        </CardTitle>
        <p className="text-sm text-muted-foreground">{description}</p>
      </CardHeader>
      <CardContent className="grid gap-4">
        {message && <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-500">{message}</div>}
        {error && <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
        <form className="grid gap-3" onSubmit={changePassword}>
          <div className="grid gap-2">
            <Label htmlFor="accountCurrentPassword">Current password</Label>
            <div className="relative">
              <Input
                id="accountCurrentPassword"
                type={visible.current ? "text" : "password"}
                autoComplete="current-password"
                value={form.currentPassword}
                onChange={(event) => setForm((current) => ({ ...current, currentPassword: event.target.value }))}
                required
                className="pr-11"
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => setVisible((current) => ({ ...current, current: !current.current }))}
                aria-label={visible.current ? "Hide current password" : "Show current password"}
              >
                {visible.current ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="accountNewPassword">New password</Label>
            <div className="relative">
              <Input
                id="accountNewPassword"
                type={visible.next ? "text" : "password"}
                autoComplete="new-password"
                value={form.password}
                onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
                required
                minLength={12}
                className="pr-11"
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => setVisible((current) => ({ ...current, next: !current.next }))}
                aria-label={visible.next ? "Hide new password" : "Show new password"}
              >
                {visible.next ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="accountConfirmPassword">Confirm password</Label>
            <div className="relative">
              <Input
                id="accountConfirmPassword"
                type={visible.confirm ? "text" : "password"}
                autoComplete="new-password"
                value={form.confirmPassword}
                onChange={(event) => setForm((current) => ({ ...current, confirmPassword: event.target.value }))}
                required
                minLength={12}
                className="pr-11"
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => setVisible((current) => ({ ...current, confirm: !current.confirm }))}
                aria-label={visible.confirm ? "Hide confirm password" : "Show confirm password"}
              >
                {visible.confirm ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </div>
          <p className="text-xs leading-5 text-muted-foreground">
            Recommended: 16+ characters, unique to Fly Logistics, saved in a password manager.
          </p>
          <Button disabled={saving}>
            {saving ? <Loader2 className="animate-spin" /> : <ShieldCheck />}
            Change password
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
