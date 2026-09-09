"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Bot, CheckCircle2, Loader2, MessageCircle, RefreshCw, Search, Send, UserRoundCheck } from "lucide-react";
import { getSupabaseBrowser } from "@/lib/supabase";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Conversation = {
  id: string;
  customer_phone: string;
  customer_name?: string | null;
  status?: string | null;
  human_state?: string | null;
  shipment_tracking_id?: string | null;
  quote_request_id?: string | null;
  last_message_at?: string | null;
  unread_count?: number | null;
};

type InboxMessage = {
  id: string;
  conversation_id: string;
  direction: "inbound" | "outbound";
  message_type?: string | null;
  sender?: string | null;
  recipient?: string | null;
  content?: string | null;
  status?: string | null;
  created_at?: string | null;
  sent_at?: string | null;
  delivered_at?: string | null;
  read_at?: string | null;
  failed_at?: string | null;
  error_message?: string | null;
};

function formatTime(value?: string | null) {
  if (!value) return "No activity yet";
  return new Date(value).toLocaleString();
}

function statusTone(status?: string | null) {
  const normalized = String(status ?? "").toLowerCase();
  if (normalized === "resolved" || normalized === "read" || normalized === "delivered" || normalized === "sent") {
    return "border-emerald-500/40 bg-emerald-500/10 text-emerald-500";
  }
  if (normalized === "failed") return "border-destructive/40 bg-destructive/10 text-destructive";
  return "border-primary/40 bg-primary/10 text-primary";
}

