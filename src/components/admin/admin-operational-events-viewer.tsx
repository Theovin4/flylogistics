"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { Route as NextRoute } from "next";
import { Activity, AlertTriangle, ArrowLeft, Clock3, Layers3, Loader2, RefreshCw, Search, ShieldCheck } from "lucide-react";
import { AccountControl } from "@/components/auth/account-control";
import { RoleGate } from "@/components/auth/role-gate";
import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/brand/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getSupabaseBrowser } from "@/lib/supabase";

type SeverityFilter = "all" | "info" | "warning" | "error";

type OperationalEvent = {
  id: number | string;
  category: string;
  severity?: string | null;
  message: string;
  entity_type?: string | null;
  entity_id?: string | null;
  created_at?: string | null;
};

type EventsResponse = {
  events?: OperationalEvent[];
  warning?: string;
  error?: string;
};

const severityOptions: SeverityFilter[] = ["all", "info", "warning", "error"];

function formatDate(value?: string | null) {
  if (!value) return "Unknown time";
  return new Date(value).toLocaleString();
}

function normalizeSeverity(value?: string | null) {
  return String(value ?? "info").toLowerCase();
}

function severityClass(severity?: string | null) {
  const normalized = normalizeSeverity(severity);
  if (normalized === "error") return "border-destructive/40 bg-destructive/10 text-destructive";
  if (normalized === "warning") return "border-primary/40 bg-primary/10 text-primary";
  return "border-emerald-500/40 bg-emerald-500/10 text-emerald-500";
}

function uniqueValues(events: OperationalEvent[], field: "category" | "entity_type") {
  return Array.from(new Set(events.map((event) => event[field]).filter(Boolean) as string[])).sort((a, b) => a.localeCompare(b));
}

