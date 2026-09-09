"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, FileClock, Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import { getSupabaseBrowser } from "@/lib/supabase";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type AuditLog = {
  id: number | string;
  actor_email?: string | null;
  actor_role?: string | null;
  action: string;
  entity_type: string;
  entity_id?: string | null;
  metadata?: Record<string, unknown> | null;
  ip_address?: string | null;
  created_at?: string | null;
};

function formatDate(value?: string | null) {
  if (!value) return "Unknown time";
  return new Date(value).toLocaleString();
}

function formatAction(value: string) {
  return value.replaceAll("_", " ").replaceAll(".", " / ");
}

export function AdminAuditLogPanel() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [warning, setWarning] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const authHeaders = useCallback(async () => {
    const supabase = getSupabaseBrowser();
    const { data } = supabase ? await supabase.auth.getSession() : { data: { session: null } };
    return data.session?.access_token ? { Authorization: `Bearer ${data.session.access_token}` } : {};
  }, []);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    setWarning(null);

    try {
      const headers = new Headers();
      const auth = await authHeaders();
      Object.entries(auth).forEach(([key, value]) => headers.set(key, value));
      const response = await fetch("/api/admin/audit-logs", { headers });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to load audit logs.");
      setLogs(data.logs ?? []);
      setWarning(data.warning ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load audit logs.");
    } finally {
      setLoading(false);
    }
  }, [authHeaders]);

  useEffect(() => {
    void loadLogs();
  }, [loadLogs]);

  return (
    <section className="mt-8 grid gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Badge className="border-primary/40 bg-primary/10 text-primary">Audit trail</Badge>
          <h2 className="mt-3 text-2xl font-black tracking-normal sm:text-3xl">Admin activity logs</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Operational traceability for shipment changes, dispatch recommendations, payment actions, and customer communication.
          </p>
        </div>
        <Button type="button" variant="outline" onClick={loadLogs} disabled={loading} className="w-full sm:w-auto">
          <RefreshCw className={loading ? "animate-spin" : ""} />
          Refresh logs
        </Button>
      </div>

      {warning && (
        <div className="flex gap-2 rounded-md border border-primary/30 bg-primary/10 p-3 text-sm text-primary">
          <ShieldCheck className="size-4 shrink-0" />
          {warning}
        </div>
      )}
      {error && (
        <div className="flex gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertTriangle className="size-4 shrink-0" />
          {error}
        </div>
      )}

      <Card className="glass overflow-hidden">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileClock className="size-5 text-primary" />
            Latest operational events
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          {loading && (
            <div className="flex items-center gap-3 p-4 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin text-primary" />
              Loading audit logs...
            </div>
          )}
          {!loading && logs.length === 0 && (
            <div className="rounded-md border bg-background/40 p-4 text-sm text-muted-foreground">
              No audit events yet. Admin shipment and notification actions will appear here.
            </div>
          )}
          {logs.map((log) => (
            <div key={log.id} className="grid gap-3 rounded-md border bg-background/40 p-4 text-sm lg:grid-cols-[1fr_auto]">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{formatAction(log.action)}</span>
                  <Badge>{log.actor_role ?? "system"}</Badge>
                </div>
                <p className="mt-2 text-muted-foreground">
                  {log.actor_email ?? "System"} changed {log.entity_type}
                  {log.entity_id ? ` ${log.entity_id}` : ""}.
                </p>
                {log.ip_address && <p className="mt-1 font-mono text-xs text-muted-foreground">IP {log.ip_address}</p>}
              </div>
              <div className="font-mono text-xs text-muted-foreground lg:text-right">{formatDate(log.created_at)}</div>
            </div>
          ))}
        </CardContent>
      </Card>
    </section>
  );
}
