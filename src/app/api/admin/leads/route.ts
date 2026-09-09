import { NextResponse } from "next/server";
import { z } from "zod";
import { cloudLeadStatuses, normalizeCloudLeadStatus } from "@/lib/cloud-sales";
import { requireRole } from "@/lib/request-auth";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { enforceRateLimit, parseJson } from "@/server/api";
import { writeAuditLog } from "@/server/audit";
import { logApiError, requestContext } from "@/server/monitoring";
import { writeOperationalEvent } from "@/server/operational-events";

export const dynamic = "force-dynamic";

type DbError = { code?: string; message?: string };
type LeadRow = {
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
  updated_at?: string | null;
  metadata?: Record<string, unknown> | null;
};

const patchLeadSchema = z.object({
  leadId: z.string().uuid(),
  status: z.enum(cloudLeadStatuses).optional(),
  assignToMe: z.boolean().optional(),
  assignedTo: z.string().uuid().nullable().optional()
});

const addNoteSchema = z.object({
  action: z.literal("add_note"),
  leadId: z.string().uuid(),
  note: z.string().trim().min(2).max(4000)
});

const scheduleFollowUpSchema = z.object({
  action: z.literal("schedule_follow_up"),
  leadId: z.string().uuid(),
  title: z.string().trim().min(2).max(180),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
  dueAt: z.string().trim().optional().or(z.literal("")),
  assignedTo: z.string().uuid().nullable().optional()
});

const leadActionSchema = z.discriminatedUnion("action", [addNoteSchema, scheduleFollowUpSchema]);

function missingSalesTable(error: DbError | null | undefined) {
  return error?.code === "42P01" || error?.code === "42703";
}