export function AdminOperationalEventsViewer() {
  const [events, setEvents] = useState<OperationalEvent[]>([]);
  const [severity, setSeverity] = useState<SeverityFilter>("all");
  const [category, setCategory] = useState("");
  const [entityType, setEntityType] = useState("");
  const [entityId, setEntityId] = useState("");
  const [search, setSearch] = useState("");
  const [warning, setWarning] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const authHeaders = useCallback(async () => {
    const supabase = getSupabaseBrowser();
    const { data } = supabase ? await supabase.auth.getSession() : { data: { session: null } };
    return data.session?.access_token ? { Authorization: `Bearer ${data.session.access_token}` } : {};
  }, []);

  const loadEvents = useCallback(async () => {
    setLoading(true);
    setError(null);
    setWarning(null);

    try {
      const params = new URLSearchParams({ limit: "200" });
      if (severity !== "all") params.set("severity", severity);
      if (category.trim()) params.set("category", category.trim());
      if (entityType.trim()) params.set("entityType", entityType.trim());
      if (entityId.trim()) params.set("entityId", entityId.trim());

      const headers = new Headers();
      const auth = await authHeaders();
      Object.entries(auth).forEach(([key, value]) => headers.set(key, value));

      const response = await fetch(`/api/admin/operational-events?${params.toString()}`, { headers });
      const data = (await response.json()) as EventsResponse;
      if (!response.ok) throw new Error(data.error ?? "Unable to load operational events.");

      setEvents(data.events ?? []);
      setWarning(data.warning ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load operational events.");
    } finally {
      setLoading(false);
    }
  }, [authHeaders, category, entityId, entityType, severity]);

  useEffect(() => {
    void loadEvents();
  }, [loadEvents]);

  const filteredEvents = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return events;

    return events.filter((event) =>
      [
        event.message,
        event.category,
        event.severity,
        event.entity_type,
        event.entity_id,
        event.created_at
      ].some((value) => String(value ?? "").toLowerCase().includes(needle))
    );
  }, [events, search]);

  const categories = useMemo(() => uniqueValues(events, "category"), [events]);
  const entityTypes = useMemo(() => uniqueValues(events, "entity_type"), [events]);

  const stats = useMemo(() => {
    const errors = filteredEvents.filter((event) => normalizeSeverity(event.severity) === "error").length;
    const warnings = filteredEvents.filter((event) => normalizeSeverity(event.severity) === "warning").length;
    const linkedEntities = filteredEvents.filter((event) => event.entity_type || event.entity_id).length;

    return [
      { label: "Visible events", value: filteredEvents.length, icon: Activity },
      { label: "Errors", value: errors, icon: AlertTriangle },
      { label: "Warnings", value: warnings, icon: ShieldCheck },
      { label: "Linked entities", value: linkedEntities, icon: Layers3 }
    ];
  }, [filteredEvents]);

  const latestEvent = filteredEvents[0];

  return (
    <RoleGate allowedRoles={["admin"]}>
      <main className="min-h-screen bg-background/70">
        <header className="sticky top-0 z-30 border-b bg-background/82 backdrop-blur-xl">
          <div className="mx-auto flex min-h-16 max-w-7xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div className="flex items-center justify-between gap-3">
              <Logo />
              <Button asChild variant="outline" size="sm" className="sm:hidden">
                <Link href={"/dashboard/admin" as NextRoute}>
                  <ArrowLeft />
                  Admin
                </Link>
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button asChild variant="outline" size="sm" className="hidden sm:inline-flex">
                <Link href={"/dashboard/admin" as NextRoute}>
                  <ArrowLeft />
                  Admin dashboard
                </Link>
              </Button>
              <AccountControl />
              <ThemeToggle />
            </div>
          </div>
        </header>

        <section className="mx-auto grid max-w-7xl gap-6 px-4 py-6 sm:px-6 sm:py-8">
          <div className="grid gap-4 lg:grid-cols-[1fr_340px] lg:items-start">
            <div>
              <Badge className="border-primary/40 bg-primary/10 text-primary">Admin monitoring</Badge>
              <h1 className="mt-4 text-3xl font-black tracking-normal sm:text-5xl">Operational events viewer</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
                Review production workflow events from quote intake, auth, payments, shipment updates, dispatch, media uploads, and notification jobs.
              </p>
            </div>
            <Card className="glass">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Clock3 className="size-5 text-primary" />
                  Latest activity
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm leading-6 text-muted-foreground">
                {latestEvent ? (
                  <>
                    <div className="font-mono text-xs">{formatDate(latestEvent.created_at)}</div>
                    <div className="mt-2 font-semibold text-foreground">{latestEvent.category}</div>
                    <p className="mt-1 line-clamp-3">{latestEvent.message}</p>
                  </>
                ) : (
                  "No matching operational activity is loaded yet."
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {stats.map((stat) => (
              <Card key={stat.label} className="glass">
                <CardHeader className="flex-row items-center justify-between pb-3">
                  <CardTitle className="text-sm text-muted-foreground">{stat.label}</CardTitle>
                  <stat.icon className="size-5 text-primary" />
                </CardHeader>
                <CardContent className="font-mono text-3xl font-black">{stat.value}</CardContent>
              </Card>
            ))}
          </div>

          <Card className="glass">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Search className="size-5 text-primary" />
                Filters
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 lg:grid-cols-[repeat(5,minmax(0,1fr))_auto] lg:items-end">
              <div className="grid gap-2">
                <Label htmlFor="severity">Severity</Label>
                <select
                  id="severity"
                  value={severity}
                  onChange={(event) => setSeverity(event.target.value as SeverityFilter)}
                  className="h-11 rounded-md border bg-background/70 px-3 text-sm"
                >
                  {severityOptions.map((option) => (
                    <option key={option} value={option}>{option === "all" ? "All severities" : option}</option>
                  ))}
                </select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="category">Category</Label>
                <Input id="category" list="operational-categories" value={category} onChange={(event) => setCategory(event.target.value)} placeholder="payment, auth..." />
                <datalist id="operational-categories">
                  {categories.map((item) => <option key={item} value={item} />)}
                </datalist>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="entityType">Entity type</Label>
                <Input id="entityType" list="operational-entity-types" value={entityType} onChange={(event) => setEntityType(event.target.value)} placeholder="shipment" />
                <datalist id="operational-entity-types">
                  {entityTypes.map((item) => <option key={item} value={item} />)}
                </datalist>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="entityId">Entity ID</Label>
                <Input id="entityId" value={entityId} onChange={(event) => setEntityId(event.target.value)} placeholder="FLY-..." />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="search">Search loaded events</Label>
                <Input id="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="message text" />
              </div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
                <Button type="button" onClick={loadEvents} disabled={loading}>
                  {loading ? <Loader2 className="animate-spin" /> : <RefreshCw />}
                  Apply
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setSeverity("all");
                    setCategory("");
                    setEntityType("");
                    setEntityId("");
                    setSearch("");
                  }}
                  disabled={loading}
                >
                  Clear
                </Button>
              </div>
            </CardContent>
          </Card>

          {warning && <div className="rounded-md border border-primary/30 bg-primary/10 p-3 text-sm text-primary">{warning}</div>}
          {error && (
            <div role="alert" className="flex gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              <AlertTriangle className="size-4 shrink-0" />
              {error}
            </div>
          )}

          <Card className="glass overflow-hidden">
            <CardHeader>
              <CardTitle>Event records</CardTitle>
              <p className="text-sm text-muted-foreground">
                Showing timestamp, severity, category, message, entity type, and entity ID from <span className="font-mono">public.operational_events</span>.
              </p>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <div className="flex items-center gap-3 p-6 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin text-primary" />
                  Loading operational events...
                </div>
              ) : filteredEvents.length === 0 ? (
                <div className="p-6 text-sm text-muted-foreground">No operational events match these filters.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[860px] text-left text-sm">
                    <thead className="border-b bg-background/50 text-xs uppercase tracking-[0.16em] text-muted-foreground">
                      <tr>
                        <th className="px-4 py-3 font-semibold">Timestamp</th>
                        <th className="px-4 py-3 font-semibold">Severity</th>
                        <th className="px-4 py-3 font-semibold">Category</th>
                        <th className="px-4 py-3 font-semibold">Message</th>
                        <th className="px-4 py-3 font-semibold">Entity type</th>
                        <th className="px-4 py-3 font-semibold">Entity ID</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredEvents.map((event) => (
                        <tr key={event.id} className="border-b last:border-b-0">
                          <td className="whitespace-nowrap px-4 py-4 font-mono text-xs text-muted-foreground">{formatDate(event.created_at)}</td>
                          <td className="px-4 py-4"><Badge className={severityClass(event.severity)}>{event.severity ?? "info"}</Badge></td>
                          <td className="px-4 py-4 font-semibold">{event.category}</td>
                          <td className="max-w-md px-4 py-4 leading-6 text-muted-foreground">{event.message}</td>
                          <td className="px-4 py-4 font-mono text-xs text-muted-foreground">{event.entity_type ?? "-"}</td>
                          <td className="px-4 py-4 font-mono text-xs text-muted-foreground">{event.entity_id ?? "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </section>
      </main>
    </RoleGate>
  );
}
