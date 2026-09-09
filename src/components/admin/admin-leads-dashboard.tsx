"use client";

import type { DragEvent, FormEvent } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarClock, CheckCircle2, GripVertical, Loader2, RefreshCw, Search, StickyNote, UserCheck, Users, type LucideIcon } from "lucide-react";
import { flyError, flySuccess } from "@/components/feedback/fly-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { cloudLeadStatusLabels, cloudLeadStatuses, normalizeCloudLeadStatus, type CloudLeadStatus } from "@/lib/cloud-sales";
import { getSupabaseBrowser } from "@/lib/supabase";

type Lead = {
  id: string;
  company_name?: string | null;
  contact_name?: string | null;
  email?: string | null;
  phone?: string | null;
  city?: string | null;
  country?: string | null;
  fleet_size?: string | null;
  monthly_deliveries?: string | null;
  source?: string | null;
  status?: string | null;
  assigned_to?: string | null;
  created_at?: string | null;
};

type Activity = {
  id: string;
  lead_id?: string | null;
  activity_type?: string | null;
  title?: string | null;
  notes?: string | null;
  due_at?: string | null;
  created_at?: string | null;
};

type SalesNote = {
  id: string;
  lead_id?: string | null;
  note?: string | null;
  created_at?: string | null;
};

type LeadsResponse = {
  leads: Lead[];
  activities: Activity[];
  notes: SalesNote[];
  pipeline: Array<{ status: CloudLeadStatus; count: number }>;
  metrics: {
    totalLeads: number;
    demosBooked: number;
    conversionRate: number;
    wonCustomers: number;
    monthlyMrr: number;
    activeSubscriptions?: number;
    churnRate?: number;
    trialToPaidConversion: number;
  };
};

type MetricCard = {
  label: string;
  value: string | number;
  icon: LucideIcon;
};

const statusClass: Record<CloudLeadStatus, string> = {
  new: "border-blue-500/30 bg-blue-500/10 text-blue-300",
  contacted: "border-cyan-500/30 bg-cyan-500/10 text-cyan-300",
  demo_scheduled: "border-primary/40 bg-primary/10 text-primary",
  demo_completed: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  proposal_sent: "border-fuchsia-500/30 bg-fuchsia-500/10 text-fuchsia-300",
  negotiating: "border-violet-500/30 bg-violet-500/10 text-violet-300",
  won: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  lost: "border-red-500/30 bg-red-500/10 text-red-300"
};

function money(value: number) {
  return new Intl.NumberFormat("en-NG", { currency: "NGN", maximumFractionDigits: 0, style: "currency" }).format(value);
}

