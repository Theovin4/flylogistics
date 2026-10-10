"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import type { Route } from "next";
import { Activity, AlertTriangle, BarChart3, Building2, CheckCircle2, CircleDollarSign, ClipboardCheck, CreditCard, Download, Headphones, ImageUp, Loader2, Package, Settings, Trash2, Truck, UserCog, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AccountPasswordPanel } from "@/components/auth/account-password-panel";
import { AccountSupportCenter } from "@/components/support/account-support-center";
import { CloudAnalyticsWorkspace, CloudCustomersWorkspace, CloudDispatchWorkspace, CloudDriversWorkspace, CloudRatesWorkspace, CloudShipmentsWorkspace, CloudTeamWorkspace } from "@/components/cloud/cloud-operations-workspace";
import { useCloudTenant } from "@/components/cloud/cloud-tenant-context";
import { cloudBillingPlans, cloudLimitLabel, cloudTrialDaysRemaining, getCloudBillingPlanKey, type CloudBillingPlan } from "@/lib/cloud-plans";

type CloudSection = "overview" | "settings" | "drivers" | "shipments" | "operations" | "customers" | "analytics" | "billing" | "support" | "team" | "rates";

type CloudCompany = {
  id: string;
  name: string;
  slug: string;
  logo_url?: string | null;
  brand_color?: string | null;
  accent_color?: string | null;
  support_email?: string | null;
  support_phone?: string | null;
  business_address?: string | null;
  public_address?: string | null;
  public_phone?: string | null;
  public_whatsapp?: string | null;
  public_support_email?: string | null;
  show_contact_on_tracking?: boolean | null;
  country?: string | null;
  timezone?: string | null;
  currency?: string | null;
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
  usage?: Record<string, number>;
  warnings?: string[];
  error?: string;
};

