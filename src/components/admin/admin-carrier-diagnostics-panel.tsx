"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, Globe2, Loader2, RefreshCw, Truck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getSupabaseBrowser } from "@/lib/supabase";

type CarrierDiagnostics = {
  environment: "staging" | "production";
  configured: boolean;
  missing: string[];
  baseUrl: string | null;
  webhookSecretConfigured?: boolean;
  connectionStatus: string;
  healthStatus: string;
  statusCode?: number | null;
  lastSyncAt?: string | null;
  lastCarrierStatus?: string | null;
  lastTrackingId?: string | null;
  lastEvent?: {
    createdAt?: string | null;
    severity?: string | null;
    message?: string | null;
    error?: string | null;
    status?: string | number | null;
  } | null;
};

type DiagnosticsResponse = {
  sendbox: CarrierDiagnostics;
  fez: CarrierDiagnostics;
};

function tone(status: string | boolean | null | undefined) {
  const normalized = String(status ?? "").toLowerCase();
  if (status === true || ["ok", "reachable", "configured", "production"].includes(normalized)) {
    return "border-emerald-500/40 bg-emerald-500/10 text-emerald-500";
  }
  if (["staging", "degraded", "not_checked"].includes(normalized)) {
    return "border-primary/40 bg-primary/10 text-primary";
  }
  return "border-destructive/40 bg-destructive/10 text-destructive";
}

function formatDate(value?: string | null) {
  if (!value) return "No sync yet";
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString() : "No sync yet";
}

export function AdminCarrierDiagnosticsPanel() {
  const [diagnostics, setDiagnostics] = useState<DiagnosticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const authHeaders = useCallback(async (): Promise<Record<string, string>> => {
    const supabase = getSupabaseBrowser();
    const { data } = supabase ? await supabase.auth.getSession() : { data: { session: null } };
    return data.session?.access_token ? { Authorization: `Bearer ${data.session.access_token}` } : {};
  }, []);

  const loadDiagnostics = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/admin/carriers/diagnostics", {
        headers: await authHeaders(),
        cache: "no-store"
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to load carrier diagnostics.");
      setDiagnostics(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load carrier diagnostics.");
    } finally {
      setLoading(false);
    }
  }, [authHeaders]);

  useEffect(() => {
    void loadDiagnostics();
  }, [loadDiagnostics]);

  const sendbox = diagnostics?.sendbox;
  const fez = diagnostics?.fez;

  function providerPanel(name: string, provider: CarrierDiagnostics | undefined, emptyLabel: string) {
    if (!provider) return null;
    return (
      <div className="rounded-md border bg-background/45 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-semibold">{name}</h3>
              <Badge className={tone(provider.configured)}>
                {provider.configured ? <CheckCircle2 className="size-3" /> : <AlertTriangle className="size-3" />}
                {provider.configured ? "Configured" : "Needs setup"}
              </Badge>
            </div>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">{provider.connectionStatus}</p>
          </div>
          <Badge className={tone(provider.environment)}>{provider.environment}</Badge>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-md border bg-background/55 p-3">
            <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Status</p>
            <p className="mt-2 text-sm font-semibold">{provider.healthStatus}</p>
          </div>
          <div className="rounded-md border bg-background/55 p-3">
            <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Environment</p>
            <p className="mt-2 text-sm font-semibold capitalize">{provider.environment}</p>
          </div>
          <div className="rounded-md border bg-background/55 p-3">
            <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Last sync</p>
            <p className="mt-2 text-sm font-semibold">{formatDate(provider.lastSyncAt)}</p>
          </div>
        </div>
        {detailsOpen && (
          <div className="mt-4 grid gap-3 border-t pt-4 text-sm text-muted-foreground md:grid-cols-2">
            <div className="rounded-md border bg-background/35 p-3">
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Endpoint</p>
              <p className="mt-2 truncate">{provider.baseUrl ?? "Base URL missing"}</p>
            </div>
            <div className="rounded-md border bg-background/35 p-3">
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Configuration detail</p>
              <p className="mt-2">
                {provider.configured ? "All required settings detected." : provider.missing.join(", ")}
              </p>
              {typeof provider.webhookSecretConfigured === "boolean" && (
                <p className="mt-1">Webhook secret {provider.webhookSecretConfigured ? "configured" : "missing"}.</p>
              )}
            </div>
            <div className="rounded-md border bg-background/35 p-3 md:col-span-2">
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Latest activity</p>
              <p className="mt-2">
                {provider.lastTrackingId ?? emptyLabel}{provider.lastCarrierStatus ? `, ${provider.lastCarrierStatus}` : ""}
              </p>
              {provider.lastEvent && (
                <p className="mt-2">
                  {provider.lastEvent.message ?? "No message"} ({formatDate(provider.lastEvent.createdAt)})
                  {provider.lastEvent.error ? ` - ${provider.lastEvent.error}${provider.lastEvent.status ? `, status ${provider.lastEvent.status}` : ""}` : ""}
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <Card className="glass mt-8">
      <CardHeader>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Truck className="size-5 text-primary" />
              Carrier integrations
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">Admin-only visibility for provider health, environment, and latest sync activity.</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button variant="outline" onClick={() => setDetailsOpen((current) => !current)} className="w-full sm:w-auto">
              <ChevronDown className={detailsOpen ? "rotate-180 transition-transform" : "transition-transform"} />
              {detailsOpen ? "Hide integration details" : "View integration details"}
            </Button>
            <Button variant="outline" onClick={loadDiagnostics} disabled={loading} className="w-full sm:w-auto">
              {loading ? <Loader2 className="animate-spin" /> : <RefreshCw />}
              Refresh
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4">
        {error && <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
        {loading && !sendbox && !fez && <div className="rounded-md border bg-background/35 p-4 text-sm text-muted-foreground">Checking carrier configuration...</div>}
        <div className="grid gap-4 xl:grid-cols-2">
          {providerPanel("FEZ Logistics", fez, "No FEZ shipment yet")}
          {providerPanel("Sendbox", sendbox, "No Sendbox shipment yet")}
        </div>
        <div className="rounded-md border bg-background/45 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h3 className="flex items-center gap-2 font-semibold">
                <Globe2 className="size-5 text-primary" />
                Future carrier network
              </h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Fly Logistics is structured to add DHL, FedEx, UPS, and additional Nigerian carriers as optional fulfillment partners. Customer tracking remains Fly Logistics branded.
              </p>
            </div>
            <Badge className="border-primary/40 bg-primary/10 text-primary">Architecture ready</Badge>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-4">
            {["DHL future", "FedEx future", "UPS future", "Easyship inactive"].map((provider) => (
              <div key={provider} className="rounded-md border bg-background/55 p-3 text-sm">
                <div className="font-semibold">{provider}</div>
                <p className="mt-1 text-xs text-muted-foreground">Enable when credentials and shipping lane support are available.</p>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
