"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { AlertTriangle, BarChart3, Building2, CheckCircle2, ClipboardCheck, CreditCard, Download, Headphones, Loader2, Package, Settings, Truck, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AccountPasswordPanel } from "@/components/auth/account-password-panel";
import { AccountSupportCenter } from "@/components/support/account-support-center";
import { cloudBillingPlans, cloudLimitLabel, cloudTrialDaysRemaining, getCloudBillingPlanKey, type CloudBillingPlan } from "@/lib/cloud-plans";

type CloudSection = "overview" | "settings" | "drivers" | "shipments" | "customers" | "analytics" | "billing" | "support";

type CloudCompany = {
  id: string;
  name: string;
  slug: string;
  logo_url?: string | null;
  brand_color?: string | null;
  support_email?: string | null;
  support_phone?: string | null;
  plan?: string | null;
  status?: string | null;
  subscription_status?: string | null;
  subscription_plan?: string | null;
  trial_ends_at?: string | null;
  billing_email?: string | null;
  billing_currency?: string | null;
  billing_amount?: number | string | null;
  flutterwave_subscription_reference?: string | null;
  subscription_started_at?: string | null;
  subscription_renews_at?: string | null;
  last_billing_reference?: string | null;
  last_billing_status?: string | null;
};

type CloudOverview = {
  company?: CloudCompany | null;
  role?: string | null;
  metrics?: Record<string, number>;
  recentShipments?: Array<Record<string, unknown>>;
  recentQuotes?: Array<Record<string, unknown>>;
  members?: Array<Record<string, unknown>>;
  billingHistory?: Array<Record<string, unknown>>;
  billingAnalytics?: {
    monthlyRecurringRevenue?: number;
    activeSubscriptions?: number;
    churnRate?: number;
    revenueByPlan?: Record<string, number>;
  };
  warnings?: string[];
  error?: string;
};

const navItems: Array<{ label: string; href: Route; section: CloudSection; icon: typeof BarChart3 }> = [
  { label: "Dashboard", href: "/cloud/dashboard" as Route, section: "overview", icon: BarChart3 },
  { label: "Shipments", href: "/cloud/shipments" as Route, section: "shipments", icon: Package },
  { label: "Drivers", href: "/cloud/drivers" as Route, section: "drivers", icon: Truck },
  { label: "Customers", href: "/cloud/customers" as Route, section: "customers", icon: Users },
  { label: "Analytics", href: "/cloud/analytics" as Route, section: "analytics", icon: BarChart3 },
  { label: "Billing", href: "/cloud/billing" as Route, section: "billing", icon: CreditCard },
  { label: "Support", href: "/cloud/support" as Route, section: "support", icon: Headphones },
  { label: "Settings", href: "/cloud/settings" as Route, section: "settings", icon: Settings }
];

const metricLabels: Record<string, string> = {
  shipments: "Total shipments",
  activeShipments: "Active deliveries",
  deliveredShipments: "Delivered",
  quoteRequests: "Quote requests",
  drivers: "Drivers",
  customers: "Customers"
};