function shortDate(value?: string | null) {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat("en-NG", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export function AdminLeadsDashboard() {
  const [data, setData] = useState<LeadsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<CloudLeadStatus | "all">("all");
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [followUp, setFollowUp] = useState({ title: "", dueAt: "", notes: "" });

  const authorizedFetch = useCallback(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const supabase = getSupabaseBrowser();
    const token = (await supabase?.auth.getSession())?.data.session?.access_token;
    const headers = new Headers(init.headers);
    if (token) headers.set("Authorization", `Bearer ${token}`);
    return fetch(input, { ...init, headers });
  }, []);

  const loadLeads = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set("search", search.trim());
      if (status !== "all") params.set("status", status);
      const response = await authorizedFetch(`/api/admin/leads?${params.toString()}`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Unable to load sales CRM.");
      setData(payload);
      setSelectedLeadId((current) => current ?? payload.leads?.[0]?.id ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load sales CRM.");
    } finally {
      setLoading(false);
    }
  }, [authorizedFetch, search, status]);

  useEffect(() => {
    void loadLeads();
  }, [loadLeads]);

  const selectedLead = useMemo(() => data?.leads.find((lead) => lead.id === selectedLeadId) ?? data?.leads[0] ?? null, [data, selectedLeadId]);
  const selectedNotes = useMemo(() => (data?.notes ?? []).filter((item) => item.lead_id === selectedLead?.id), [data, selectedLead]);
  const selectedActivities = useMemo(() => (data?.activities ?? []).filter((item) => item.lead_id === selectedLead?.id), [data, selectedLead]);

  async function updateLeadStatus(leadId: string, nextStatus: CloudLeadStatus) {
    setActionLoading(`${leadId}:${nextStatus}`);
    setError(null);
    setMessage(null);
    try {
      const response = await authorizedFetch("/api/admin/leads", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId, status: nextStatus })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Unable to update lead.");
      setMessage(`Lead moved to ${cloudLeadStatusLabels[nextStatus]}.`);
      flySuccess("Lead updated", `Lead moved to ${cloudLeadStatusLabels[nextStatus]}.`);
      await loadLeads();
    } catch (err) {
      const nextError = err instanceof Error ? err.message : "Unable to update lead.";
      setError(nextError);
      flyError("Lead update failed", nextError);
    } finally {
      setActionLoading(null);
    }
  }

  async function assignToMe(leadId: string) {
    setActionLoading(`${leadId}:assign`);
    setError(null);
    setMessage(null);
    try {
      const response = await authorizedFetch("/api/admin/leads", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId, assignToMe: true })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Unable to assign lead.");
      setMessage("Lead assigned to your admin account.");
      flySuccess("Lead assigned", "Lead assigned to your admin account.");
      await loadLeads();
    } catch (err) {
      const nextError = err instanceof Error ? err.message : "Unable to assign lead.";
      setError(nextError);
      flyError("Lead assignment failed", nextError);
    } finally {
      setActionLoading(null);
    }
  }

  async function addNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedLead || !note.trim()) return;
    setActionLoading("note");
    setError(null);
    try {
      const response = await authorizedFetch("/api/admin/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "add_note", leadId: selectedLead.id, note })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Unable to add note.");
      setNote("");
      flySuccess("Note saved", "Sales note added.");
      await loadLeads();
    } catch (err) {
      const nextError = err instanceof Error ? err.message : "Unable to add note.";
      setError(nextError);
      flyError("Note failed", nextError);
    } finally {
      setActionLoading(null);
    }
  }

  async function scheduleFollowUp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedLead || !followUp.title.trim()) return;
    setActionLoading("follow-up");
    setError(null);
    try {
      const response = await authorizedFetch("/api/admin/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "schedule_follow_up", leadId: selectedLead.id, ...followUp })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Unable to schedule follow-up.");
      setFollowUp({ title: "", dueAt: "", notes: "" });
      flySuccess("Follow-up scheduled", "Sales follow-up added.");
      await loadLeads();
    } catch (err) {
      const nextError = err instanceof Error ? err.message : "Unable to schedule follow-up.";
      setError(nextError);
      flyError("Follow-up failed", nextError);
    } finally {
      setActionLoading(null);
    }
  }

  function onDragStart(event: DragEvent<HTMLDivElement>, leadId: string) {
    event.dataTransfer.setData("text/plain", leadId);
  }

  function onDrop(event: DragEvent<HTMLDivElement>, nextStatus: CloudLeadStatus) {
    event.preventDefault();
    const leadId = event.dataTransfer.getData("text/plain");
    if (!leadId) return;
    void updateLeadStatus(leadId, nextStatus);
  }

  return (
    <section className="grid gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Badge className="border-primary/40 bg-primary/10 text-primary">Fly Logistics Cloud sales CRM</Badge>
          <h1 className="mt-3 text-3xl font-black sm:text-4xl">Leads, demos, pipeline, and conversion operations</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
            Capture logistics companies, manage demo requests, move opportunities through the pipeline, and keep follow-ups visible.
          </p>
        </div>
        <Button type="button" variant="outline" onClick={() => void loadLeads()} disabled={loading}>
          <RefreshCw className={loading ? "animate-spin" : ""} />
          Refresh
        </Button>
      </div>

      {error && <div className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">{error}</div>}
      {message && <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-400">{message}</div>}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-7">
        {loading && !data
          ? Array.from({ length: 7 }).map((_, index) => <Skeleton key={index} className="h-28 rounded-md" />)
          : ([
              { label: "Total leads", value: data?.metrics.totalLeads ?? 0, icon: Users },
              { label: "Demos booked", value: data?.metrics.demosBooked ?? 0, icon: CalendarClock },
              { label: "Conversion", value: `${data?.metrics.conversionRate ?? 0}%`, icon: CheckCircle2 },
              { label: "Won customers", value: data?.metrics.wonCustomers ?? 0, icon: UserCheck },
              { label: "Monthly MRR", value: money(data?.metrics.monthlyMrr ?? 0), icon: CheckCircle2 },
              { label: "Active subs", value: data?.metrics.activeSubscriptions ?? 0, icon: CheckCircle2 },
              { label: "Churn", value: `${data?.metrics.churnRate ?? 0}%`, icon: CheckCircle2 }
            ] satisfies MetricCard[]).map(({ label, value, icon: Icon }) => (
              <Card key={String(label)} className="glass">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{String(label)}</span>
                    <Icon className="size-5 text-primary" />
                  </div>
                  <div className="mt-3 text-2xl font-black">{String(value)}</div>
                </CardContent>
              </Card>
            ))}
      </div>

      <Card className="glass">
        <CardContent className="grid gap-3 p-4 md:grid-cols-[1fr_220px]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search company, contact, email, phone, city..." className="pl-9" />
          </div>
          <select value={status} onChange={(event) => setStatus(event.target.value as CloudLeadStatus | "all")} className="h-10 rounded-md border bg-background px-3 text-sm">
            <option value="all">All stages</option>
            {cloudLeadStatuses.map((stage) => <option key={stage} value={stage}>{cloudLeadStatusLabels[stage]}</option>)}
          </select>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
        <div className="grid gap-4">
          <div className="grid gap-3 overflow-x-auto pb-2 xl:grid-cols-4">
            {cloudLeadStatuses.map((stage) => {
              const stageLeads = (data?.leads ?? []).filter((lead) => normalizeCloudLeadStatus(lead.status) === stage);
              return (
                <div
                  key={stage}
                  className="min-h-56 min-w-[260px] rounded-md border bg-background/45 p-3"
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => onDrop(event, stage)}
                >
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <Badge className={statusClass[stage]}>{cloudLeadStatusLabels[stage]}</Badge>
                    <span className="text-xs text-muted-foreground">{stageLeads.length}</span>
                  </div>
                  <div className="grid gap-2">
                    {stageLeads.map((lead) => (
                      <div
                        key={lead.id}
                        draggable
                        onDragStart={(event) => onDragStart(event, lead.id)}
                        onClick={() => setSelectedLeadId(lead.id)}
                        className={`cursor-pointer rounded-md border bg-background/80 p-3 text-sm shadow-sm transition hover:border-primary/40 ${selectedLead?.id === lead.id ? "border-primary/50" : ""}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="truncate font-semibold">{lead.company_name ?? "Unknown company"}</div>
                            <p className="truncate text-xs text-muted-foreground">{lead.contact_name ?? lead.email ?? "No contact"}</p>
                          </div>
                          <GripVertical className="size-4 shrink-0 text-muted-foreground" />
                        </div>
                        <div className="mt-3 grid gap-1 text-xs text-muted-foreground">
                          <span>{lead.city || lead.country ? `${lead.city ?? ""}${lead.city && lead.country ? ", " : ""}${lead.country ?? ""}` : "Location not set"}</span>
                          <span>{lead.monthly_deliveries ? `${lead.monthly_deliveries} monthly deliveries` : "Monthly volume not set"}</span>
                        </div>
                      </div>
                    ))}
                    {!loading && stageLeads.length === 0 && <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">Drop leads here.</p>}
                  </div>
                </div>
              );
            })}
          </div>

          <Card className="glass">
            <CardHeader>
              <CardTitle>Lead list</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                  <tr>
                    <th className="py-2 pr-3">Company</th>
                    <th className="py-2 pr-3">Contact</th>
                    <th className="py-2 pr-3">Location</th>
                    <th className="py-2 pr-3">Volume</th>
                    <th className="py-2 pr-3">Stage</th>
                    <th className="py-2 pr-3">Created</th>
                    <th className="py-2 pr-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.leads ?? []).map((lead) => {
                    const stage = normalizeCloudLeadStatus(lead.status);
                    return (
                      <tr key={lead.id} className="border-t">
                        <td className="py-3 pr-3 font-semibold">{lead.company_name ?? "Unknown company"}</td>
                        <td className="py-3 pr-3">
                          <div>{lead.contact_name ?? "No name"}</div>
                          <div className="text-xs text-muted-foreground">{lead.email ?? lead.phone ?? "No contact"}</div>
                        </td>
                        <td className="py-3 pr-3">{lead.city || lead.country ? `${lead.city ?? ""}${lead.city && lead.country ? ", " : ""}${lead.country ?? ""}` : "Not set"}</td>
                        <td className="py-3 pr-3">{lead.monthly_deliveries ?? lead.fleet_size ?? "Not set"}</td>
                        <td className="py-3 pr-3"><Badge className={statusClass[stage]}>{cloudLeadStatusLabels[stage]}</Badge></td>
                        <td className="py-3 pr-3 text-xs text-muted-foreground">{shortDate(lead.created_at)}</td>
                        <td className="py-3 pr-3">
                          <div className="flex gap-2">
                            <Button type="button" size="sm" variant="outline" onClick={() => setSelectedLeadId(lead.id)}>Open</Button>
                            <Button type="button" size="sm" variant="outline" disabled={actionLoading === `${lead.id}:assign`} onClick={() => void assignToMe(lead.id)}>
                              {actionLoading === `${lead.id}:assign` ? <Loader2 className="animate-spin" /> : <UserCheck />}
                              Assign
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {!loading && (data?.leads ?? []).length === 0 && <p className="rounded-md border p-4 text-sm text-muted-foreground">No leads match this view yet.</p>}
            </CardContent>
          </Card>
        </div>

        <Card className="glass h-fit">
          <CardHeader>
            <CardTitle>Lead workspace</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            {selectedLead ? (
              <>
                <div className="rounded-md border bg-background/45 p-4">
                  <Badge className={statusClass[normalizeCloudLeadStatus(selectedLead.status)]}>{cloudLeadStatusLabels[normalizeCloudLeadStatus(selectedLead.status)]}</Badge>
                  <h2 className="mt-3 text-xl font-black">{selectedLead.company_name ?? "Unknown company"}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">{selectedLead.contact_name ?? "No contact"} · {selectedLead.email ?? selectedLead.phone ?? "No email"}</p>
                  <div className="mt-3 grid gap-2 text-xs text-muted-foreground">
                    <span>Fleet: {selectedLead.fleet_size ?? "Not set"}</span>
                    <span>Monthly deliveries: {selectedLead.monthly_deliveries ?? "Not set"}</span>
                    <span>Source: {selectedLead.source ?? "website"}</span>
                  </div>
                </div>

                <div className="grid gap-2">
                  <Label>Move stage</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {cloudLeadStatuses.map((stage) => (
                      <Button
                        key={stage}
                        type="button"
                        variant={normalizeCloudLeadStatus(selectedLead.status) === stage ? "default" : "outline"}
                        size="sm"
                        disabled={actionLoading === `${selectedLead.id}:${stage}`}
                        onClick={() => void updateLeadStatus(selectedLead.id, stage)}
                      >
                        {actionLoading === `${selectedLead.id}:${stage}` ? <Loader2 className="animate-spin" /> : null}
                        {cloudLeadStatusLabels[stage]}
                      </Button>
                    ))}
                  </div>
                </div>

                <form className="grid gap-3 rounded-md border bg-background/45 p-3" onSubmit={addNote}>
                  <Label htmlFor="leadNote">Add sales note</Label>
                  <textarea id="leadNote" value={note} onChange={(event) => setNote(event.target.value)} className="min-h-24 rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary" placeholder="Call summary, objection, proposal details, decision maker..." />
                  <Button type="submit" disabled={actionLoading === "note"}>
                    {actionLoading === "note" ? <Loader2 className="animate-spin" /> : <StickyNote />}
                    Save note
                  </Button>
                </form>

                <form className="grid gap-3 rounded-md border bg-background/45 p-3" onSubmit={scheduleFollowUp}>
                  <Label htmlFor="followTitle">Schedule follow-up</Label>
                  <Input id="followTitle" value={followUp.title} onChange={(event) => setFollowUp((current) => ({ ...current, title: event.target.value }))} placeholder="Call founder / send proposal" required />
                  <Input type="datetime-local" value={followUp.dueAt} onChange={(event) => setFollowUp((current) => ({ ...current, dueAt: event.target.value }))} />
                  <textarea value={followUp.notes} onChange={(event) => setFollowUp((current) => ({ ...current, notes: event.target.value }))} className="min-h-20 rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary" placeholder="Preparation notes" />
                  <Button type="submit" disabled={actionLoading === "follow-up"}>
                    {actionLoading === "follow-up" ? <Loader2 className="animate-spin" /> : <CalendarClock />}
                    Schedule follow-up
                  </Button>
                </form>

                <div className="grid gap-2">
                  <div className="text-sm font-semibold">Latest notes</div>
                  {selectedNotes.slice(0, 5).map((item) => (
                    <div key={item.id} className="rounded-md border bg-background/45 p-3 text-sm">
                      <p className="text-muted-foreground">{item.note}</p>
                      <p className="mt-2 text-xs text-muted-foreground">{shortDate(item.created_at)}</p>
                    </div>
                  ))}
                  {selectedNotes.length === 0 && <p className="rounded-md border p-3 text-sm text-muted-foreground">No notes yet.</p>}
                </div>

                <div className="grid gap-2">
                  <div className="text-sm font-semibold">Activities</div>
                  {selectedActivities.slice(0, 5).map((item) => (
                    <div key={item.id} className="rounded-md border bg-background/45 p-3 text-sm">
                      <div className="font-semibold">{item.title ?? item.activity_type ?? "Activity"}</div>
                      <p className="mt-1 text-xs text-muted-foreground">{item.notes ?? shortDate(item.due_at ?? item.created_at)}</p>
                    </div>
                  ))}
                  {selectedActivities.length === 0 && <p className="rounded-md border p-3 text-sm text-muted-foreground">No activities yet.</p>}
                </div>
              </>
            ) : (
              <p className="rounded-md border p-4 text-sm text-muted-foreground">Select a lead to view details.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
