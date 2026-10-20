"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { Route as NextRoute } from "next";
import { Activity, AlertTriangle, ArrowRight, Loader2, RefreshCw } from "lucide-react";
import { getSupabaseBrowser } from "@/lib/supabase";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type OperationalEvent = {
  id: number | string;
  category: string;
  severity?: string | null;
  message: string;
  entity_type?: string | null;
  entity_id?: string | null;
  ip_address?: string | null;
  created_at?: string | null;
};

function formatDate(value?: string | null) {
  if (!value) return "Unknown time";
  return new Date(value).toLocaleString();
}

function severityClass(severity?: string | null) {
  const normalized = String(severity ?? "info").toLowerCase();
  if (normalized === "error") return "border-destructive/40 bg-destructive/10 text-destructive";
  if (normalized === "warning") return "border-primary/40 bg-primary/10 text-primary";
  return "border-emerald-500/40 bg-emerald-500/10 text-emerald-500";
}

export function AdminOperationalEventsPanel() {
  const [events, setEvents] = useState<OperationalEvent[]>([]);
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
      const headers = new Headers();
      const auth = await authHeaders();
      Object.entries(auth).forEach(([key, value]) => headers.set(key, value));
      const response = await fetch("/api/admin/operational-events", { headers });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to load operational events.");
      setEvents(data.events ?? []);
      setWarning(data.warning ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load operational events.");
    } finally {
      setLoading(false);
    }
  }, [authHeaders]);

  useEffect(() => {
    void loadEvents();
  }, [loadEvents]);

  return (
    <section className="mt-8 grid gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Badge className="border-primary/40 bg-primary/10 text-primary">Monitoring</Badge>
          <h2 className="mt-3 text-2xl font-black tracking-normal sm:text-3xl">Operational event logs</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            System-level events for quote intake, payments, shipment workflows, dispatch, media, and notifications.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button type="button" variant="outline" onClick={loadEvents} disabled={loading} className="w-full sm:w-auto">
            <RefreshCw className={loading ? "animate-spin" : ""} />
            Refresh events
          </Button>
          <Button asChild className="w-full sm:w-auto">
            <Link href={"/admin/audit" as NextRoute}>
              Full viewer <ArrowRight />
            </Link>
          </Button>
        </div>
      </div>

      {warning && <div className="rounded-md border border-primary/30 bg-primary/10 p-3 text-sm text-primary">{warning}</div>}
      {error && (
        <div className="flex gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertTriangle className="size-4 shrink-0" />
          {error}
        </div>
      )}

      <Card className="glass overflow-hidden">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="size-5 text-primary" />
            Latest system events
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          {loading && (
            <div className="flex items-center gap-3 p-4 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin text-primary" />
              Loading operational events...
            </div>
          )}
          {!loading && events.length === 0 && (
            <div className="rounded-md border bg-background/40 p-4 text-sm text-muted-foreground">
              No operational events yet. Production workflow events will appear here after activity.
            </div>
          )}
          {events.map((event) => (
            <div key={event.id} className="grid gap-3 rounded-md border bg-background/40 p-4 text-sm lg:grid-cols-[1fr_auto]">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className={severityClass(event.severity)}>{event.severity ?? "info"}</Badge>
                  <Badge>{event.category}</Badge>
                  {event.entity_type && <span className="font-mono text-xs text-muted-foreground">{event.entity_type}{event.entity_id ? `:${event.entity_id}` : ""}</span>}
                </div>
                <p className="mt-2 text-muted-foreground">{event.message}</p>
                {event.ip_address && <p className="mt-1 font-mono text-xs text-muted-foreground">IP {event.ip_address}</p>}
              </div>
              <div className="font-mono text-xs text-muted-foreground lg:text-right">{formatDate(event.created_at)}</div>
            </div>
          ))}
        </CardContent>
      </Card>
    </section>
  );
}