function textValue(value: unknown, fallback = "Not set") {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function money(value: unknown) {
  const amount = Number(value ?? 0);
  return `NGN ${Number.isFinite(amount) ? amount.toLocaleString("en-NG") : "0"}`;
}

function dateValue(value: unknown, fallback = "Not scheduled") {
  if (typeof value !== "string" || !value) return fallback;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleDateString() : fallback;
}

export function CloudDashboard({ section }: { section: CloudSection }) {
  const [overview, setOverview] = useState<CloudOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [billingPlan, setBillingPlan] = useState<CloudBillingPlan | null>(null);
  const [verifyingBilling, setVerifyingBilling] = useState(false);
  const [cancellingBilling, setCancellingBilling] = useState(false);
  const [verifiedBillingRef, setVerifiedBillingRef] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState({
    name: "",
    logoUrl: "",
    brandColor: "#ff7900",
    supportEmail: "",
    supportPhone: ""
  });

  async function loadOverview() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/cloud/overview", { cache: "no-store" });
      const data = (await response.json()) as CloudOverview;
      if (!response.ok) throw new Error(data.error ?? "Unable to load cloud workspace.");
      setOverview(data);
      setSettings({
        name: data.company?.name ?? "",
        logoUrl: data.company?.logo_url ?? "",
        brandColor: data.company?.brand_color ?? "#ff7900",
        supportEmail: data.company?.support_email ?? "",
        supportPhone: data.company?.support_phone ?? ""
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load cloud workspace.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadOverview();
  }, []);

  const metrics = useMemo(() => overview?.metrics ?? {}, [overview]);
  const company = overview?.company;
  const activeNav = navItems.find((item) => item.section === section) ?? navItems[0];
  const trialDays = cloudTrialDaysRemaining(company?.trial_ends_at);
  const planKey = getCloudBillingPlanKey(company?.subscription_plan ?? company?.plan);
  const currentPlan = cloudBillingPlans[planKey];
  const subscriptionStatus = company?.subscription_status ?? (trialDays > 0 ? "trialing" : "active");
  const onboardingItems = useMemo(
    () => [
      { label: "Brand your workspace", done: Boolean(company?.name && company?.support_email && company?.support_phone) },
      { label: "Create your first shipment", done: Number(metrics.shipments ?? 0) > 0 },
      { label: "Add or approve a driver", done: Number(metrics.drivers ?? 0) > 0 },
      { label: "Capture a customer or lead", done: Number(metrics.customers ?? 0) > 0 || Number(metrics.quoteRequests ?? 0) > 0 },
      { label: "Confirm billing plan", done: subscriptionStatus === "active" || subscriptionStatus === "trialing" }
    ],
    [company?.name, company?.support_email, company?.support_phone, metrics.customers, metrics.drivers, metrics.quoteRequests, metrics.shipments, subscriptionStatus]
  );

  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const response = await fetch("/api/cloud/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings)
      });
      const data = (await response.json()) as { company?: CloudCompany; error?: string };
      if (!response.ok) throw new Error(data.error ?? "Unable to update cloud settings.");
      setOverview((current) => ({ ...(current ?? {}), company: data.company ?? current?.company }));
      setMessage("Company settings saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update cloud settings.");
    } finally {
      setSaving(false);
    }
  }

  async function startBillingCheckout(plan: CloudBillingPlan) {
    setBillingPlan(plan);
    setMessage(null);
    setError(null);
    try {
      const response = await fetch("/api/cloud/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan })
      });
      const data = (await response.json()) as { checkoutUrl?: string; error?: string };
      if (!response.ok || !data.checkoutUrl) throw new Error(data.error ?? "Unable to prepare Cloud billing checkout.");
      window.location.assign(data.checkoutUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to prepare Cloud billing checkout.");
    } finally {
      setBillingPlan(null);
    }
  }

  async function cancelBilling() {
    if (!window.confirm("Cancel this Cloud subscription record? You can restart billing from this page anytime.")) return;
    setCancellingBilling(true);
    setMessage(null);
    setError(null);
    try {
      const response = await fetch("/api/cloud/billing/cancel", { method: "POST" });
      const data = (await response.json()) as { ok?: boolean; company?: CloudCompany; message?: string; error?: string };
      if (!response.ok || !data.ok) throw new Error(data.error ?? "Unable to cancel Cloud subscription.");
      setOverview((current) => ({ ...(current ?? {}), company: data.company ?? current?.company }));
      setMessage(data.message ?? "Cloud subscription cancellation was recorded.");
      void loadOverview();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to cancel Cloud subscription.");
    } finally {
      setCancellingBilling(false);
    }
  }

  async function verifyBilling(txRef: string, transactionId: string | null) {
    setVerifyingBilling(true);
    setMessage(null);
    setError(null);
    try {
      const response = await fetch("/api/cloud/billing/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ txRef, transactionId })
      });
      const data = (await response.json()) as { ok?: boolean; company?: CloudCompany; message?: string; error?: string };
      if (!response.ok || !data.ok) throw new Error(data.error ?? data.message ?? "Unable to verify Cloud subscription payment.");
      setOverview((current) => ({ ...(current ?? {}), company: data.company ?? current?.company }));
      setVerifiedBillingRef(txRef);
      setMessage(data.message ?? "Fly Logistics Cloud subscription is active.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to verify Cloud subscription payment.");
    } finally {
      setVerifyingBilling(false);
    }
  }

  useEffect(() => {
    if (section !== "billing") return;
    const searchParams = new URLSearchParams(window.location.search);
    const txRef = searchParams.get("tx_ref");
    const transactionId = searchParams.get("transaction_id");
    if (!txRef || verifiedBillingRef === txRef) return;
    void verifyBilling(txRef, transactionId);
  }, [section, verifiedBillingRef]);

  return (
    <main className="min-h-screen px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-[260px_1fr]">
        <aside className="glass rounded-md border p-4 lg:sticky lg:top-24 lg:self-start">
          <Link href={"/" as Route} className="text-xl font-black">
            Fly Logistics Cloud
          </Link>
          <p className="mt-2 text-sm text-muted-foreground">Multi-tenant logistics workspace</p>
          <nav className="mt-5 grid max-h-[60vh] gap-2 overflow-y-auto pr-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = item.section === activeNav.section;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold transition ${
                    active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground"
                  }`}
                >
                  <Icon className="size-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </aside>

        <section className="min-w-0">
          <div className="mb-5 flex flex-col gap-3 rounded-md border bg-card/70 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <Badge className="border-primary/40 bg-primary/10 text-primary">{overview?.role ?? "workspace"}</Badge>
              <Badge className="ml-2 border-emerald-500/30 bg-emerald-500/10 text-emerald-500">
                {subscriptionStatus === "trialing" ? `${trialDays} trial days left` : subscriptionStatus}
              </Badge>
              <h1 className="mt-2 text-2xl font-black sm:text-4xl">{company?.name ?? "Cloud workspace"}</h1>
              <p className="text-sm text-muted-foreground">
                {company?.slug ? `Workspace: ${company.slug} - ${currentPlan.name} plan` : "Secure company operations for shipments, teams, and tracking."}
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button asChild variant="outline">
                <Link href={"/cloud/billing" as Route}>Billing</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href={"/customer/login" as Route}>Customer portal</Link>
              </Button>
            </div>
          </div>

          {loading && (
            <div className="flex items-center gap-2 rounded-md border p-4 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Loading cloud workspace...
            </div>
          )}

          {error && (
            <div className="mb-4 flex gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
              <AlertTriangle className="size-4" />
              {error}
            </div>
          )}

          {message && (
            <div className="mb-4 flex gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-500">
              <CheckCircle2 className="size-4" />
              {message}
            </div>
          )}

          {!loading && section === "overview" && (
            <div className="grid gap-4">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {Object.entries(metricLabels).map(([key, label]) => (
                  <Card key={key} className="glass">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm text-muted-foreground">{label}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-3xl font-black">{metrics[key] ?? 0}</div>
                    </CardContent>
                  </Card>
                ))}
              </div>
              <Card className="glass">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <ClipboardCheck className="size-5 text-primary" />
                    Launch checklist
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
                  {onboardingItems.map((item) => (
                    <div key={item.label} className="flex items-center gap-2 rounded-md border bg-background/45 p-3 text-sm">
                      <CheckCircle2 className={`size-4 ${item.done ? "text-emerald-500" : "text-muted-foreground"}`} />
                      <span className={item.done ? "text-foreground" : "text-muted-foreground"}>{item.label}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
              <CloudList title="Latest shipments" rows={overview?.recentShipments ?? []} primaryKey="tracking_id" secondaryKey="status" />
              <CloudList title="Latest quote requests" rows={overview?.recentQuotes ?? []} primaryKey="request_id" secondaryKey="status" />
            </div>
          )}

          {!loading && section === "shipments" && (
            <CloudList title="Company shipments" rows={overview?.recentShipments ?? []} primaryKey="tracking_id" secondaryKey="status" />
          )}

          {!loading && section === "drivers" && (
            <CloudEmpty title="Driver operations" description="No drivers added yet." />
          )}

          {!loading && section === "customers" && (
            <CloudList title="Recent members" rows={overview?.members ?? []} primaryKey="user_id" secondaryKey="role" />
          )}

          {!loading && section === "analytics" && (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {Object.entries(metricLabels).map(([key, label]) => (
                <Card key={key} className="glass">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-muted-foreground">{label}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-black">{metrics[key] ?? 0}</div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {!loading && section === "billing" && (
            <div className="grid gap-4">
              {verifyingBilling && (
                <div className="flex items-center gap-2 rounded-md border p-4 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" />
                  Verifying Cloud subscription payment...
                </div>
              )}
              <Card className="glass">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CreditCard className="size-5 text-primary" />
                    Cloud billing
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4 md:grid-cols-4">
                  <BillingStat label="Current plan" value={currentPlan.name} />
                  <BillingStat label="Subscription" value={subscriptionStatus} />
                  <BillingStat label="Next billing" value={dateValue(company?.subscription_renews_at, subscriptionStatus === "trialing" ? `${trialDays} trial days left` : "Not scheduled")} />
                  <BillingStat label="Last billing" value={company?.last_billing_status ?? "Not started"} />
                </CardContent>
              </Card>
              <div className="grid gap-4 md:grid-cols-4">
                <BillingStat label="MRR" value={money(overview?.billingAnalytics?.monthlyRecurringRevenue)} />
                <BillingStat label="Active subscriptions" value={String(overview?.billingAnalytics?.activeSubscriptions ?? 0)} />
                <BillingStat label="Churn rate" value={`${overview?.billingAnalytics?.churnRate ?? 0}%`} />
                <BillingStat label="Plan limits" value={`${cloudLimitLabel(currentPlan.maxUsers, "users")} / ${cloudLimitLabel(currentPlan.maxDrivers, "drivers")}`} />
              </div>
              <div className="grid gap-4 lg:grid-cols-3">
                {(Object.entries(cloudBillingPlans) as Array<[CloudBillingPlan, (typeof cloudBillingPlans)[CloudBillingPlan]]>).map(([key, plan]) => (
                  <Card key={key} className={`glass ${key === planKey ? "border-primary/50" : ""}`}>
                    <CardHeader>
                      <div className="flex items-center justify-between gap-3">
                        <CardTitle>{plan.name}</CardTitle>
                        <div className="flex flex-wrap gap-2">
                          {key === "growth" && <Badge className="bg-primary text-primary-foreground">Most Popular</Badge>}
                          {key === planKey && <Badge className="bg-primary text-primary-foreground">Current</Badge>}
                        </div>
                      </div>
                      <div className="mt-4 text-3xl font-black">{money(plan.amount)}</div>
                      <p className="text-sm text-muted-foreground">monthly billing</p>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm leading-7 text-muted-foreground">{plan.description}</p>
                      <p className="mt-3 text-sm font-semibold">{cloudLimitLabel(plan.maxUsers, "users")} / {cloudLimitLabel(plan.maxDrivers, "drivers")}</p>
                      <div className="mt-5 grid gap-2">
                        {plan.features.map((feature) => (
                          <div key={feature} className="flex items-center gap-2 text-sm">
                            <CheckCircle2 className="size-4 text-emerald-500" />
                            {feature}
                          </div>
                        ))}
                      </div>
                      <Button className="mt-6 w-full" onClick={() => startBillingCheckout(key)} disabled={billingPlan !== null}>
                        {billingPlan === key ? <Loader2 className="animate-spin" /> : <CreditCard />}
                        {key === planKey ? "Renew or confirm plan" : `Switch to ${plan.name}`}
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
              <Card className="glass">
                <CardHeader>
                  <CardTitle>Billing history</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-2">
                  {(overview?.billingHistory ?? []).length === 0 ? (
                    <p className="rounded-md border p-4 text-sm text-muted-foreground">No Cloud subscription payments recorded yet.</p>
                  ) : (
                    (overview?.billingHistory ?? []).map((row, index) => (
                      <div key={`${textValue(row.payment_reference, String(index))}-${index}`} className="grid gap-3 rounded-md border bg-background/45 p-4 text-sm md:grid-cols-[1fr_auto_auto_auto_auto] md:items-center">
                        <div>
                          <div className="font-mono font-black">{textValue(row.payment_reference, "Subscription payment")}</div>
                          <div className="text-muted-foreground">Renews: {dateValue(row.renewal_date)}</div>
                        </div>
                        <Badge className="w-fit border-primary/40 bg-primary/10 text-primary">{textValue(row.plan)}</Badge>
                        <Badge className="w-fit">{textValue(row.status)}</Badge>
                        <div className="font-black">{money(row.amount)}</div>
                        {row.payment_reference ? (
                          <Button asChild size="sm" variant="outline">
                            <a href={`/api/cloud/billing/receipts/${encodeURIComponent(textValue(row.payment_reference))}/pdf`} target="_blank" rel="noreferrer">
                              <Download className="size-4" />
                              Receipt
                            </a>
                          </Button>
                        ) : null}
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
              <Card className="glass border-destructive/30">
                <CardHeader>
                  <CardTitle>Subscription controls</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm text-muted-foreground">Stops future recurring billing.</p>
                  <Button type="button" variant="destructive" onClick={cancelBilling} disabled={cancellingBilling || subscriptionStatus === "cancelled"}>
                    {cancellingBilling ? <Loader2 className="animate-spin" /> : <CreditCard />}
                    Cancel subscription
                  </Button>
                </CardContent>
              </Card>
            </div>
          )}

          {!loading && section === "support" && (
            <AccountSupportCenter accountLabel="cloud" portal="cloud" />
          )}

          {!loading && section === "settings" && (
            <div className="grid gap-4">
              <Card className="glass">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Building2 className="size-5 text-primary" />
                    Company white-label basics
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <form className="grid gap-4" onSubmit={saveSettings}>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="grid gap-2">
                        <Label htmlFor="name">Company name</Label>
                        <Input id="name" value={settings.name} onChange={(event) => setSettings((current) => ({ ...current, name: event.target.value }))} />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="brandColor">Brand color</Label>
                        <Input id="brandColor" value={settings.brandColor} onChange={(event) => setSettings((current) => ({ ...current, brandColor: event.target.value }))} />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="supportEmail">Support email</Label>
                        <Input id="supportEmail" type="email" value={settings.supportEmail} onChange={(event) => setSettings((current) => ({ ...current, supportEmail: event.target.value }))} />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="supportPhone">Support phone</Label>
                        <Input id="supportPhone" value={settings.supportPhone} onChange={(event) => setSettings((current) => ({ ...current, supportPhone: event.target.value }))} />
                      </div>
                      <div className="grid gap-2 md:col-span-2">
                        <Label htmlFor="logoUrl">Logo URL</Label>
                        <Input id="logoUrl" value={settings.logoUrl} onChange={(event) => setSettings((current) => ({ ...current, logoUrl: event.target.value }))} />
                      </div>
                    </div>
                    <Button type="submit" disabled={saving}>
                      {saving ? <Loader2 className="animate-spin" /> : <Settings />}
                      Save settings
                    </Button>
                  </form>
                </CardContent>
              </Card>
              <AccountPasswordPanel
                title="Cloud account security"
                description="Change the password for your signed-in Fly Logistics Cloud account without changing company settings."
                successTitle="Cloud password updated"
                successDescription="Use your new Cloud password the next time you sign in."
              />
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function CloudList({ title, rows, primaryKey, secondaryKey }: { title: string; rows: Array<Record<string, unknown>>; primaryKey: string; secondaryKey: string }) {
  return (
    <Card className="glass">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-2">
        {rows.length === 0 ? (
          <p className="rounded-md border p-4 text-sm text-muted-foreground">No records yet.</p>
        ) : (
          rows.map((row, index) => (
            <div key={`${textValue(row[primaryKey], String(index))}-${index}`} className="rounded-md border bg-background/45 p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="font-mono text-sm font-black">{textValue(row[primaryKey])}</div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    {textValue(row.customer_name ?? row.pickup_address ?? row.user_id)}
                  </div>
                </div>
                <Badge className="w-fit border-primary/40 bg-primary/10 text-primary">{textValue(row[secondaryKey])}</Badge>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function CloudEmpty({ title, description }: { title: string; description: string }) {
  return (
    <Card className="glass">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="rounded-md border p-4 text-sm text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}

function BillingStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-background/45 p-4">
      <div className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">{label}</div>
      <div className="mt-2 break-words text-lg font-black">{value}</div>
    </div>
  );
}
