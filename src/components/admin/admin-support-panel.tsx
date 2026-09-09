"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Headphones, Loader2, MessageCircle, RefreshCw, Search, Send, XCircle } from "lucide-react";
import { flyError, flySuccess } from "@/components/feedback/fly-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getSupabaseBrowser } from "@/lib/supabase";

type Ticket = {
  ticket_id: string;
  subject?: string | null;
  message?: string | null;
  priority?: string | null;
  status?: string | null;
  tracking_id?: string | null;
  unread_admin_count?: number | null;
  last_message_at?: string | null;
  created_at?: string | null;
  requester?: { email?: string | null; full_name?: string | null; role?: string | null } | null;
};

type Message = {
  id: string | number;
  sender_role?: string | null;
  sender_name?: string | null;
  message: string;
  created_at?: string | null;
};

async function authFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const supabase = getSupabaseBrowser();
  const { data } = supabase ? await supabase.auth.getSession() : { data: { session: null } };
  const headers = new Headers(init.headers);
  if (data.session?.access_token) headers.set("Authorization", `Bearer ${data.session.access_token}`);
  return fetch(input, { ...init, headers, cache: "no-store" });
}

function displayDate(value?: string | null) {
  return value ? new Date(value).toLocaleString() : "No activity yet";
}

export function AdminSupportPanel() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [activeTicketId, setActiveTicketId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [reply, setReply] = useState("");
  const [resolutionNotes, setResolutionNotes] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("ACTIVE");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const loadTickets = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const response = await authFetch("/api/admin/support");
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to load support tickets.");
      setTickets(data.tickets ?? []);
    } catch (error) {
      if (!quiet) flyError("Unable to load support queue", error instanceof Error ? error.message : undefined);
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  const loadThread = useCallback(async (ticketId: string, quiet = false) => {
    try {
      const response = await authFetch(`/api/admin/support/${encodeURIComponent(ticketId)}/messages`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to open support conversation.");
      setActiveTicketId(ticketId);
      setMessages(data.messages ?? []);
      setTickets((current) => current.map((ticket) => ticket.ticket_id === ticketId ? { ...ticket, unread_admin_count: 0 } : ticket));
    } catch (error) {
      if (!quiet) flyError("Unable to open ticket", error instanceof Error ? error.message : undefined);
    }
  }, []);

  useEffect(() => { void loadTickets(); }, [loadTickets]);
  useEffect(() => {
    if (!activeTicketId) return;
    const interval = window.setInterval(() => {
      void loadThread(activeTicketId, true);
      void loadTickets(true);
    }, 10_000);
    return () => window.clearInterval(interval);
  }, [activeTicketId, loadThread, loadTickets]);

  const filteredTickets = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return tickets.filter((ticket) => {
      const status = String(ticket.status ?? "OPEN").toUpperCase();
      const statusMatch = statusFilter === "ALL"
        || (statusFilter === "ACTIVE" && !["RESOLVED", "CLOSED"].includes(status))
        || status === statusFilter;
      const text = [ticket.ticket_id, ticket.subject, ticket.tracking_id, ticket.requester?.full_name, ticket.requester?.email].join(" ").toLowerCase();
      return statusMatch && (!normalizedQuery || text.includes(normalizedQuery));
    });
  }, [query, statusFilter, tickets]);

  const activeTicket = tickets.find((ticket) => ticket.ticket_id === activeTicketId) ?? null;

  async function sendReply() {
    if (!activeTicketId || !reply.trim()) return;
    setBusy("reply");
    try {
      const response = await authFetch(`/api/admin/support/${encodeURIComponent(activeTicketId)}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: reply.trim() })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to send support reply.");
      setReply("");
      flySuccess("Reply sent");
      await loadThread(activeTicketId);
      await loadTickets(true);
    } catch (error) {
      flyError("Unable to send reply", error instanceof Error ? error.message : undefined);
    } finally {
      setBusy(null);
    }
  }

  async function updateStatus(status: "OPEN" | "IN_REVIEW" | "RESOLVED" | "CLOSED") {
    if (!activeTicketId) return;
    setBusy(status);
    try {
      const response = await authFetch("/api/admin/support", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticketId: activeTicketId, status, resolutionNotes })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to update support ticket.");
      flySuccess(status === "CLOSED" ? "Ticket closed" : status === "RESOLVED" ? "Ticket resolved" : "Ticket reopened");
      await loadTickets();
    } catch (error) {
      flyError("Unable to update ticket", error instanceof Error ? error.message : undefined);
    } finally {
      setBusy(null);
    }
  }

  const activeCount = tickets.filter((ticket) => !["RESOLVED", "CLOSED"].includes(String(ticket.status ?? "").toUpperCase())).length;
  const unreadCount = tickets.reduce((sum, ticket) => sum + Number(ticket.unread_admin_count ?? 0), 0);

  return (
    <div className="grid gap-5">
      <div className="grid gap-3 sm:grid-cols-3">
        {[{ label: "Active tickets", value: activeCount }, { label: "Unread messages", value: unreadCount }, { label: "Total tickets", value: tickets.length }].map((item) => (
          <Card key={item.label} className="glass"><CardContent className="p-4"><p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{item.label}</p><p className="mt-2 text-2xl font-black">{item.value}</p></CardContent></Card>
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-[0.82fr_1.18fr]">
        <Card className="glass self-start">
          <CardHeader className="flex-row items-center justify-between"><CardTitle className="flex items-center gap-2"><Headphones className="size-5 text-primary" />Support queue</CardTitle><Button size="icon" variant="outline" title="Refresh support queue" onClick={() => void loadTickets()}><RefreshCw className={loading ? "animate-spin" : ""} /></Button></CardHeader>
          <CardContent className="grid gap-3">
            <div className="grid gap-2 sm:grid-cols-[1fr_9rem]">
              <div className="relative"><Search className="absolute left-3 top-3 size-4 text-muted-foreground" /><Input value={query} onChange={(event) => setQuery(event.target.value)} className="pl-9" placeholder="Ticket, user, tracking" /></div>
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="h-10 rounded-md border bg-background px-3 text-sm"><option value="ACTIVE">Active</option><option value="OPEN">Open</option><option value="IN_REVIEW">In review</option><option value="RESOLVED">Resolved</option><option value="CLOSED">Closed</option><option value="ALL">All</option></select>
            </div>
            <div className="grid max-h-[38rem] gap-2 overflow-y-auto pr-1">
              {filteredTickets.map((ticket) => <button key={ticket.ticket_id} type="button" onClick={() => void loadThread(ticket.ticket_id)} className={`grid gap-2 rounded-md border p-3 text-left transition hover:border-primary/50 ${activeTicketId === ticket.ticket_id ? "border-primary bg-primary/5" : ""}`}><div className="flex flex-wrap items-center justify-between gap-2"><strong className="font-mono text-sm">{ticket.ticket_id}</strong><Badge>{ticket.status ?? "OPEN"}</Badge></div><p className="text-sm font-semibold">{ticket.subject ?? "Support request"}</p><p className="text-xs text-muted-foreground">{ticket.requester?.full_name ?? ticket.requester?.email ?? "Account user"} · {ticket.requester?.role ?? "user"}</p><div className="flex items-center justify-between text-xs text-muted-foreground"><span>{displayDate(ticket.last_message_at ?? ticket.created_at)}</span>{Number(ticket.unread_admin_count ?? 0) > 0 && <Badge className="border-primary/40 bg-primary/10 text-primary">{ticket.unread_admin_count} new</Badge>}</div></button>)}
              {!loading && filteredTickets.length === 0 && <p className="rounded-md border p-4 text-sm text-muted-foreground">No tickets match these filters.</p>}
            </div>
          </CardContent>
        </Card>
        <Card className="glass min-h-[42rem]">
          <CardHeader><CardTitle className="flex items-center gap-2"><MessageCircle className="size-5 text-primary" />{activeTicket ? activeTicket.subject ?? activeTicket.ticket_id : "Open a ticket"}</CardTitle>{activeTicket && <p className="text-sm text-muted-foreground">{activeTicket.ticket_id} · {activeTicket.requester?.email ?? "Account user"}{activeTicket.tracking_id ? ` · ${activeTicket.tracking_id}` : ""}</p>}</CardHeader>
          <CardContent className="grid gap-4">
            {!activeTicket && <p className="rounded-md border p-6 text-sm text-muted-foreground">Select a ticket.</p>}
            {activeTicket && <><div className="grid max-h-[26rem] gap-3 overflow-y-auto rounded-md border bg-background/35 p-3">{messages.length === 0 && <p className="text-sm text-muted-foreground">No conversation messages yet. The opening request is: {activeTicket.message}</p>}{messages.map((message) => { const staff = message.sender_role !== "customer"; return <div key={message.id} className={`max-w-[88%] rounded-md border p-3 ${staff ? "justify-self-end bg-primary/10" : "bg-background/70"}`}><p className="text-xs font-semibold text-muted-foreground">{staff ? message.sender_name ?? "Fly Logistics support" : "Account user"}</p><p className="mt-1 whitespace-pre-wrap text-sm">{message.message}</p><p className="mt-2 text-[11px] text-muted-foreground">{displayDate(message.created_at)}</p></div>; })}</div><div className="grid gap-2 md:grid-cols-[1fr_auto]"><Input value={reply} onChange={(event) => setReply(event.target.value)} maxLength={2000} placeholder="Write a clear support reply" /><Button disabled={busy === "reply" || !reply.trim()} onClick={() => void sendReply()}>{busy === "reply" ? <Loader2 className="animate-spin" /> : <Send />}Send reply</Button></div><div className="grid gap-2 rounded-md border p-3"><Label htmlFor="supportResolutionNotes">Internal resolution notes</Label><textarea id="supportResolutionNotes" value={resolutionNotes} onChange={(event) => setResolutionNotes(event.target.value)} maxLength={2000} className="min-h-20 rounded-md border bg-background px-3 py-2 text-sm" placeholder="Optional notes for the audit trail" /><div className="flex flex-wrap gap-2"><Button variant="outline" disabled={Boolean(busy)} onClick={() => void updateStatus("OPEN")}><RefreshCw />Reopen</Button><Button variant="outline" disabled={Boolean(busy)} onClick={() => void updateStatus("IN_REVIEW")}><MessageCircle />Mark in review</Button><Button variant="outline" disabled={Boolean(busy)} onClick={() => void updateStatus("RESOLVED")}><CheckCircle2 />Resolve</Button><Button variant="destructive" disabled={Boolean(busy)} onClick={() => void updateStatus("CLOSED")}><XCircle />Close ticket</Button></div></div></>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
