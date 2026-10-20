"use client";

import { FormEvent, useEffect, useState } from "react";
import { CheckCircle2, Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cloudIntegrationEvents } from "@/lib/cloud-plans";

type DomainConfiguration = {
  id: string;
  hostname: string;
  status: "pending_dns" | "verified";
  verificationRecord: string;
  verificationToken: string;
};

type IntegrationConfiguration = {
  id: string;
  name: string;
  endpoint_url: string;
  event_types: string[];
};

async function apiRequest<T>(path: string, init?: RequestInit) {
  const response = await fetch(path, { ...init, cache: "no-store", headers: { "Content-Type": "application/json", ...init?.headers } });
  const data = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(data.error ?? "Unable to update Scale configuration.");
  return data;
}

export function CloudScaleFeaturesPanel({ enabled }: { enabled: boolean }) {
  const [domain, setDomain] = useState<DomainConfiguration | null>(null);
  const [hostname, setHostname] = useState("");
  const [brandingRemoved, setBrandingRemoved] = useState(false);
  const [integrations, setIntegrations] = useState<IntegrationConfiguration[]>([]);
  const [name, setName] = useState("");
  const [endpointUrl, setEndpointUrl] = useState("");
  const [eventType, setEventType] = useState<string>(cloudIntegrationEvents[0]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let current = true;
    void Promise.all([
      apiRequest<{ platformBrandingRemoved: boolean }>("/api/cloud/branding-preferences"),
      apiRequest<{ domain: DomainConfiguration | null }>("/api/cloud/custom-domain"),
      apiRequest<{ integrations: IntegrationConfiguration[] }>("/api/cloud/integrations")
    ]).then(([preferences, domainState, integrationState]) => {
      if (!current) return;
      setBrandingRemoved(preferences.platformBrandingRemoved);
      setDomain(domainState.domain);
      setHostname(domainState.domain?.hostname ?? "");
      setIntegrations(integrationState.integrations);
    }).catch((cause: unknown) => {
      if (current) setError(cause instanceof Error ? cause.message : "Unable to load Scale configuration.");
    });
    return () => { current = false; };
  }, [enabled]);

  async function perform(action: () => Promise<void>, successMessage: string) {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await action();
      setMessage(successMessage);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to update Scale configuration.");
    } finally {
      setBusy(false);
    }
  }

  async function saveBrandingPreference(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await perform(async () => {
      const result = await apiRequest<{ platformBrandingRemoved: boolean }>("/api/cloud/branding-preferences", {
        method: "PATCH",
        body: JSON.stringify({ platformBrandingRemoved: brandingRemoved })
      });
      setBrandingRemoved(result.platformBrandingRemoved);
    }, "White-label preference saved.");
  }

  async function saveDomain(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await perform(async () => {
      const result = await apiRequest<{ domain: DomainConfiguration }>("/api/cloud/custom-domain", {
        method: "PATCH",
        body: JSON.stringify({ hostname })
      });
      setDomain(result.domain);
      setHostname(result.domain.hostname);
    }, "Domain saved. Add the requested TXT record, then verify ownership.");
  }

  async function verifyDomain() {
    await perform(async () => {
      await apiRequest<{ domain: DomainConfiguration }>("/api/cloud/custom-domain", { method: "POST", body: "{}" });
      const result = await apiRequest<{ domain: DomainConfiguration }>("/api/cloud/custom-domain");
      setDomain(result.domain);
    }, "Domain ownership verified.");
  }

  async function removeDomain() {
    await perform(async () => {
      await apiRequest<{ ok: boolean }>("/api/cloud/custom-domain", { method: "DELETE" });
      setDomain(null);
      setHostname("");
    }, "Domain configuration removed.");
  }

  async function addIntegration(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await perform(async () => {
      const result = await apiRequest<{ integration: IntegrationConfiguration }>("/api/cloud/integrations", {
        method: "POST",
        body: JSON.stringify({ name, endpointUrl, eventTypes: [eventType] })
      });
      setIntegrations((current) => [result.integration, ...current]);
      setName("");
      setEndpointUrl("");
    }, "Integration configuration saved; outbound delivery is not enabled.");
  }

  async function removeIntegration(integrationId: string) {
    await perform(async () => {
      await apiRequest<{ ok: boolean }>(`/api/cloud/integrations/${encodeURIComponent(integrationId)}`, { method: "DELETE" });
      setIntegrations((current) => current.filter((integration) => integration.id !== integrationId));
    }, "Integration configuration removed.");
  }

  return (
    <Card className="glass">
      <CardHeader>
        <CardTitle>Scale white-label and integrations</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-6">
        {!enabled ? (
          <p className="rounded-md border p-3 text-sm text-muted-foreground">Custom domains, platform-branding removal, and custom integrations require an active Scale entitlement.</p>
        ) : (
          <>
            <form className="grid gap-3 rounded-md border p-4" onSubmit={saveBrandingPreference}>
              <div>
                <h3 className="font-bold">Platform branding removal</h3>
                <p className="text-sm text-muted-foreground">Applies to the public customer tracking portal only.</p>
              </div>
              <label className="flex min-h-11 items-center gap-3">
                <input type="checkbox" checked={brandingRemoved} onChange={(event) => setBrandingRemoved(event.target.checked)} />
                <span>Remove “Powered by Fly Logistics Cloud”</span>
              </label>
              <Button type="submit" variant="outline" disabled={busy}>Save white-label preference</Button>
            </form>

            <form className="grid gap-3 rounded-md border p-4" onSubmit={saveDomain}>
              <div>
                <h3 className="font-bold">Custom domain</h3>
                <p className="text-sm text-muted-foreground">Configure a hostname and prove control with a DNS TXT record. DNS and provider settings are not changed automatically.</p>
              </div>
              <Label htmlFor="scaleCustomDomain">Hostname</Label>
              <Input id="scaleCustomDomain" value={hostname} onChange={(event) => setHostname(event.target.value)} placeholder="tracking.example.com" required />
              <div className="flex flex-wrap gap-2">
                <Button type="submit" variant="outline" disabled={busy}><CheckCircle2 />Save domain</Button>
                {domain && <Button type="button" variant="outline" disabled={busy || domain.status === "verified"} onClick={() => void verifyDomain()}>Verify DNS</Button>}
                {domain && <Button type="button" variant="destructive" disabled={busy} onClick={() => void removeDomain()}><Trash2 />Remove domain</Button>}
              </div>
              {domain && <div className="overflow-hidden rounded-md border bg-background/45 p-3 text-sm">
                <p>Status: <strong>{domain.status === "verified" ? "Verified" : "Pending DNS verification"}</strong></p>
                {domain.status !== "verified" && <dl className="mt-2 grid gap-1 break-all">
                  <dt className="font-semibold">TXT record name</dt><dd>{domain.verificationRecord}</dd>
                  <dt className="font-semibold">TXT record value</dt><dd>{domain.verificationToken}</dd>
                </dl>}
              </div>}
            </form>

            <form className="grid gap-3 rounded-md border p-4" onSubmit={addIntegration}>
              <div>
                <h3 className="font-bold">Custom integration configuration</h3>
                <p className="text-sm text-muted-foreground">Configuration is tenant-private and stored without credentials. Outbound webhook delivery is disabled.</p>
              </div>
              <Label htmlFor="integrationName">Name</Label>
              <Input id="integrationName" value={name} onChange={(event) => setName(event.target.value)} maxLength={80} required />
              <Label htmlFor="integrationEndpoint">HTTPS endpoint</Label>
              <Input id="integrationEndpoint" type="url" value={endpointUrl} onChange={(event) => setEndpointUrl(event.target.value)} placeholder="https://hooks.example.com/fly" required />
              <Label htmlFor="integrationEvent">Event</Label>
              <select id="integrationEvent" className="min-h-11 rounded-md border bg-background px-3" value={eventType} onChange={(event) => setEventType(event.target.value)}>
                {cloudIntegrationEvents.map((event) => <option key={event} value={event}>{event}</option>)}
              </select>
              <Button type="submit" disabled={busy}><Plus />Add configuration</Button>
              <ul className="grid gap-2">
                {integrations.map((integration) => <li key={integration.id} className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-md border p-3">
                  <div className="min-w-0">
                    <p className="font-semibold">{integration.name}</p>
                    <p className="break-all text-sm text-muted-foreground">{integration.endpoint_url}</p>
                    <p className="text-xs text-muted-foreground">{integration.event_types.join(", ")} · Delivery disabled</p>
                  </div>
                  <Button type="button" variant="destructive" disabled={busy} onClick={() => void removeIntegration(integration.id)} aria-label={`Remove ${integration.name}`}><Trash2 /></Button>
                </li>)}
              </ul>
            </form>
          </>
        )}
        {busy && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />Saving Scale configuration</p>}
        {message && <p role="status" className="text-sm text-emerald-600">{message}</p>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}
