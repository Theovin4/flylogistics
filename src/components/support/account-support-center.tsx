"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Headphones, Loader2, MessageSquare, Plus, RefreshCw, Send } from "lucide-react";
import { flyError, flySuccess } from "@/components/feedback/fly-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getSupabaseBrowser } from "@/lib/supabase";

type Ticket = { ticket_id: string; subject?: string | null; status?: string | null; priority?: string | null; unread_customer_count?: number | null; updated_at?: string | null; created_at?: string | null };
type Message = { id: number | string; sender_role?: string | null; sender_name?: string | null; message?: string | null; created_at?: string | null };

async function authFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const supabase = getSupabaseBrowser();
  const { data } = supabase ? await supabase.auth.getSession() : { data: { session: null } };
  const headers = new Headers(init.headers);
  if (data.session?.access_token) headers.set("Authorization", `Bearer ${data.session.access_token}`);
  return fetch(input, { ...init, headers, cache: "no-store" });
}

export function AccountSupportCenter({
  accountLabel = "account",
  businessAccountId,
  portal = "customer"
}: {
  accountLabel?: string;
  businessAccountId?: number | string | null;
  portal?: "customer" | "merchant" | "cloud" | "driver" | "dispatcher";
}) {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [activeTicket, setActiveTicket] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [subject, setSubject] = useState("");
  const [openingMessage, setOpeningMessage] = useState("");
  const [reply, setReply] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const loadTickets = useCallback(async () => {
    setLoading(true);
    try {
      const response = await authFetch("/api/customer/support");
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to load support tickets.");
      setTickets(data.tickets ?? []);
    } catch (error) {
      flyError("Unable to load support", error instanceof Error ? error.message : undefined);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadThread = useCallback(async (ticketId: string, quiet = false) => {
    try {
      const response = await authFetch(`/api/customer/support/${encodeURIComponent(ticketId)}/messages`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to load this conversation.");
      setActiveTicket(ticketId);
      setMessages(data.messages ?? []);
      setTickets((current) => current.map((ticket) => ticket.ticket_id === ticketId ? { ...ticket, unread_customer_count: 0 } : ticket));
    } catch (error) {
      if (!quiet) flyError("Unable to open conversation", error instanceof Error ? error.message : undefined);
    }
  }, []);

  useEffect(() => { void loadTickets(); }, [loadTickets]);
  useEffect(() => {
    if (!activeTicket) return;
    const interval = window.setInterval(() => void loadThread(activeTicket, true), 15_000);
    return () => window.clearInterval(interval);
  }, [activeTicket, loadThread]);

  async function createTicket(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      const response = await authFetch("/api/customer/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject,
          message: openingMessage,
          priority: "NORMAL",
          ticketType: "support",
          businessAccountId: businessAccountId ?? undefined,
          portal
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to open support ticket.");
      setSubject("");
      setOpeningMessage("");
      flySuccess("Support ticket opened");
      await loadTickets();
      if (data.ticket_id) await loadThread(data.ticket_id);
    } catch (error) {
      flyError("Unable to open support ticket", error instanceof Error ? error.message : undefined);
    } finally {
      setBusy(false);
    }
  }

  async function sendReply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeTicket || !reply.trim()) return;
    setBusy(true);
    try {
      const response = await authFetch(`/api/customer/support/${encodeURIComponent(activeTicket)}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: reply })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to send support message.");
      setReply("");
      flySuccess("Message sent");
      await loadThread(activeTicket);
    } catch (error) {
      flyError("Unable to send message", error instanceof Error ? error.message : undefined);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
      <div className="grid gap-4 self-start">
        <Card className="glass">
          <CardHeader><CardTitle className="flex items-center gap-2"><Headphones className="size-5 text-primary" />Open a support ticket</CardTitle></CardHeader>
          <CardContent>
            <form className="grid gap-3" onSubmit={createTicket}>
              <div className="grid gap-1"><Label htmlFor={`${accountLabel}-support-subject`}>Subject</Label><Input id={`${accountLabel}-support-subject`} value={subject} onChange={(event) => setSubject(event.target.value)} minLength={3} maxLength={160} required /></div>
              <div className="grid gap-1"><Label htmlFor={`${accountLabel}-support-message`}>How can we help?</Label><textarea id={`${accountLabel}-support-message`} className="min-h-28 rounded-md border bg-background px-3 py-2 text-sm" value={openingMessage} onChange={(event) => setOpeningMessage(event.target.value)} minLength={8} maxLength={2000} required /></div>
              <Button disabled={busy}>{busy ? <Loader2 className="animate-spin" /> : <Plus />}Open ticket</Button>
            </form>
          </CardContent>
        </Card>
        <Card className="glass">
          <CardHeader className="flex-row items-center justify-between"><CardTitle>Your tickets</CardTitle><Button size="icon" variant="outline" title="Refresh tickets" onClick={() => void loadTickets()}><RefreshCw className={loading ? "animate-spin" : ""} /></Button></CardHeader>
          <CardContent className="grid gap-2">
            {tickets.map((ticket) => <button key={ticket.ticket_id} type="button" onClick={() => void loadThread(ticket.ticket_id)} className={`grid gap-1 rounded-md border p-3 text-left transition hover:border-primary/50 ${activeTicket === ticket.ticket_id ? "border-primary bg-primary/5" : ""}`}><span className="flex items-center justify-between gap-2"><strong className="font-mono text-sm">{ticket.ticket_id}</strong><Badge>{ticket.status ?? "OPEN"}</Badge></span><span className="text-sm">{ticket.subject ?? "Support request"}</span>{Number(ticket.unread_customer_count ?? 0) > 0 && <span className="text-xs font-semibold text-primary">New reply available</span>}</button>)}
            {!loading && tickets.length === 0 && <p className="rounded-md border p-4 text-sm text-muted-foreground">No support tickets yet.</p>}
          </CardContent>
        </Card>
      </div>
      <Card className="glass min-h-[34rem]">
        <CardHeader><CardTitle className="flex items-center gap-2"><MessageSquare className="size-5 text-primary" />{activeTicket ? `Conversation ${activeTicket}` : "Support conversation"}</CardTitle></CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid max-h-[28rem] gap-3 overflow-y-auto pr-1">
            {messages.map((message) => { const customer = message.sender_role === "customer"; return <div key={message.id} className={`max-w-[88%] rounded-md border p-3 ${customer ? "justify-self-end bg-primary/10" : "bg-background/50"}`}><div className="text-xs font-semibold text-muted-foreground">{customer ? "You" : "Fly Logistics support"}</div><p className="mt-1 whitespace-pre-wrap text-sm">{message.message}</p>{message.created_at && <div className="mt-2 text-[11px] text-muted-foreground">{new Date(message.created_at).toLocaleString()}</div>}</div>; })}
            {activeTicket && messages.length === 0 && <p className="text-sm text-muted-foreground">No messages in this conversation yet.</p>}
            {!activeTicket && <p className="rounded-md border p-5 text-sm text-muted-foreground">Select a ticket.</p>}
          </div>
          {activeTicket && <form className="flex gap-2" onSubmit={sendReply}><Input aria-label="Support reply" value={reply} onChange={(event) => setReply(event.target.value)} maxLength={2000} placeholder="Type your reply" required /><Button size="icon" title="Send reply" disabled={busy || !reply.trim()}>{busy ? <Loader2 className="animate-spin" /> : <Send />}</Button></form>}
        </CardContent>
      </Card>
    </div>
  );
}
