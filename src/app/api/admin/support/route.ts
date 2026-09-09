import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/request-auth";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { apiError, enforceRateLimit, parseJson } from "@/server/api";
import { writeAuditLog } from "@/server/audit";
import { sendEmailNotification } from "@/server/notifications/email";
import { sendInApp } from "@/server/notifications/service";
import { writeOperationalEvent } from "@/server/operational-events";

export const dynamic = "force-dynamic";

const updateSchema = z.object({
  ticketId: z.string().trim().min(1).max(80),
  status: z.enum(["OPEN", "IN_REVIEW", "RESOLVED", "CLOSED"]),
  resolutionNotes: z.string().trim().max(2000).optional().default("")
});

const staffRoles = ["admin", "customer_care", "moderator", "dispatcher"] as const;

export async function GET(request: Request) {
  const limited = await enforceRateLimit(request, "admin-support-list", { limit: 90, windowSeconds: 60 });
  if (limited) return limited;

  const access = await requireRole(request, [...staffRoles]);
  if (!access.profile) return NextResponse.json({ error: access.error }, { status: access.status });
  if (access.error) return NextResponse.json({ error: access.error }, { status: access.status });

  const supabase = getSupabaseAdmin();
  if (!supabase) return apiError("Support operations are temporarily unavailable.", { status: 503 });

  const { data, error } = await supabase
    .from("customer_support_tickets")
    .select("id,ticket_id,user_id,company_id,business_account_id,tracking_id,subject,priority,status,message,ticket_type,resolution_status,resolution_notes,resolved_at,last_message_at,unread_admin_count,unread_customer_count,created_at,updated_at")
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) return apiError("Unable to load the support queue.", { status: 500 });

  const userIds = Array.from(new Set((data ?? []).map((ticket) => ticket.user_id).filter(Boolean)));
  const profiles = userIds.length
    ? await supabase.from("user_profiles").select("id,email,full_name,role").in("id", userIds)
    : { data: [], error: null };
  const profileMap = new Map((profiles.data ?? []).map((profile) => [profile.id, profile]));

  return NextResponse.json({
    tickets: (data ?? []).map((ticket) => ({ ...ticket, requester: profileMap.get(ticket.user_id) ?? null }))
  });
}

export async function PATCH(request: Request) {
  const limited = await enforceRateLimit(request, "admin-support-update", { limit: 50, windowSeconds: 60 });
  if (limited) return limited;

  const access = await requireRole(request, [...staffRoles]);
  if (!access.profile) return NextResponse.json({ error: access.error }, { status: access.status });
  if (access.error) return NextResponse.json({ error: access.error }, { status: access.status });

  const parsed = await parseJson(request, updateSchema, "Choose a valid support ticket status.");
  if (parsed.response) return parsed.response;

  const supabase = getSupabaseAdmin();
  if (!supabase) return apiError("Support operations are temporarily unavailable.", { status: 503 });

  const now = new Date().toISOString();
  const closed = ["RESOLVED", "CLOSED"].includes(parsed.data.status);
  const { data: ticket, error } = await supabase
    .from("customer_support_tickets")
    .update({
      status: parsed.data.status,
      resolution_status: parsed.data.status,
      resolution_notes: parsed.data.resolutionNotes || null,
      resolved_at: closed ? now : null,
      unread_customer_count: 1,
      updated_at: now
    })
    .eq("ticket_id", parsed.data.ticketId)
    .select("*")
    .single();

  if (error || !ticket) return apiError("Unable to update this support ticket.", { status: 500 });

  const title = closed ? "Support ticket closed" : "Support ticket reopened";
  const body = closed
    ? `Ticket ${parsed.data.ticketId} has been ${parsed.data.status.toLowerCase()}. You can open a new ticket if further help is needed.`
    : `Ticket ${parsed.data.ticketId} is open again and the support team can continue the conversation.`;

  if (ticket.user_id) {
    await sendInApp({
      userId: ticket.user_id,
      title,
      body,
      message: body,
      workflow: "support_status_update",
      entityType: "support_ticket",
      entityId: parsed.data.ticketId
    });

    const profile = await supabase.from("user_profiles").select("email,role").eq("id", ticket.user_id).maybeSingle();
    if (profile.data?.email) {
      const supportPath = profile.data.role === "driver"
        ? "/driver#driver-support"
        : profile.data.role === "dispatcher"
          ? "/dispatcher#dispatcher-support"
          : ticket.business_account_id
            ? "/merchant/dashboard#merchant-support"
            : "/customer#customer-support";
      await sendEmailNotification({
        emailTo: profile.data.email,
        workflow: "support_status_update",
        entityType: "support_ticket",
        entityId: parsed.data.ticketId,
        subject: `Fly Logistics: ${title.toLowerCase()} - ${parsed.data.ticketId}`,
        title,
        message: body,
        ctaLabel: "Open support center",
        ctaUrl: `${new URL(request.url).origin}${supportPath}`
      });
    }
  }

  await writeAuditLog(supabase, {
    actor: access.profile,
    action: "admin.support_status_update",
    entityType: "support_ticket",
    entityId: parsed.data.ticketId,
    metadata: { status: parsed.data.status },
    request
  });
  await writeOperationalEvent(supabase, {
    category: "support",
    message: title,
    entityType: "support_ticket",
    entityId: parsed.data.ticketId,
    metadata: { status: parsed.data.status, actorRole: access.profile.role },
    request
  });

  return NextResponse.json({ ticket });
}