const navItems: Array<{ label: string; href: Route; section: CloudSection; icon: typeof BarChart3 }> = [
  { label: "Dashboard", href: "/cloud/dashboard" as Route, section: "overview", icon: BarChart3 },
  { label: "Operations", href: "/cloud/operations" as Route, section: "operations", icon: Activity },
  { label: "Shipments", href: "/cloud/shipments" as Route, section: "shipments", icon: Package },
  { label: "Drivers", href: "/cloud/drivers" as Route, section: "drivers", icon: Truck },
  { label: "Customers", href: "/cloud/customers" as Route, section: "customers", icon: Users },
  { label: "Team", href: "/cloud/team" as Route, section: "team", icon: UserCog },
  { label: "Rates", href: "/cloud/rates" as Route, section: "rates", icon: CircleDollarSign },
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
  const tenant = useCloudTenant();
  const initialCompany = tenant.company as CloudCompany | null;
  const [overview, setOverview] = useState<CloudOverview | null>({ company: initialCompany, role: tenant.role });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [billingPlan, setBillingPlan] = useState<CloudBillingPlan | null>(null);
  const [verifyingBilling, setVerifyingBilling] = useState(false);
  const [cancellingBilling, setCancellingBilling] = useState(false);
  const [verifiedBillingRef, setVerifiedBillingRef] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState({
    name: initialCompany?.name ?? "",
    logoUrl: initialCompany?.logo_url ?? "",
    brandColor: initialCompany?.brand_color ?? "#ff7900",
    supportEmail: initialCompany?.support_email ?? "",
    supportPhone: initialCompany?.support_phone ?? "",
    businessAddress: initialCompany?.business_address ?? "",
    publicAddress: initialCompany?.public_address ?? "",
    publicPhone: initialCompany?.public_phone ?? "",
    publicWhatsapp: initialCompany?.public_whatsapp ?? "",
    publicSupportEmail: initialCompany?.public_support_email ?? "",
    showContactOnTracking: initialCompany?.show_contact_on_tracking ?? false,
    country: initialCompany?.country ?? "Nigeria",
    timezone: initialCompany?.timezone ?? "Africa/Lagos",
    currency: initialCompany?.currency ?? "NGN",
    accentColor: initialCompany?.accent_color ?? ""
  });

  async function loadOverview() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/cloud/overview", { cache: "no-store" });
      const data = (await response.json()) as CloudOverview;
      if (!response.ok) throw new Error(data.error ?? "Unable to load cloud workspace.");
      setOverview(data);
      tenant.setCompany((data.company ?? null) as never);
      setSettings({
        name: data.company?.name ?? "",
        logoUrl: data.company?.logo_url ?? "",
        brandColor: data.company?.brand_color ?? "#ff7900",
        supportEmail: data.company?.support_email ?? "",
        supportPhone: data.company?.support_phone ?? "",
        businessAddress: data.company?.business_address ?? "",
        publicAddress: data.company?.public_address ?? "",
        publicPhone: data.company?.public_phone ?? "",
        publicWhatsapp: data.company?.public_whatsapp ?? "",
        publicSupportEmail: data.company?.public_support_email ?? "",
        showContactOnTracking: data.company?.show_contact_on_tracking ?? false,
        country: data.company?.country ?? "Nigeria",
        timezone: data.company?.timezone ?? "Africa/Lagos",
        currency: data.company?.currency ?? "NGN",
        accentColor: data.company?.accent_color ?? ""
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load cloud workspace.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadOverview();
    // The workspace fetch runs once; authoritative first-paint branding comes from the persistent server layout.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const metrics = useMemo(() => overview?.metrics ?? {}, [overview]);
  const company = overview?.company ?? initialCompany;
  const activeNav = navItems.find((item) => item.section === section) ?? navItems[0];
  const trialDays = cloudTrialDaysRemaining(company?.trial_ends_at);
  const planKey = getCloudBillingPlanKey(company?.subscription_plan ?? company?.plan);
  const currentPlan = cloudBillingPlans[planKey];
  const subscriptionStatus = company?.subscription_status ?? (trialDays > 0 ? "trialing" : "active");
  const onboardingItems = useMemo(
    () => [
      { label: "Brand your workspace", href: "/cloud/settings" as Route, done: Boolean(company?.name && company?.support_email && company?.support_phone) },
      { label: "Create your first shipment", href: "/cloud/shipments" as Route, done: Number(metrics.shipments ?? 0) > 0 },
      { label: "Add or approve a driver", href: "/cloud/drivers" as Route, done: Number(metrics.drivers ?? 0) > 0 },
      { label: "Capture a customer or lead", href: "/cloud/customers" as Route, done: Number(metrics.customers ?? 0) > 0 || Number(metrics.quoteRequests ?? 0) > 0 },
      { label: "Confirm billing plan", href: "/cloud/billing" as Route, done: subscriptionStatus === "active" || subscriptionStatus === "trialing" }
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
      if (data.company) tenant.setCompany(data.company as never);
      setMessage("Company settings saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update cloud settings.");
    } finally {
      setSaving(false);
    }
  }

  async function uploadLogo(file: File) {
    setUploadingLogo(true); setMessage(null); setError(null);
    try {
      const form = new FormData(); form.append("file", file);
      const response = await fetch("/api/cloud/branding/logo", { method: "POST", body: form });
      const data = await response.json() as { company?: CloudCompany; logoUrl?: string; error?: string };
      if (!response.ok || !data.company) throw new Error(data.error ?? "Unable to upload logo.");
      setOverview((current) => ({ ...(current ?? {}), company: { ...(current?.company ?? company), ...data.company } as CloudCompany }));
      tenant.setCompany(data.company as never);
      setSettings((current) => ({ ...current, logoUrl: data.logoUrl ?? "" }));
      setMessage("Company logo updated.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to upload logo."); }
    finally { setUploadingLogo(false); }
  }

  async function removeLogo() {
    setUploadingLogo(true); setMessage(null); setError(null);
    try {
      const response = await fetch("/api/cloud/branding/logo", { method: "DELETE" });
      const data = await response.json() as { company?: CloudCompany; error?: string };
      if (!response.ok || !data.company) throw new Error(data.error ?? "Unable to remove logo.");
      setOverview((current) => ({ ...(current ?? {}), company: { ...(current?.company ?? company), ...data.company } as CloudCompany }));
      tenant.setCompany(data.company as never);
      setSettings((current) => ({ ...current, logoUrl: "" }));
      setMessage("Company logo removed.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to remove logo."); }
    finally { setUploadingLogo(false); }
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
          <div className="flex items-center gap-3">{company?.logo_url ? <div className="relative h-10 w-20"><Image src={company.logo_url} alt={`${company.name} logo`} fill sizes="80px" className="object-contain object-left" unoptimized /></div> : <div className="grid size-10 place-items-center rounded-md bg-primary font-black text-primary-foreground">{company?.name?.slice(0, 2).toUpperCase() ?? "FL"}</div>}<div><Link href={"/cloud/dashboard" as Route} className="font-black">{company?.name ?? "Fly Logistics Cloud"}</Link><p className="text-xs text-muted-foreground">Cloud workspace</p></div></div>
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
                <Link href={(company?.slug ? `/cloud/portal/${company.slug}` : "/cloud/settings") as Route}>Customer portal</Link>
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
                    <Link key={item.label} href={item.href} className="flex items-center gap-2 rounded-md border bg-background/45 p-3 text-sm transition hover:border-primary/60 hover:bg-primary/5">
                      <CheckCircle2 className={`size-4 ${item.done ? "text-emerald-500" : "text-muted-foreground"}`} />
                      <span className={item.done ? "text-foreground" : "text-muted-foreground"}>{item.label}</span>
                    </Link>
                  ))}
                </CardContent>
              </Card>
              <CloudList title="Latest shipments" rows={overview?.recentShipments ?? []} primaryKey="tracking_id" secondaryKey="status" />
              <CloudList title="Latest quote requests" rows={overview?.recentQuotes ?? []} primaryKey="request_id" secondaryKey="status" />
            </div>
          )}

          {!loading && section === "shipments" && (
            <CloudShipmentsWorkspace />
          )}

          {!loading && section === "operations" && (
            <CloudDispatchWorkspace />
          )}

          {!loading && section === "drivers" && (
            <CloudDriversWorkspace />
          )}

          {!loading && section === "customers" && (
            <CloudCustomersWorkspace />
          )}

          {!loading && section === "analytics" && (
            <CloudAnalyticsWorkspace />
          )}

          {!loading && section === "team" && (
            <CloudTeamWorkspace />
          )}

          {!loading && section === "rates" && (
            <CloudRatesWorkspace />
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
              <div className="grid gap-4 md:grid-cols-3">
                <BillingStat label="Team usage" value={`${overview?.usage?.members ?? 0} / ${currentPlan.maxUsers ?? "Unlimited"}`} />
                <BillingStat label="Driver usage" value={`${overview?.usage?.drivers ?? 0} / ${currentPlan.maxDrivers ?? "Unlimited"}`} />
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
                        <Input id="brandColor" type="color" value={settings.brandColor} onChange={(event) => setSettings((current) => ({ ...current, brandColor: event.target.value }))} />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="supportEmail">Support email</Label>
                        <Input id="supportEmail" type="email" value={settings.supportEmail} onChange={(event) => setSettings((current) => ({ ...current, supportEmail: event.target.value }))} />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="supportPhone">Support phone</Label>
                        <Input id="supportPhone" value={settings.supportPhone} onChange={(event) => setSettings((current) => ({ ...current, supportPhone: event.target.value }))} />
                      </div>
                      <div className="grid gap-3 rounded-md border p-4 md:col-span-2">
                        <Label htmlFor="companyLogo">Company logo</Label>
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                          <div className="relative grid h-24 w-full max-w-56 place-items-center overflow-hidden rounded-md border bg-background/50 p-3">
                            {settings.logoUrl ? <Image src={settings.logoUrl} alt="Company logo preview" fill sizes="224px" className="object-contain p-3" unoptimized /> : <span className="text-sm text-muted-foreground">No logo uploaded</span>}
                          </div>
                          <div className="flex flex-1 flex-wrap gap-2">
                            <Label htmlFor="companyLogo" className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-md bg-primary px-4 py-2 font-semibold text-primary-foreground">
                              {uploadingLogo ? <Loader2 className="size-4 animate-spin" /> : <ImageUp className="size-4" />}
                              Upload logo
                            </Label>
                            <Input id="companyLogo" type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" disabled={uploadingLogo} onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadLogo(file); event.currentTarget.value = ""; }} />
                            {settings.logoUrl && <Button type="button" variant="outline" disabled={uploadingLogo} onClick={() => void removeLogo()}><Trash2 className="size-4"/>Remove</Button>}
                          </div>
                        </div>
                        <p className="text-xs text-muted-foreground">PNG, JPEG, or WebP. Maximum 5 MB. Horizontal and square logos are supported.</p>
                      </div>
                      <div className="grid gap-2 md:col-span-2"><Label htmlFor="businessAddress">Business address</Label><Input id="businessAddress" value={settings.businessAddress} onChange={(event) => setSettings((current) => ({ ...current, businessAddress: event.target.value }))} /></div>
                      <div className="grid gap-2"><Label htmlFor="country">Country</Label><Input id="country" value={settings.country} onChange={(event) => setSettings((current) => ({ ...current, country: event.target.value }))} /></div>
                      <div className="grid gap-2"><Label htmlFor="timezone">Timezone</Label><Input id="timezone" value={settings.timezone} onChange={(event) => setSettings((current) => ({ ...current, timezone: event.target.value }))} /></div>
                      <div className="grid gap-2"><Label htmlFor="currency">Currency</Label><Input id="currency" maxLength={3} value={settings.currency} onChange={(event) => setSettings((current) => ({ ...current, currency: event.target.value.toUpperCase() }))} /></div>
                      <div className="grid gap-2"><Label htmlFor="accentColor">Accent color</Label><Input id="accentColor" type="color" value={settings.accentColor || settings.brandColor} onChange={(event) => setSettings((current) => ({ ...current, accentColor: event.target.value }))} /></div>
                    </div>
                    <div className="grid gap-4 rounded-md border p-4">
                      <div><h3 className="font-black">Public contact details</h3><p className="text-sm text-muted-foreground">Only these approved business contacts can appear on your public tracking page.</p></div>
                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="grid gap-2 md:col-span-2"><Label htmlFor="publicAddress">Public business address</Label><Input id="publicAddress" maxLength={300} value={settings.publicAddress} onChange={(event) => setSettings((current) => ({ ...current, publicAddress: event.target.value }))}/></div>
                        <div className="grid gap-2"><Label htmlFor="publicPhone">Public telephone</Label><Input id="publicPhone" type="tel" inputMode="tel" value={settings.publicPhone} onChange={(event) => setSettings((current) => ({ ...current, publicPhone: event.target.value }))}/></div>
                        <div className="grid gap-2"><Label htmlFor="publicWhatsapp">Public WhatsApp</Label><Input id="publicWhatsapp" type="tel" inputMode="tel" value={settings.publicWhatsapp} onChange={(event) => setSettings((current) => ({ ...current, publicWhatsapp: event.target.value }))}/></div>
                        <div className="grid gap-2 md:col-span-2"><Label htmlFor="publicSupportEmail">Public support email</Label><Input id="publicSupportEmail" type="email" value={settings.publicSupportEmail} onChange={(event) => setSettings((current) => ({ ...current, publicSupportEmail: event.target.value }))}/></div>
                      </div>
                      <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md border p-3"><input type="checkbox" checked={settings.showContactOnTracking} onChange={(event) => setSettings((current) => ({ ...current, showContactOnTracking: event.target.checked }))}/><span className="font-semibold">Show public contact information on tracking pages</span></label>
                      <div className="rounded-md border bg-background/45 p-4"><p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Tracking page preview</p><p className="mt-2 font-black">{settings.name || "Your company"}</p><p className="mt-2 text-sm text-muted-foreground">{settings.publicAddress || "Public address will appear here"}</p><p className="text-sm text-muted-foreground">{settings.publicPhone || settings.publicWhatsapp || settings.publicSupportEmail || "Add a public contact method"}</p></div>
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

function BillingStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-background/45 p-4">
      <div className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">{label}</div>
      <div className="mt-2 break-words text-lg font-black">{value}</div>
    </div>
  );
}
