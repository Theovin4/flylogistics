"use client";

import Link from "next/link";
import type { FormEvent } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { BarChart3, CheckCircle2, DollarSign, Loader2, Mail, Megaphone, RefreshCw, Send, Share2, Star, Target, TrendingUp, Trophy, Users } from "lucide-react";
import { getSupabaseBrowser } from "@/lib/supabase";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";

type GrowthResponse = {
  generatedAt: string;
  metrics: Record<string, number>;
  charts: Record<string, Array<{ label: string; value: number }>>;
  latest: Record<string, Array<Record<string, unknown>>>;
  marketingSetup?: Record<string, boolean>;
  googleBusinessProfile?: {
    configured?: boolean;
    status?: string;
    locationName?: string | null;
    accountName?: string | null;
    profileUrl?: string | null;
    lastSync?: Record<string, unknown> | null;
  };
};

const campaignInitial = {
  name: "",
  audience: "customers",
  subject: "",
  bodyText: "",
  ctaUrl: "https://flylogistics.com.ng/customer",
  ctaLabel: "Open Fly Logistics"
};

const payoutInitial = {
  affiliatePartnerId: "",
  referralRewardId: "",
  amount: "",
  paymentMethod: "manual_transfer",
  paymentNote: ""
};

function money(value: number) {
  return new Intl.NumberFormat("en-NG", { currency: "NGN", maximumFractionDigits: 0, style: "currency" }).format(value);
}

function metricLabel(key: string) {
  return key.replace(/([A-Z])/g, " $1").replace(/^./, (letter) => letter.toUpperCase());
}

function barWidth(value: number, max: number) {
  if (!max) return "4%";
  return `${Math.max(4, Math.round((value / max) * 100))}%`;
}

