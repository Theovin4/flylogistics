"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Building2, CalendarClock, Loader2, RefreshCw, Search, ShieldCheck, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { getSupabaseBrowser } from "@/lib/supabase";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type CloudCompany = {
  id: string;
  name: string;
  slug: string;
  plan?: string | null;
  status?: string | null;
  subscription_status?: string | null;
  subscription_plan?: string | null;
  trial_ends_at?: string | null;
  subscription_renews_at?: string | null;
  billing_email?: string | null;
  created_at?: string | null;
  memberCounts?: Record<string, number>;
  subscription?: {
    plan?: string | null;
    status?: string | null;
    amount?: number | string | null;
    currency?: string | null;
    renewal_date?: string | null;
  } | null;
};

type CloudResponse = {
  companies?: CloudCompany[];
  pagination?: { page: number; total: number; hasMore: boolean };
  error?: string;
};

function displayDate(value?: string | null) {
  if (!value) return "Not set";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Not set" : date.toLocaleDateString("en-NG", { dateStyle: "medium" });
}

function memberTotal(company: CloudCompany) {
  return Object.values(company.memberCounts ?? {}).reduce((sum, count) => sum + count, 0);
}

export function AdminCloudTenantPanel() {
  const [companies, setCompanies] = useState<CloudCompany[]>([]);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async (requestedPage: number, requestedSearch: string) => {
    setLoading(true);
    setError(null);
    const supabase = getSupabaseBrowser();
    const session = await supabase?.auth.getSession();
    const token = session?.data.session?.access_token;
    if (!token) {
      setError("Your secure admin session has expired. Sign in again.");
      setLoading(false);
      return;
    }

    try {
      const params = new URLSearchParams({ page: String(requestedPage), limit: "25" });
      if (requestedSearch.trim()) params.set("search", requestedSearch.trim());
      const response = await fetch(`/api/admin/cloud?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store"
      });
      const data = (await response.json()) as CloudResponse;
      if (!response.ok) throw new Error(data.error ?? "Unable to load Cloud tenant accounts.");
      setCompanies(data.companies ?? []);
      setTotal(data.pagination?.total ?? 0);
      setHasMore(Boolean(data.pagination?.hasMore));
      setPage(data.pagination?.page ?? requestedPage);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load Cloud tenant accounts.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(1, "");
  }, [load]);

  const summary = useMemo(() => ({
    active: companies.filter((company) => company.status === "active").length,
    trialing: companies.filter((company) => company.subscription_status === "trialing").length,
    attention: companies.filter((company) => ["past_due", "payment_failed", "expired"].includes(company.subscription_status ?? "")).length
  }), [companies]);
  const summaryCards: Array<{ label: string; value: number; icon: LucideIcon }> = [
    { label: "Total tenants", value: total, icon: Building2 },
    { label: "Active on page", value: summary.active, icon: ShieldCheck },
    { label: "Trials on page", value: summary.trialing, icon: CalendarClock },
    { label: "Needs attention", value: summary.attention, icon: Users }
  ];

  async function updateCompany(companyId: string, updates: Record<string, string>) {
    setSavingId(companyId);
    setError(null);
    setMessage(null);
    const supabase = getSupabaseBrowser();
    const session = await supabase?.auth.getSession();
    const token = session?.data.session?.access_token;
    if (!token) {
      setError("Your secure admin session has expired. Sign in again.");
      setSavingId(null);
      return;
    }

    try {
      const response = await fetch("/api/admin/cloud", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ companyId, ...updates })
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Unable to update this tenant account.");
      setMessage("Cloud tenant account updated and recorded in the audit log.");
      await load(page, search);
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Unable to update this tenant account.");
    } finally {
      setSavingId(null);
    }
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void load(1, search);
  }

  return (
    <div className="grid gap-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Badge className="border-primary/40 bg-primary/10 text-primary">Cloud super-admin</Badge>
          <h2 className="mt-3 text-2xl font-black">Tenant accounts and subscriptions</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">Review tenant health, plan status, membership, trials, and account access without entering a tenant workspace.</p>
        </div>
        <Button variant="outline" onClick={() => void load(page, search)} disabled={loading}>
          {loading ? <Loader2 className="animate-spin" /> : <RefreshCw />}
          Refresh
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {summaryCards.map((card) => {
          const Icon = card.icon;
          return (
          <Card key={card.label} className="glass">
            <CardContent className="flex items-center justify-between p-4">
              <div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">{card.label}</p><p className="mt-2 font-mono text-2xl font-black">{card.value}</p></div>
              <Icon className="size-5 text-primary" />
            </CardContent>
          </Card>
          );
        })}
      </div>

      <Card className="glass">
        <CardContent className="p-4">
          <form onSubmit={submitSearch} className="flex flex-col gap-2 sm:flex-row">
            <div className="min-w-0 flex-1">
              <Label htmlFor="cloud-tenant-search" className="sr-only">Search tenants</Label>
              <Input id="cloud-tenant-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search company, workspace slug, or billing email" />
            </div>
            <Button type="submit" variant="outline" disabled={loading}><Search />Search</Button>
          </form>
        </CardContent>
      </Card>

      {error ? <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">{error}</div> : null}
      {message ? <div role="status" className="rounded-md border border-emerald-500/40 bg-emerald-500/10 p-4 text-sm text-emerald-500">{message}</div> : null}

      <div className="grid gap-3">
        {!loading && companies.length === 0 ? <Card className="glass"><CardContent className="p-6 text-sm text-muted-foreground">No tenant accounts match this view.</CardContent></Card> : null}
        {companies.map((company) => (
          <Card key={company.id} className="glass overflow-hidden">
            <CardHeader className="gap-3 border-b sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle>{company.name}</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">{company.slug} · {company.billing_email || "Billing email not set"}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge>{company.plan ?? company.subscription_plan ?? "starter"}</Badge>
                <Badge className={company.status === "active" ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-500" : "border-amber-500/40 bg-amber-500/10 text-amber-500"}>{company.status ?? "unknown"}</Badge>
                <Badge variant="outline">{company.subscription_status ?? company.subscription?.status ?? "pending"}</Badge>
              </div>
            </CardHeader>
            <CardContent className="grid gap-4 p-4 lg:grid-cols-[1fr_auto] lg:items-end">
              <div className="grid gap-3 sm:grid-cols-3">
                <div><p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Members</p><p className="mt-1 font-semibold">{memberTotal(company)}</p></div>
                <div><p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Trial ends</p><p className="mt-1 font-semibold">{displayDate(company.trial_ends_at)}</p></div>
                <div><p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Next renewal</p><p className="mt-1 font-semibold">{displayDate(company.subscription_renews_at ?? company.subscription?.renewal_date)}</p></div>
              </div>
              <div className="flex flex-wrap gap-2">
                <select
                  aria-label={`Plan for ${company.name}`}
                  className="h-10 rounded-md border bg-background px-3 text-sm"
                  value={company.plan ?? company.subscription_plan ?? "starter"}
                  disabled={savingId === company.id}
                  onChange={(event) => void updateCompany(company.id, { plan: event.target.value })}
                >
                  <option value="starter">Starter</option><option value="growth">Growth</option><option value="scale">Scale</option>
                </select>
                <Button variant="outline" disabled={savingId === company.id} onClick={() => void updateCompany(company.id, { trialEndsAt: new Date(Date.now() + 14 * 86_400_000).toISOString() })}>Extend trial 14 days</Button>
                <Button variant={company.status === "active" ? "destructive" : "default"} disabled={savingId === company.id} onClick={() => void updateCompany(company.id, { status: company.status === "active" ? "suspended" : "active" })}>
                  {savingId === company.id ? <Loader2 className="animate-spin" /> : null}
                  {company.status === "active" ? "Suspend" : "Activate"}
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex items-center justify-between gap-3">
        <Button variant="outline" disabled={loading || page <= 1} onClick={() => void load(page - 1, search)}>Previous</Button>
        <span className="text-sm text-muted-foreground">Page {page}</span>
        <Button variant="outline" disabled={loading || !hasMore} onClick={() => void load(page + 1, search)}>Next</Button>
      </div>
    </div>
  );
}