export function AdminWhatsAppInbox() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<InboxMessage[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [reply, setReply] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selected = useMemo(() => conversations.find((item) => item.id === selectedId) ?? null, [conversations, selectedId]);

  const authHeaders = useCallback(async () => {
    const supabase = getSupabaseBrowser();
    const { data } = supabase ? await supabase.auth.getSession() : { data: { session: null } };
    return data.session?.access_token ? { Authorization: `Bearer ${data.session.access_token}` } : {};
  }, []);

  const loadInbox = useCallback(async (conversationId?: string | null) => {
    setLoading(true);
    setError(null);
    try {
      const headers = new Headers();
      const auth = await authHeaders();
      Object.entries(auth).forEach(([key, value]) => headers.set(key, value));
      const params = new URLSearchParams();
      if (conversationId) params.set("conversationId", conversationId);
      if (search.trim()) params.set("search", search.trim());
      if (status !== "all") params.set("status", status);

      const response = await fetch(`/api/admin/whatsapp?${params.toString()}`, { headers });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to load WhatsApp inbox.");
      setConversations(data.conversations ?? []);
      setSelectedId(data.selectedConversationId ?? data.conversations?.[0]?.id ?? null);
      setMessages(data.messages ?? []);
      if (data.warning) setNotice(data.warning);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load WhatsApp inbox.");
    } finally {
      setLoading(false);
    }
  }, [authHeaders, search, status]);

  useEffect(() => {
    void loadInbox(selectedId);
    const interval = window.setInterval(() => void loadInbox(selectedId), 25_000);
    return () => window.clearInterval(interval);
  }, [loadInbox, selectedId]);

  async function postAction(action?: "resolve" | "reopen" | "human_required" | "ai_active") {
    if (!selectedId) return;
    setSending(true);
    setError(null);
    setNotice(null);
    try {
      const headers = new Headers({ "Content-Type": "application/json" });
      const auth = await authHeaders();
      Object.entries(auth).forEach(([key, value]) => headers.set(key, value));
      const response = await fetch("/api/admin/whatsapp", {
        method: "POST",
        headers,
        body: JSON.stringify({
          conversationId: selectedId,
          message: reply.trim() || undefined,
          action
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to update WhatsApp conversation.");
      setReply("");
      setNotice(reply.trim() ? "Reply sent through Fly Logistics WhatsApp." : "Conversation updated.");
      await loadInbox(selectedId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update WhatsApp conversation.");
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="grid gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Badge className="border-primary/40 bg-primary/10 text-primary">WhatsApp inbox</Badge>
          <h2 className="mt-3 text-2xl font-black tracking-normal sm:text-3xl">Customer conversations</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
            Review inbound WhatsApp messages, handle human escalations, and reply from a protected Fly Logistics workspace.
          </p>
        </div>
        <Button type="button" variant="outline" onClick={() => void loadInbox(selectedId)} disabled={loading}>
          <RefreshCw className={loading ? "animate-spin" : ""} />
          Refresh
        </Button>
      </div>

      {notice && (
        <div className="flex gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-500">
          <CheckCircle2 className="size-4 shrink-0" />
          {notice}
        </div>
      )}
      {error && (
        <div className="flex gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertTriangle className="size-4 shrink-0" />
          {error}
        </div>
      )}

      <Card className="glass">
        <CardContent className="grid gap-3 p-4 md:grid-cols-[1fr_220px_160px]">
          <label className="flex items-center gap-2 rounded-md border bg-background/60 px-3">
            <Search className="size-4 text-muted-foreground" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void loadInbox(null);
              }}
              placeholder="Search phone, name, tracking ID"
              className="h-11 w-full bg-transparent text-sm outline-none"
            />
          </label>
          <select value={status} onChange={(event) => setStatus(event.target.value)} className="h-11 rounded-md border bg-background/70 px-3 text-sm">
            <option value="all">All conversations</option>
            <option value="open">Open</option>
            <option value="resolved">Resolved</option>
          </select>
          <Button type="button" onClick={() => void loadInbox(null)}>Apply filters</Button>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[380px_1fr]">
        <Card className="glass overflow-hidden">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageCircle className="size-5 text-primary" />
              Conversations
            </CardTitle>
          </CardHeader>
          <CardContent className="grid max-h-[680px] gap-2 overflow-y-auto p-3">
            {loading && conversations.length === 0 ? (
              <div className="flex items-center gap-2 rounded-md border bg-background/40 p-4 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin text-primary" />
                Loading conversations...
              </div>
            ) : null}
            {!loading && conversations.length === 0 ? (
              <div className="rounded-md border bg-background/40 p-4 text-sm text-muted-foreground">
                No WhatsApp conversations yet. New inbound messages will appear here after Meta sends webhook events.
              </div>
            ) : null}
            {conversations.map((conversation) => (
              <button
                key={conversation.id}
                type="button"
                onClick={() => {
                  setSelectedId(conversation.id);
                  void loadInbox(conversation.id);
                }}
                className={`rounded-md border p-3 text-left transition ${
                  conversation.id === selectedId ? "border-primary/50 bg-primary/10" : "bg-background/40 hover:border-primary/30"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate font-semibold">{conversation.customer_name || conversation.customer_phone}</div>
                    <div className="mt-1 text-xs text-muted-foreground">{conversation.customer_phone}</div>
                  </div>
                  {conversation.unread_count ? <Badge className="bg-primary text-primary-foreground">{conversation.unread_count}</Badge> : null}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Badge className={statusTone(conversation.status)}>{conversation.status ?? "open"}</Badge>
                  <Badge>{conversation.human_state === "human_required" ? "Human" : "AI active"}</Badge>
                  {conversation.shipment_tracking_id ? <Badge>{conversation.shipment_tracking_id}</Badge> : null}
                </div>
                <div className="mt-2 text-xs text-muted-foreground">{formatTime(conversation.last_message_at)}</div>
              </button>
            ))}
          </CardContent>
        </Card>

        <Card className="glass overflow-hidden">
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center gap-2">
              <UserRoundCheck className="size-5 text-primary" />
              {selected ? selected.customer_name || selected.customer_phone : "Select a conversation"}
              {selected ? <Badge className={statusTone(selected.status)}>{selected.status ?? "open"}</Badge> : null}
            </CardTitle>
            {selected?.shipment_tracking_id ? <p className="text-sm text-muted-foreground">Linked tracking ID: {selected.shipment_tracking_id}</p> : null}
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid max-h-[520px] gap-3 overflow-y-auto rounded-md border bg-background/35 p-3">
              {!selected ? (
                <div className="rounded-md border bg-background/40 p-4 text-sm text-muted-foreground">Choose a WhatsApp conversation to see its message history.</div>
              ) : messages.length === 0 ? (
                <div className="rounded-md border bg-background/40 p-4 text-sm text-muted-foreground">No messages stored for this conversation yet.</div>
              ) : (
                messages.map((message) => (
                  <div
                    key={message.id}
                    className={`max-w-[86%] rounded-md border p-3 text-sm ${
                      message.direction === "outbound" ? "ml-auto bg-primary/10" : "mr-auto bg-background/70"
                    }`}
                  >
                    <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <Badge className={statusTone(message.status)}>{message.status ?? "received"}</Badge>
                      <span>{message.direction === "outbound" ? "Fly Logistics" : message.sender ?? "Customer"}</span>
                      <span>{formatTime(message.sent_at ?? message.created_at)}</span>
                    </div>
                    <p className="whitespace-pre-wrap leading-6">{message.content}</p>
                    {message.error_message ? <p className="mt-2 text-xs text-destructive">{message.error_message}</p> : null}
                  </div>
                ))
              )}
            </div>

            <div className="grid gap-3">
              <textarea
                value={reply}
                onChange={(event) => setReply(event.target.value)}
                placeholder="Reply as Fly Logistics support..."
                className="min-h-28 rounded-md border bg-background/70 px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary"
                disabled={!selected || sending}
              />
              <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex flex-wrap gap-2">
                  <Button type="button" size="sm" variant="outline" disabled={!selected || sending} onClick={() => void postAction("human_required")}>
                    <UserRoundCheck />
                    Human takeover
                  </Button>
                  <Button type="button" size="sm" variant="outline" disabled={!selected || sending} onClick={() => void postAction("ai_active")}>
                    <Bot />
                    Return to AI
                  </Button>
                  <Button type="button" size="sm" variant="outline" disabled={!selected || sending} onClick={() => void postAction("resolve")}>
                    Resolve
                  </Button>
                  <Button type="button" size="sm" variant="outline" disabled={!selected || sending} onClick={() => void postAction("reopen")}>
                    Reopen
                  </Button>
                </div>
                <Button type="button" disabled={!selected || sending || !reply.trim()} onClick={() => void postAction()}>
                  {sending ? <Loader2 className="animate-spin" /> : <Send />}
                  Send reply
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