export function AdminGrowthPanel() {
  const [report, setReport] = useState<GrowthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [campaignForm, setCampaignForm] = useState(campaignInitial);
  const [payoutForm, setPayoutForm] = useState(payoutInitial);

  const authorizedFetch = useCallback(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const supabase = getSupabaseBrowser();
    const token = (await supabase?.auth.getSession())?.data.session?.access_token;
    const headers = new Headers(init.headers);
    if (token) headers.set("Authorization", `Bearer ${token}`);
    return fetch(input, { ...init, headers });
  }, []);

  const loadGrowth = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await authorizedFetch("/api/admin/growth");
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to load growth dashboard.");
      setReport(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load growth dashboard.");
    } finally {
      setLoading(false);
    }
  }, [authorizedFetch]);

  useEffect(() => {
    void loadGrowth();
  }, [loadGrowth]);

  const postGrowthAction = useCallback(async (body: Record<string, unknown>, success: string, key: string) => {
    setActionLoading(key);
    setError(null);
    setMessage(null);
    try {
      const response = await authorizedFetch("/api/admin/growth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Unable to complete growth action.");
      setMessage(success);
      await loadGrowth();
      return payload;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to complete growth action.");
      return null;
    } finally {
      setActionLoading(null);
    }
  }, [authorizedFetch, loadGrowth]);

  async function createCampaign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const created = await postGrowthAction(
      {
        action: "create_email_campaign",
        ...campaignForm
      },
      "Email campaign saved as draft.",
      "create-campaign"
    );
    if (created) setCampaignForm(campaignInitial);
  }

  async function sendCampaign(campaignId: unknown) {
    await postGrowthAction(
      {
        action: "send_email_campaign",
        campaignId
      },
      "Email campaign send completed. Check the delivery log below.",
      `send-campaign-${campaignId}`
    );
  }

  async function createAffiliatePayout(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const created = await postGrowthAction(
      {
        action: "create_affiliate_payout",
        affiliatePartnerId: payoutForm.affiliatePartnerId || null,
        referralRewardId: payoutForm.referralRewardId || null,
        amount: Number(payoutForm.amount || 0),
        paymentMethod: payoutForm.paymentMethod,
        paymentNote: payoutForm.paymentNote
      },
      "Affiliate payout recorded and ready for finance reconciliation.",
      "affiliate-payout"
    );
    if (created) setPayoutForm(payoutInitial);
  }

  async function updateAffiliatePayout(payoutId: unknown, status: "paid" | "cancelled" | "approved") {
    await postGrowthAction(
      {
        action: "update_affiliate_payout",
        payoutId,
        status,
        paymentNote: status === "paid" ? "Marked paid from admin growth dashboard." : `Marked ${status} from admin growth dashboard.`
      },
      `Affiliate payout marked ${status}.`,
      `payout-${status}-${payoutId}`
    );
  }

  const metricCards = useMemo(() => {
    const metrics = report?.metrics ?? {};
    return [
      ["leads", metrics.leads ?? 0, Users],
      ["paidConversions", metrics.paidConversions ?? 0, Trophy],
      ["conversionRate", metrics.conversionRate ?? 0, TrendingUp],
      ["revenue", metrics.revenue ?? 0, BarChart3],
      ["merchants", metrics.merchants ?? 0, Users],
      ["referrals", metrics.referrals ?? 0, Star],
      ["crmContacts", metrics.crmContacts ?? 0, Target],
      ["affiliatePartners", metrics.affiliatePartners ?? 0, Share2],
      ["emailCampaigns", metrics.emailCampaigns ?? 0, Mail],
      ["loyaltyRewards", metrics.loyaltyRewards ?? 0, Trophy],
      ["testimonials", metrics.testimonials ?? 0, Star]
    ] as const;
  }, [report]);

  const marketingSetup = report?.marketingSetup ?? {};

  return (
    <section className="grid gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Badge className="border-primary/40 bg-primary/10 text-primary">Growth engine</Badge>
          <h2 className="mt-3 text-2xl font-black tracking-normal sm:text-3xl">Leads, acquisition, referrals, loyalty, and sales intelligence</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
            Track quote demand, merchant onboarding, campaign signals, conversion rate, customer rewards, testimonials, and revenue from one admin view.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href={{ pathname: "/admin/leads" }}>
              <Target />
              Sales CRM
            </Link>
          </Button>
          <Button type="button" variant="outline" onClick={() => void loadGrowth()} disabled={loading}>
            <RefreshCw className={loading ? "animate-spin" : ""} />
            Refresh
          </Button>
        </div>
      </div>

      {error && <div className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">{error}</div>}
      {message && <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-500">{message}</div>}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {loading
          ? Array.from({ length: 10 }).map((_, index) => <Skeleton key={index} className="h-28 rounded-md" />)
          : metricCards.map(([key, value, Icon]) => (
              <Card key={key} className="glass">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{metricLabel(key)}</span>
                    <Icon className="size-5 text-primary" />
                  </div>
                  <div className="mt-3 text-2xl font-black">{key === "revenue" ? money(value) : key === "conversionRate" ? `${value}%` : value.toLocaleString()}</div>
                </CardContent>
              </Card>
            ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-4">
        {(["conversionFunnel", "leadsOverTime", "leadSources", "crmStages", "campaigns", "emailCampaigns", "emailDelivery", "affiliates", "affiliatePayouts", "topDestinations", "attributionRevenue"] as const).map((chartKey) => {
          const rows = report?.charts?.[chartKey] ?? [];
          const max = Math.max(...rows.map((row) => row.value), 0);
          return (
            <Card key={chartKey} className="glass">
              <CardHeader>
                <CardTitle>{metricLabel(chartKey)}</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3">
                {loading ? <Skeleton className="h-44" /> : rows.length ? rows.map((row) => (
                  <div key={row.label} className="grid gap-1 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <span className="truncate text-muted-foreground">{row.label}</span>
                      <span className="font-semibold">{row.value}</span>
                    </div>
                    <div className="h-2 rounded-full bg-muted">
                      <div className="h-2 rounded-full bg-primary" style={{ width: barWidth(row.value, max) }} />
                    </div>
                  </div>
                )) : <p className="text-sm text-muted-foreground">No data yet.</p>}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
        <Card className="glass">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Megaphone className="size-5 text-primary" />
              Marketing integrations
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm">
            {[
              ["Google Analytics", marketingSetup.googleAnalytics],
              ["Meta Pixel", marketingSetup.metaPixel],
              ["Meta Conversions API", marketingSetup.metaConversionsApi],
              ["Google Business Profile", marketingSetup.googleBusinessProfile]
            ].map(([label, enabled]) => (
              <div key={String(label)} className="flex items-center justify-between rounded-md border bg-background/45 p-3">
                <span>{label}</span>
                <Badge className={enabled ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-500" : "border-primary/40 bg-primary/10 text-primary"}>
                  {enabled ? "Connected" : "Setup needed"}
                </Badge>
              </div>
            ))}
            {report?.googleBusinessProfile && (
              <div className="rounded-md border bg-background/45 p-3">
                <div className="flex items-center justify-between gap-3">
                  <span>Google profile health</span>
                  <Badge className={report.googleBusinessProfile.configured ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-500" : "border-primary/40 bg-primary/10 text-primary"}>
                    {report.googleBusinessProfile.status ?? "setup needed"}
                  </Badge>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Last sync: {String(report.googleBusinessProfile.lastSync?.synced_at ?? report.googleBusinessProfile.lastSync?.created_at ?? "Not synced yet")}
                </p>
              </div>
            )}
            <Button
              type="button"
              variant="outline"
              disabled={actionLoading === "gbp-sync"}
              onClick={() => void postGrowthAction({ action: "sync_google_business_profile" }, "Google Business Profile sync completed.", "gbp-sync")}
            >
              {actionLoading === "gbp-sync" ? <Loader2 className="animate-spin" /> : <RefreshCw />}
              Sync Google Business Profile
            </Button>
          </CardContent>
        </Card>

        <Card className="glass">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="size-5 text-primary" />
              Growth operating checklist
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm text-muted-foreground md:grid-cols-2">
            {[
              "Quote and business forms feed lead capture.",
              "CRM tracks leads, prospects, customers, and merchants.",
              "Referral and loyalty rewards are visible to customers.",
              "Affiliate partners and email campaigns are admin-visible.",
              "Campaign events support source, medium, and campaign reporting.",
              "Sales dashboard shows conversion funnel and revenue signals."
            ].map((item) => (
              <div key={item} className="flex gap-2 rounded-md border bg-background/45 p-3">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
                <span>{item}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="glass">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="size-5 text-primary" />
              Email campaign sender
            </CardTitle>
            <p className="text-sm text-muted-foreground">Create a branded Fly Logistics campaign draft, then send it to a controlled audience.</p>
          </CardHeader>
          <CardContent className="grid gap-4">
            <form className="grid gap-3 rounded-md border bg-background/45 p-4" onSubmit={createCampaign}>
              <div className="grid gap-2">
                <Label htmlFor="campaignName">Campaign name</Label>
                <Input id="campaignName" value={campaignForm.name} onChange={(event) => setCampaignForm((current) => ({ ...current, name: event.target.value }))} placeholder="June delivery offer" required />
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="campaignAudience">Audience</Label>
                  <select id="campaignAudience" value={campaignForm.audience} onChange={(event) => setCampaignForm((current) => ({ ...current, audience: event.target.value }))} className="h-10 rounded-md border bg-background/70 px-3 text-sm">
                    {["customers", "merchants", "leads", "all"].map((audience) => <option key={audience} value={audience}>{audience}</option>)}
                  </select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="campaignSubject">Subject</Label>
                  <Input id="campaignSubject" value={campaignForm.subject} onChange={(event) => setCampaignForm((current) => ({ ...current, subject: event.target.value }))} placeholder="Ship faster with Fly Logistics" required />
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="campaignBody">Message</Label>
                <textarea id="campaignBody" value={campaignForm.bodyText} onChange={(event) => setCampaignForm((current) => ({ ...current, bodyText: event.target.value }))} placeholder="Write a short, branded customer message." required className="min-h-28 rounded-md border bg-background/70 px-3 py-2 text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-primary" />
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <Input value={campaignForm.ctaUrl} onChange={(event) => setCampaignForm((current) => ({ ...current, ctaUrl: event.target.value }))} placeholder="CTA URL" />
                <Input value={campaignForm.ctaLabel} onChange={(event) => setCampaignForm((current) => ({ ...current, ctaLabel: event.target.value }))} placeholder="CTA label" />
              </div>
              <Button type="submit" disabled={actionLoading === "create-campaign"}>
                {actionLoading === "create-campaign" ? <Loader2 className="animate-spin" /> : <Mail />}
                Save campaign draft
              </Button>
            </form>

            <div className="grid gap-2">
              <div className="text-sm font-semibold">Recent campaigns</div>
              {(report?.latest?.emailCampaigns ?? []).slice(0, 5).map((campaign) => (
                <div key={String(campaign.id)} className="flex flex-col gap-3 rounded-md border bg-background/45 p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="font-semibold">{String(campaign.name ?? "Campaign")}</div>
                    <p className="text-xs text-muted-foreground">{String(campaign.subject ?? campaign.audience ?? "")}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge>{String(campaign.status ?? "draft")}</Badge>
                    <Button type="button" size="sm" disabled={actionLoading === `send-campaign-${campaign.id}`} onClick={() => void sendCampaign(campaign.id)}>
                      {actionLoading === `send-campaign-${campaign.id}` ? <Loader2 className="animate-spin" /> : <Send />}
                      Send
                    </Button>
                  </div>
                </div>
              ))}
              {!loading && (report?.latest?.emailCampaigns ?? []).length === 0 && <p className="rounded-md border p-4 text-sm text-muted-foreground">No email campaigns yet.</p>}
            </div>
          </CardContent>
        </Card>

        <Card className="glass">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="size-5 text-primary" />
              Affiliate payout workflow
            </CardTitle>
            <p className="text-sm text-muted-foreground">Record approved referral or affiliate payouts for finance reconciliation.</p>
          </CardHeader>
          <CardContent className="grid gap-4">
            <form className="grid gap-3 rounded-md border bg-background/45 p-4" onSubmit={createAffiliatePayout}>
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="affiliatePartnerId">Affiliate partner ID</Label>
                  <Input id="affiliatePartnerId" value={payoutForm.affiliatePartnerId} onChange={(event) => setPayoutForm((current) => ({ ...current, affiliatePartnerId: event.target.value }))} placeholder="Optional" />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="referralRewardId">Referral reward ID</Label>
                  <Input id="referralRewardId" value={payoutForm.referralRewardId} onChange={(event) => setPayoutForm((current) => ({ ...current, referralRewardId: event.target.value }))} placeholder="Optional" />
                </div>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="payoutAmount">Amount</Label>
                  <Input id="payoutAmount" inputMode="decimal" value={payoutForm.amount} onChange={(event) => setPayoutForm((current) => ({ ...current, amount: event.target.value }))} placeholder="5000" required />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="payoutMethod">Payment method</Label>
                  <Input id="payoutMethod" value={payoutForm.paymentMethod} onChange={(event) => setPayoutForm((current) => ({ ...current, paymentMethod: event.target.value }))} />
                </div>
              </div>
              <textarea value={payoutForm.paymentNote} onChange={(event) => setPayoutForm((current) => ({ ...current, paymentNote: event.target.value }))} placeholder="Finance note or transfer reference" className="min-h-20 rounded-md border bg-background/70 px-3 py-2 text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-primary" />
              <Button type="submit" disabled={actionLoading === "affiliate-payout"}>
                {actionLoading === "affiliate-payout" ? <Loader2 className="animate-spin" /> : <DollarSign />}
                Record payout
              </Button>
            </form>

            <div className="grid gap-2">
              <div className="text-sm font-semibold">Latest payouts</div>
              {(report?.latest?.affiliatePayouts ?? []).slice(0, 5).map((payout) => (
                <div key={String(payout.id)} className="grid gap-3 rounded-md border bg-background/45 p-3 text-sm sm:grid-cols-[1fr_auto] sm:items-center">
                  <div>
                    <div className="font-mono font-semibold">{String(payout.payout_reference ?? `Payout ${payout.id}`)}</div>
                    <p className="text-xs text-muted-foreground">{String(payout.created_at ?? "")}</p>
                  </div>
                  <div className="grid gap-2 sm:justify-items-end">
                    <div className="font-semibold">{money(Number(payout.amount ?? 0))}</div>
                    <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                      <Badge>{String(payout.status ?? "pending")}</Badge>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={actionLoading === `payout-paid-${payout.id}` || String(payout.status ?? "") === "paid"}
                        onClick={() => void updateAffiliatePayout(payout.id, "paid")}
                      >
                        {actionLoading === `payout-paid-${payout.id}` ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
                        Paid
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={actionLoading === `payout-cancelled-${payout.id}` || String(payout.status ?? "") === "cancelled"}
                        onClick={() => void updateAffiliatePayout(payout.id, "cancelled")}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
              {!loading && (report?.latest?.affiliatePayouts ?? []).length === 0 && <p className="rounded-md border p-4 text-sm text-muted-foreground">No affiliate payouts yet.</p>}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="glass">
        <CardHeader>
          <CardTitle>Latest activity</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {(["leads", "crmContacts", "merchants", "affiliates", "emailCampaigns", "testimonials", "campaigns"] as const).map((key) => (
            <div key={key} className="rounded-md border bg-background/45 p-4">
              <div className="text-sm font-semibold capitalize">{key}</div>
              <div className="mt-3 grid gap-2">
                {(report?.latest?.[key] ?? []).slice(0, 3).map((item, index) => (
                  <div key={`${key}-${index}`} className="rounded-md border bg-background/45 p-3 text-xs text-muted-foreground">
                    <div className="font-medium text-foreground">{String(item.full_name ?? item.email ?? item.partner_name ?? item.name ?? item.account_name ?? item.campaign ?? item.status ?? `Item ${index + 1}`)}</div>
                    <div className="mt-1">{String(item.created_at ?? "")}</div>
                  </div>
                ))}
                {!loading && (report?.latest?.[key] ?? []).length === 0 && <p className="text-xs text-muted-foreground">No recent records.</p>}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </section>
  );
}
