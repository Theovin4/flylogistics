"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { AlertTriangle, Bell, CheckCircle2, Loader2, Save, UserCircle } from "lucide-react";
import { AccountPasswordPanel } from "@/components/auth/account-password-panel";
import { CustomerShell } from "@/components/customer/customer-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { getSupabaseBrowser } from "@/lib/supabase";

type CustomerProfile = {
  id: string;
  email: string | null;
  full_name: string | null;
  company: string | null;
  phone?: string | null;
  role: string;
  email_notifications_enabled?: boolean | null;
  whatsapp_notifications_enabled?: boolean | null;
  sms_notifications_enabled?: boolean | null;
};

const initialForm = {
  fullName: "",
  company: "",
  phone: "",
  emailNotificationsEnabled: true,
  whatsappNotificationsEnabled: true,
  smsNotificationsEnabled: true
};

function preferenceMode(form: typeof initialForm) {
  if (form.emailNotificationsEnabled && form.whatsappNotificationsEnabled) return "both";
  if (form.emailNotificationsEnabled) return "email_only";
  if (form.whatsappNotificationsEnabled) return "whatsapp_only";
  return "in_app_only";
}

export function CustomerProfile() {
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [form, setForm] = useState(initialForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
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

  useEffect(() => {
    let mounted = true;

    async function loadProfile() {
      setLoading(true);
      setError(null);

      try {
        const response = await authorizedFetch("/api/customer/profile");
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "Unable to load your profile.");
        if (!mounted) return;
        setProfile(data);
        setForm({
          fullName: data.full_name ?? "",
          company: data.company ?? "",
          phone: data.phone ?? "",
          emailNotificationsEnabled: data.email_notifications_enabled !== false,
          whatsappNotificationsEnabled: data.whatsapp_notifications_enabled !== false,
          smsNotificationsEnabled: data.sms_notifications_enabled !== false
        });
      } catch (err) {
        if (mounted) setError(err instanceof Error ? err.message : "Unable to load your profile.");
      } finally {
        if (mounted) setLoading(false);
      }
    }

    void loadProfile();
    return () => {
      mounted = false;
    };
  }, [authorizedFetch]);

  function updateField(field: keyof typeof form, value: string | boolean) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function updatePreferenceMode(value: string) {
    setForm((current) => ({
      ...current,
      emailNotificationsEnabled: value === "both" || value === "email_only",
      whatsappNotificationsEnabled: value === "both" || value === "whatsapp_only"
    }));
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const response = await authorizedFetch("/api/customer/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form)
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to update your profile.");
      setProfile(data);
      setMessage("Profile updated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update your profile.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <CustomerShell active="profile">
      <div className="grid gap-6">
        <div>
          <Badge className="border-primary/40 bg-primary/10 text-primary">Customer profile</Badge>
          <h1 className="mt-4 text-3xl font-black tracking-normal sm:text-5xl">Manage your logistics identity.</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
            Keep your customer profile accurate so Fly Logistics can match quotes, shipments, notifications, and delivery records to your account.
          </p>
        </div>

        {message && <div className="flex gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-500"><CheckCircle2 className="size-4" />{message}</div>}
        {error && <div className="flex gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"><AlertTriangle className="size-4" />{error}</div>}

        <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
          <Card className="glass">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UserCircle className="size-5 text-primary" />
                Profile details
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center gap-3 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin text-primary" />
                  Loading profile...
                </div>
              ) : (
                <form className="grid gap-4" onSubmit={saveProfile}>
                  <div className="grid gap-2">
                    <Label htmlFor="customerEmail">Email</Label>
                    <Input id="customerEmail" value={profile?.email ?? ""} readOnly className="font-mono text-sm" />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="grid gap-2">
                      <Label htmlFor="customerFullName">Full name</Label>
                      <Input id="customerFullName" value={form.fullName} onChange={(event) => updateField("fullName", event.target.value)} required />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="customerPhone">Phone</Label>
                      <Input id="customerPhone" value={form.phone} onChange={(event) => updateField("phone", event.target.value)} placeholder="+234 800 000 0000" />
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="customerCompany">Company</Label>
                    <Input id="customerCompany" value={form.company} onChange={(event) => updateField("company", event.target.value)} placeholder="Company or personal account" />
                  </div>
                  <div className="grid gap-3 rounded-md border bg-background/40 p-4">
                    <div className="flex items-center gap-2">
                      <Bell className="size-4 text-primary" />
                      <span className="font-semibold">Notification preferences</span>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="grid gap-2 rounded-md border bg-background/40 p-3 text-sm sm:col-span-2">
                        <span className="font-semibold">Primary communication preference</span>
                        <span className="text-xs text-muted-foreground">Choose how Fly Logistics should send quote, payment, shipment, and delivery updates. In-app alerts always remain available in your dashboard.</span>
                        <select
                          value={preferenceMode(form)}
                          onChange={(event) => updatePreferenceMode(event.target.value)}
                          className="h-10 rounded-md border bg-background/70 px-3 text-sm"
                        >
                          <option value="both">Email and WhatsApp</option>
                          <option value="email_only">Email only</option>
                          <option value="whatsapp_only">WhatsApp only</option>
                          <option value="in_app_only">In-app only</option>
                        </select>
                      </label>
                      <label className="flex items-center justify-between gap-4 rounded-md border bg-background/40 p-3 text-sm">
                        <span>
                          <span className="block font-semibold">Email updates</span>
                          <span className="text-xs text-muted-foreground">Branded receipts, quote updates, and delivery notices.</span>
                        </span>
                        <Switch
                          checked={form.emailNotificationsEnabled}
                          onCheckedChange={(checked) => updateField("emailNotificationsEnabled", checked)}
                          aria-label="Enable email notifications"
                        />
                      </label>
                      <label className="flex items-center justify-between gap-4 rounded-md border bg-background/40 p-3 text-sm">
                        <span>
                          <span className="block font-semibold">WhatsApp updates</span>
                          <span className="text-xs text-muted-foreground">Quotes, shipment movement, and delivery alerts.</span>
                        </span>
                        <Switch
                          checked={form.whatsappNotificationsEnabled}
                          onCheckedChange={(checked) => updateField("whatsappNotificationsEnabled", checked)}
                          aria-label="Enable WhatsApp notifications"
                        />
                      </label>
                      <label className="flex items-center justify-between gap-4 rounded-md border bg-background/40 p-3 text-sm">
                        <span>
                          <span className="block font-semibold">SMS fallback</span>
                          <span className="text-xs text-muted-foreground">Payment confirmations and critical delivery alerts.</span>
                        </span>
                        <Switch
                          checked={form.smsNotificationsEnabled}
                          onCheckedChange={(checked) => updateField("smsNotificationsEnabled", checked)}
                          aria-label="Enable SMS notifications"
                        />
                      </label>
                    </div>
                  </div>
                  <Button disabled={saving} className="w-full sm:w-fit">
                    {saving ? <Loader2 className="animate-spin" /> : <Save />}
                    Save profile
                  </Button>
                </form>
              )}
            </CardContent>
          </Card>

          <Card className="glass">
            <CardHeader>
              <CardTitle>Account status</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 text-sm">
              <div className="rounded-md border bg-background/40 p-3">
                <span className="block text-xs uppercase tracking-[0.18em] text-muted-foreground">Role</span>
                <Badge className="mt-2 border-primary/40 bg-primary/10 text-primary">{profile?.role ?? "customer"}</Badge>
              </div>
              <div className="rounded-md border bg-background/40 p-3">
                <span className="block text-xs uppercase tracking-[0.18em] text-muted-foreground">Matching rule</span>
                <p className="mt-2 text-muted-foreground">Quotes and shipments appear when the booking email matches this customer account.</p>
              </div>
            </CardContent>
          </Card>
        </div>
        <AccountPasswordPanel
          title="Customer account security"
          description="Change your customer portal password securely. Your shipment, wallet, and support records stay linked to the same email account."
          successTitle="Customer password updated"
          successDescription="Use your new customer password the next time you sign in."
        />
      </div>
    </CustomerShell>
  );
}