function safeDate(value?: string | null) {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function matchesSearch(lead: LeadRow, search: string) {
  if (!search) return true;
  const haystack = [
    lead.company_name,
    lead.contact_name,
    lead.email,
    lead.phone,
    lead.city,
    lead.country,
    lead.source
  ].join(" ").toLowerCase();
  return haystack.includes(search.toLowerCase());
}

function leadMrr(lead: LeadRow) {
  const value = Number(lead.metadata?.monthlyMrr ?? lead.metadata?.mrr ?? 0);
  return Number.isFinite(value) ? value : 0;
}

function amountValue(value: unknown) {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? amount : 0;
}

export async function GET(request: Request) {
  const limited = await enforceRateLimit(request, "admin-leads", { limit: 80, windowSeconds: 60 });
  if (limited) return limited;

  const access = await requireRole(request, ["admin"]);
  if (!access.profile) return NextResponse.json({ error: access.error }, { status: access.status });
  if (access.error) return NextResponse.json({ error: access.error }, { status: access.status });

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Sales CRM is temporarily unavailable." }, { status: 503 });

  const url = new URL(request.url);
  const status = url.searchParams.get("status") ?? "all";
  const search = url.searchParams.get("search")?.trim() ?? "";

  try {
    const [leadsResult, activitiesResult, demosResult, notesResult, subscriptionsResult] = await Promise.all([
      supabase.from("leads").select("*").order("created_at", { ascending: false }).limit(500),
      supabase.from("sales_activities").select("*").order("created_at", { ascending: false }).limit(500),
      supabase.from("demo_requests").select("*").order("created_at", { ascending: false }).limit(300),
      supabase.from("sales_notes").select("*").order("created_at", { ascending: false }).limit(500),
      supabase.from("subscriptions").select("id,plan,status,amount,currency,created_at,cancelled_at").order("created_at", { ascending: false }).limit(1000)
    ]);

    if (missingSalesTable(leadsResult.error) || missingSalesTable(activitiesResult.error) || missingSalesTable(demosResult.error) || missingSalesTable(notesResult.error)) {
      return NextResponse.json({ error: "Sales CRM tables are not installed yet. Run the latest Supabase schema SQL." }, { status: 503 });
    }
    if (leadsResult.error) throw leadsResult.error;
    if (activitiesResult.error) throw activitiesResult.error;
    if (demosResult.error) throw demosResult.error;
    if (notesResult.error) throw notesResult.error;
    if (subscriptionsResult.error && !missingSalesTable(subscriptionsResult.error)) throw subscriptionsResult.error;

    const leads = ((leadsResult.data ?? []) as LeadRow[])
      .filter((lead) => status === "all" || normalizeCloudLeadStatus(lead.status) === status)
      .filter((lead) => matchesSearch(lead, search));
    const won = leads.filter((lead) => normalizeCloudLeadStatus(lead.status) === "won").length;
    const demos = demosResult.data ?? [];
    const subscriptionRows = missingSalesTable(subscriptionsResult.error) ? [] : subscriptionsResult.data ?? [];
    const activeSubscriptions = subscriptionRows.filter((row) => String(row.status ?? "").toLowerCase() === "active");
    const cancelledSubscriptions = subscriptionRows.filter((row) => ["cancelled", "expired"].includes(String(row.status ?? "").toLowerCase()));
    const subscriptionMrr = activeSubscriptions.reduce((sum, row) => sum + amountValue(row.amount), 0);
    const leadMrrTotal = leads.filter((lead) => normalizeCloudLeadStatus(lead.status) === "won").reduce((sum, lead) => sum + leadMrr(lead), 0);
    const pipeline = cloudLeadStatuses.map((stage) => ({
      status: stage,
      count: leads.filter((lead) => normalizeCloudLeadStatus(lead.status) === stage).length
    }));

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      leads,
      activities: activitiesResult.data ?? [],
      demoRequests: demos,
      notes: notesResult.data ?? [],
      pipeline,
      metrics: {
        totalLeads: leads.length,
        demosBooked: demos.length,
        conversionRate: leads.length ? Math.round((won / leads.length) * 1000) / 10 : 0,
        wonCustomers: won,
        monthlyMrr: subscriptionMrr || leadMrrTotal,
        activeSubscriptions: activeSubscriptions.length,
        churnRate: subscriptionRows.length ? Math.round((cancelledSubscriptions.length / subscriptionRows.length) * 1000) / 10 : 0,
        revenueByPlan: activeSubscriptions.reduce<Record<string, number>>((acc, row) => {
          const plan = String(row.plan ?? "starter");
          acc[plan] = (acc[plan] ?? 0) + amountValue(row.amount);
          return acc;
        }, {}),
        trialToPaidConversion: demos.length ? Math.round(((subscriptionMrr ? activeSubscriptions.length : won) / demos.length) * 1000) / 10 : 0
      }
    });
  } catch (error) {
    logApiError(error, "Unable to load sales CRM.", requestContext(request));
    return NextResponse.json({ error: "Unable to load sales CRM." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const limited = await enforceRateLimit(request, "admin-leads-update", { limit: 80, windowSeconds: 60 });
  if (limited) return limited;

  const access = await requireRole(request, ["admin"]);
  if (!access.profile) return NextResponse.json({ error: access.error }, { status: access.status });
  if (access.error) return NextResponse.json({ error: access.error }, { status: access.status });

  const parsed = await parseJson(request, patchLeadSchema, "Invalid lead update.");
  if (parsed.response) return parsed.response;

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Sales CRM is temporarily unavailable." }, { status: 503 });

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (parsed.data.status) updates.status = parsed.data.status;
  if (parsed.data.assignToMe) updates.assigned_to = access.profile.id;
  else if ("assignedTo" in parsed.data) updates.assigned_to = parsed.data.assignedTo ?? null;

  try {
    const { data, error } = await supabase
      .from("leads")
      .update(updates)
      .eq("id", parsed.data.leadId)
      .select("*")
      .single();

    if (missingSalesTable(error)) return NextResponse.json({ error: "Sales CRM tables are not installed yet." }, { status: 503 });
    if (error) throw error;

    if (parsed.data.status) {
      await supabase.from("sales_activities").insert({
        lead_id: parsed.data.leadId,
        activity_type: "status_change",
        title: `Lead moved to ${parsed.data.status.replaceAll("_", " ")}`,
        created_by: access.profile.id,
        metadata: { status: parsed.data.status }
      });
    }

    await writeAuditLog(supabase, {
      actor: access.profile,
      action: "sales.lead_update",
      entityType: "lead",
      entityId: parsed.data.leadId,
      metadata: updates,
      request
    });

    return NextResponse.json(data);
  } catch (error) {
    logApiError(error, "Unable to update lead.", requestContext(request, { leadId: parsed.data.leadId }));
    return NextResponse.json({ error: "Unable to update lead." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const limited = await enforceRateLimit(request, "admin-leads-action", { limit: 80, windowSeconds: 60 });
  if (limited) return limited;

  const access = await requireRole(request, ["admin"]);
  if (!access.profile) return NextResponse.json({ error: access.error }, { status: access.status });
  if (access.error) return NextResponse.json({ error: access.error }, { status: access.status });

  const parsed = await parseJson(request, leadActionSchema, "Invalid sales action.");
  if (parsed.response) return parsed.response;

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Sales CRM is temporarily unavailable." }, { status: 503 });

  try {
    if (parsed.data.action === "add_note") {
      const { data, error } = await supabase
        .from("sales_notes")
        .insert({
          lead_id: parsed.data.leadId,
          note: parsed.data.note,
          created_by: access.profile.id
        })
        .select("*")
        .single();
      if (missingSalesTable(error)) return NextResponse.json({ error: "Sales CRM tables are not installed yet." }, { status: 503 });
      if (error) throw error;

      await writeAuditLog(supabase, { actor: access.profile, action: "sales.note_add", entityType: "lead", entityId: parsed.data.leadId, metadata: { noteId: data.id }, request });
      return NextResponse.json(data, { status: 201 });
    }

    const { data, error } = await supabase
      .from("sales_activities")
      .insert({
        lead_id: parsed.data.leadId,
        activity_type: "follow_up",
        title: parsed.data.title,
        notes: parsed.data.notes || null,
        due_at: safeDate(parsed.data.dueAt),
        assigned_to: parsed.data.assignedTo ?? access.profile.id,
        created_by: access.profile.id
      })
      .select("*")
      .single();
    if (missingSalesTable(error)) return NextResponse.json({ error: "Sales CRM tables are not installed yet." }, { status: 503 });
    if (error) throw error;

    await writeOperationalEvent(supabase, {
      category: "enterprise",
      message: "Sales follow-up scheduled.",
      entityType: "lead",
      entityId: parsed.data.leadId,
      metadata: { activityId: data.id, dueAt: parsed.data.dueAt || null },
      request
    });
    await writeAuditLog(supabase, { actor: access.profile, action: "sales.follow_up_schedule", entityType: "lead", entityId: parsed.data.leadId, metadata: { activityId: data.id }, request });
    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    logApiError(error, "Unable to complete sales action.", requestContext(request));
    return NextResponse.json({ error: "Unable to complete sales action." }, { status: 500 });
  }
}
