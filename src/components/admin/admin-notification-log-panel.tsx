"use client";

import { useCallback, useEffect, useState } from "react";
import { Activity, AlertTriangle, CheckCircle2, Loader2, Mail, Megaphone, MessageCircle, RefreshCw, Send, Smartphone } from "lucide-react";
import { getSupabaseBrowser } from "@/lib/supabase";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type NotificationLog = {
  id: number | string;
  channel: string;
  provider: string;
  workflow: string;
  recipient?: string | null;
  message_body?: string | null;
  status: string;
  provider_message_id?: string | null;
  external_message_id?: string | null;
  provider_status?: string | null;
  error_message?: string | null;
  entity_type?: string | null;
  entity_id?: string | null;
  created_at?: string | null;
  sent_at?: string | null;
  delivered_at?: string | null;
  read_at?: string | null;
};

type NotificationHealth = {
  email?: { configured: boolean; status: string; sender?: string };
  whatsapp?: {
    configured: boolean;
    status: string;
    graphVersion?: string;
    connection?: "connected" | "failed" | "not_configured";
    appSecretConfigured?: boolean;
    webhookVerifyTokenConfigured?: boolean;
    verifiedName?: string | null;
    displayPhoneNumber?: string | null;
    qualityRating?: string | null;
    reason?: string;
  };
  sms?: { configured: boolean; status: string; senderId?: string };
  latestMessages?: Array<{ channel: string; provider: string; status: string; created_at?: string | null; sent_at?: string | null }>;
  warning?: string | null;
};

function statusClass(status: string) {
  const normalized = status.toUpperCase();
  if (normalized === "SENT" || normalized === "QUEUED" || normalized === "LINK_READY" || normalized === "DELIVERED" || normalized === "READ") {
    return "border-emerald-500/40 bg-emerald-500/10 text-emerald-500";
  }
  if (normalized === "NOT_CONFIGURED") return "border-primary/40 bg-primary/10 text-primary";
  return "border-destructive/40 bg-destructive/10 text-destructive";
}

function formatDate(value?: string | null) {
  if (!value) return "Unknown time";
  return new Date(value).toLocaleString();
}

export function AdminNotificationLogPanel() {
  const [messages, setMessages] = useState<NotificationLog[]>([]);
  const [warning, setWarning] = useState<string | null>(null);
  const [health, setHealth] = useState<NotificationHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [resendingId, setResendingId] = useState<number | string | null>(null);
  const [broadcasting, setBroadcasting] = useState(false);
  const [broadcastMessage, setBroadcastMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [broadcastForm, setBroadcastForm] = useState({
    title: "",
    body: "",
    audience: "all_customers",
    severity: "info",
    email: true,
    whatsapp: false,
    inApp: true
  });

  const authHeaders = useCallback(async () => {
    const supabase = getSupabaseBrowser();
    const { data } = supabase ? await supabase.auth.getSession() : { data: { session: null } };
    return data.session?.access_token ? { Authorization: `Bearer ${data.session.access_token}` } : {};
  }, []);

  const loadMessages = useCallback(async () => {
    setLoading(true);
    setError(null);
    setWarning(null);

    try {
      const headers = new Headers();
      const auth = await authHeaders();
      Object.entries(auth).forEach(([key, value]) => headers.set(key, value));
      const response = await fetch("/api/admin/notification-messages", { headers });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to load notification logs.");
      setMessages(data.messages ?? []);
      setWarning(data.warning ?? null);
      const healthResponse = await fetch("/api/admin/notifications/health", { headers });
      const healthData = await healthResponse.json();
      if (healthResponse.ok) setHealth(healthData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load notification logs.");
    } finally {
      setLoading(false);
    }
  }, [authHeaders]);

  useEffect(() => {
    void loadMessages();
  }, [loadMessages]);

  async function resendMessage(messageId: number | string) {
    setResendingId(messageId);
    setError(null);

    try {
      const headers = new Headers({ "Content-Type": "application/json" });
      const auth = await authHeaders();
      Object.entries(auth).forEach(([key, value]) => headers.set(key, value));
      const response = await fetch("/api/notifications/resend", {
        method: "POST",
        headers,
        body: JSON.stringify({ messageId })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to resend notification.");
      await loadMessages();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to resend notification.");
    } finally {
      setResendingId(null);
    }
  }

  function updateBroadcastField(field: keyof typeof broadcastForm, value: string | boolean) {
    setBroadcastForm((current) => ({ ...current, [field]: value }));
  }

  async function sendBroadcast() {
    setBroadcasting(true);
    setBroadcastMessage(null);
    setError(null);

    try {
      const channels = [
        broadcastForm.inApp ? "in_app" : null,
        broadcastForm.email ? "email" : null,
        broadcastForm.whatsapp ? "whatsapp" : null
      ].filter(Boolean);
      const headers = new Headers({ "Content-Type": "application/json" });
      const auth = await authHeaders();
      Object.entries(auth).forEach(([key, value]) => headers.set(key, value));
      const response = await fetch("/api/admin/notifications/broadcast", {
        method: "POST",
        headers,
        body: JSON.stringify({
          title: broadcastForm.title,
          body: broadcastForm.body,
          audience: broadcastForm.audience,
          severity: broadcastForm.severity,
          channels
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to send broadcast.");
      setBroadcastMessage(`Broadcast sent to ${data.total} customers. ${data.success} succeeded, ${data.failed} failed.`);
      setBroadcastForm((current) => ({ ...current, title: "", body: "" }));
      await loadMessages();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to send broadcast.");
    } finally {
      setBroadcasting(false);
    }
  }

  return (
    <section className="mt-8 grid gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Badge className="border-primary/40 bg-primary/10 text-primary">Notification center</Badge>
          <h2 className="mt-3 text-2xl font-black tracking-normal sm:text-3xl">Notification message logs</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Provider-level status for quote, shipment, wallet, account, delivery, WhatsApp, and SMS workflows.
          </p>
        </div>
        <Button type="button" variant="outline" onClick={loadMessages} disabled={loading} className="w-full sm:w-auto">
          <RefreshCw className={loading ? "animate-spin" : ""} />
          Refresh messages
        </Button>
      </div>

      {warning && <div className="rounded-md border border-primary/30 bg-primary/10 p-3 text-sm text-primary">{warning}</div>}
      {health && (
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-md border bg-background/40 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Mail className="size-4 text-primary" />
              Resend email
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Badge className={health.email?.configured ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-500" : "border-primary/40 bg-primary/10 text-primary"}>
                {health.email?.configured ? "Configured" : "Setup needed"}
              </Badge>
              {health.email?.sender && <Badge>{health.email.sender}</Badge>}
            </div>
          </div>
          <div className="rounded-md border bg-background/40 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <MessageCircle className="size-4 text-primary" />
              WhatsApp Cloud API
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Badge className={health.whatsapp?.connection === "connected" ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-500" : "border-primary/40 bg-primary/10 text-primary"}>
                {health.whatsapp?.connection === "connected" ? "Meta connected" : health.whatsapp?.configured ? "Connection check failed" : "Setup needed"}
              </Badge>
              {health.whatsapp?.graphVersion && <Badge>{health.whatsapp.graphVersion}</Badge>}
              {health.whatsapp?.qualityRating && <Badge>{health.whatsapp.qualityRating}</Badge>}
            </div>
            {(health.whatsapp?.verifiedName || health.whatsapp?.displayPhoneNumber) && (
              <p className="mt-3 text-xs text-muted-foreground">
                {[health.whatsapp.verifiedName, health.whatsapp.displayPhoneNumber].filter(Boolean).join(" · ")}
              </p>
            )}
            {!health.whatsapp?.appSecretConfigured && (
              <p className="mt-3 text-xs text-destructive">Add the Meta app secret in Vercel to activate secure inbound chat and delivery receipts.</p>
            )}
            {health.whatsapp?.reason && <p className="mt-2 text-xs text-destructive">{health.whatsapp.reason}</p>}
          </div>
          <div className="rounded-md border bg-background/40 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Smartphone className="size-4 text-primary" />
              Termii SMS
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Badge className={health.sms?.configured ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-500" : "border-primary/40 bg-primary/10 text-primary"}>
                {health.sms?.configured ? "Configured" : "Setup needed"}
              </Badge>
              {health.sms?.senderId && <Badge>{health.sms.senderId}</Badge>}
            </div>
          </div>
        </div>
      )}
      {error && (
        <div className="flex gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertTriangle className="size-4 shrink-0" />
          {error}
        </div>
      )}
      {broadcastMessage && (
        <div className="flex gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-500">
          <CheckCircle2 className="size-4 shrink-0" />
          {broadcastMessage}
        </div>
      )}

      <Card className="glass">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Megaphone className="size-5 text-primary" />
            Broadcast announcement or service alert
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-3 md:grid-cols-2">
            <input
              value={broadcastForm.title}
              onChange={(event) => updateBroadcastField("title", event.target.value)}
              placeholder="Message title"
              className="h-11 rounded-md border bg-background/70 px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <select
                value={broadcastForm.audience}
                onChange={(event) => updateBroadcastField("audience", event.target.value)}
                className="h-11 rounded-md border bg-background/70 px-3 text-sm"
              >
                <option value="all_customers">All customers</option>
                <option value="customers_with_shipments">Customers with shipments</option>
                <option value="customers_with_quotes">Customers with quotes</option>
              </select>
              <select
                value={broadcastForm.severity}
                onChange={(event) => updateBroadcastField("severity", event.target.value)}
                className="h-11 rounded-md border bg-background/70 px-3 text-sm"
              >
                <option value="info">Announcement</option>
                <option value="warning">Service alert</option>
              </select>
            </div>
          </div>
          <textarea
            value={broadcastForm.body}
            onChange={(event) => updateBroadcastField("body", event.target.value)}
            placeholder="Write the customer-facing message. Keep it clear and operational."
            className="min-h-28 rounded-md border bg-background/70 px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary"
          />
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap gap-2 text-sm">
              {[
                ["inApp", "In-app"],
                ["email", "Email"],
                ["whatsapp", "WhatsApp"]
              ].map(([field, label]) => (
                <label key={field} className="flex items-center gap-2 rounded-md border bg-background/40 px-3 py-2">
                  <input
                    type="checkbox"
                    checked={Boolean(broadcastForm[field as keyof typeof broadcastForm])}
                    onChange={(event) => updateBroadcastField(field as keyof typeof broadcastForm, event.target.checked)}
                  />
                  {label}
                </label>
              ))}
            </div>
            <Button type="button" onClick={() => void sendBroadcast()} disabled={broadcasting || !broadcastForm.title.trim() || !broadcastForm.body.trim()} className="w-full lg:w-auto">
              {broadcasting ? <Loader2 className="animate-spin" /> : <Send />}
              Send broadcast
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="glass overflow-hidden">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageCircle className="size-5 text-primary" />
            Latest notification workflow messages
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          {loading && (
            <div className="flex items-center gap-3 p-4 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin text-primary" />
              Loading notification logs...
            </div>
          )}
          {!loading && messages.length === 0 && (
            <div className="rounded-md border bg-background/40 p-4 text-sm text-muted-foreground">
              No notification message logs yet.
            </div>
          )}
          {messages.map((message) => (
            <div key={message.id} className="grid gap-3 rounded-md border bg-background/40 p-4 text-sm lg:grid-cols-[1fr_auto]">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className={statusClass(message.status)}>{message.status}</Badge>
                  <Badge className="border-primary/40 bg-primary/10 text-primary">{message.channel}</Badge>
                  <Badge>{message.provider}</Badge>
                  <Badge>{message.workflow.replaceAll("_", " ")}</Badge>
                </div>
                <p className="mt-2 text-muted-foreground">
                  {message.recipient ? `To ${message.recipient}` : "No recipient stored"}
                  {message.entity_type ? ` for ${message.entity_type} ${message.entity_id ?? ""}` : ""}.
                </p>
                {message.message_body && <p className="mt-2 max-w-3xl text-xs leading-5 text-muted-foreground">{message.message_body}</p>}
                {message.error_message && <p className="mt-1 text-xs text-destructive">{message.error_message}</p>}
                {(message.external_message_id ?? message.provider_message_id) && <p className="mt-1 font-mono text-xs text-muted-foreground">{message.external_message_id ?? message.provider_message_id}</p>}
                {(message.delivered_at || message.read_at) && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {message.delivered_at ? `Delivered ${formatDate(message.delivered_at)}. ` : ""}
                    {message.read_at ? `Read ${formatDate(message.read_at)}.` : ""}
                  </p>
                )}
              </div>
              <div className="grid gap-2 lg:justify-items-end">
                <div className="font-mono text-xs text-muted-foreground lg:text-right">{formatDate(message.sent_at ?? message.created_at)}</div>
                {["FAILED", "NOT_CONFIGURED"].includes(message.status?.toUpperCase?.() ?? "") && (
                  <Button type="button" size="sm" variant="outline" onClick={() => void resendMessage(message.id)} disabled={resendingId === message.id}>
                    {resendingId === message.id ? <Loader2 className="animate-spin" /> : <Send />}
                    Resend
                  </Button>
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
      {health?.latestMessages?.length ? (
        <div className="rounded-md border bg-background/40 p-4 text-xs text-muted-foreground">
          <div className="mb-2 flex items-center gap-2 font-semibold text-foreground">
            <Activity className="size-4 text-primary" />
            Latest provider activity
          </div>
          {health.latestMessages.slice(0, 3).map((item, index) => (
            <p key={`${item.channel}-${item.provider}-${item.created_at ?? index}`}>
              {item.channel} via {item.provider}: {item.status} at {formatDate(item.sent_at ?? item.created_at)}
            </p>
          ))}
        </div>
      ) : null}
    </section>
  );
}
