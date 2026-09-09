import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/request-auth";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { apiError, enforceRateLimit, parseJson } from "@/server/api";
import { writeAuditLog } from "@/server/audit";
import { logApiError, requestContext } from "@/server/monitoring";
import { sendInApp } from "@/server/notifications/service";
import { sendEmailNotification } from "@/server/notifications/email";
import { writeOperationalEvent } from "@/server/operational-events";

export const dynamic = "force-dynamic";

const adminMessageSchema = z.object({
  message: z.string().trim().min(1).max(2000),
  attachmentUrl: z.string().trim().url().optional().or(z.literal(""))
});

async function paramsTicketId(params: Promise<{ ticketId: string }> | { ticketId: string }) {
  const resolved = await params;
  return decodeURIComponent(resolved.ticketId).trim();
}

function isMissingChatTable(error: { code?: string; message?: string } | null | undefined) {
  return error?.code === "42P01" || error?.code === "42703";
}

export async function GET(request: Request, { params }: { params: Promise<{ ticketId: string }> }) {
  const limited = await enforceRateLimit(request, "admin-support-chat", { limit: 160, windowSeconds: 60 });
  if (limited) return limited;

  const access = await requireRole(request, ["admin", "customer_care", "moderator", "dispatcher"]);
  if (!access.profile) return NextResponse.json({ error: access.error }, { status: access.status });
  if (access.error) return NextResponse.json({ error: access.error }, { status: access.status });

  const supabase = getSupabaseAdmin();
  if (!supabase) return apiError("Support chat is temporarily unavailable.", { status: 503 });

  const ticketId = await paramsTicketId(params);
  const ticket = await supabase
    .from("customer_support_tickets")
    .select("*")
    .eq("ticket_id", ticketId)
    .maybeSingle();

  if (ticket.error) {
    logApiError(ticket.error, "Unable to load admin support ticket.", requestContext(request, { ticketId }));
    return apiError("Unable to load support ticket.", { status: 500 });
  }
  if (!ticket.data) return apiError("Support ticket not found.", { status: 404 });

  const { data, error } = await supabase
    .from("support_chat_messages")
    .select("id,ticket_id,user_id,sender_id,sender_role,sender_name,message,attachment_url,read_at,created_at")
    .eq("ticket_id", ticketId)
    .order("created_at", { ascending: true })
    .limit(250);

  if (error) {
    if (isMissingChatTable(error)) return NextResponse.json({ ticket: ticket.data, messages: [], warning: "Live support chat is being prepared." });
    logApiError(error, "Unable to load admin support chat.", requestContext(request, { ticketId }));
    return apiError("Unable to load support chat.", { status: 500 });
  }

  await supabase
    .from("support_chat_messages")
    .update({ read_at: new Date().toISOString() })
    .eq("ticket_id", ticketId)
    .eq("sender_role", "customer")
    .is("read_at", null);

  await supabase
    .from("customer_support_tickets")
    .update({ unread_admin_count: 0, updated_at: new Date().toISOString() })
    .eq("ticket_id", ticketId);

  return NextResponse.json({ ticket: ticket.data, messages: data ?? [] });
}

export async function POST(request: Request, { params }: { params: Promise<{ ticketId: string }> }) {
  const limited = await enforceRateLimit(request, "admin-support-chat-send", { limit: 80, windowSeconds: 60 });
  if (limited) return limited;

  const access = await requireRole(request, ["admin", "customer_care", "moderator", "dispatcher"]);
  if (!access.profile) return NextResponse.json({ error: access.error }, { status: access.status });
  if (access.error) return NextResponse.json({ error: access.error }, { status: access.status });

  const parsed = await parseJson(request, adminMessageSchema, "Type a support reply before sending.");
  if (parsed.response) return parsed.response;

  const supabase = getSupabaseAdmin();
  if (!supabase) return apiError("Support chat is temporarily unavailable.", { status: 503 });

  const ticketId = await paramsTicketId(params);
  const ticket = await supabase
    .from("customer_support_tickets")
    .select("*")
    .eq("ticket_id", ticketId)
    .maybeSingle();

  if (ticket.error) {
    logApiError(ticket.error, "Unable to verify admin support chat.", requestContext(request, { ticketId }));
    return apiError("Unable to load support ticket.", { status: 500 });
  }
  if (!ticket.data) return apiError("Support ticket not found.", { status: 404 });

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("support_chat_messages")
    .insert({
      ticket_id: ticketId,
      user_id: ticket.data.user_id,
      company_id: ticket.data.company_id ?? null,
      business_account_id: ticket.data.business_account_id ?? null,
      sender_id: access.profile.id,
      sender_role: access.profile.role,
      sender_name: access.profile.full_name ?? access.profile.email ?? "Fly Logistics support",
      message: parsed.data.message,
      attachment_url: parsed.data.attachmentUrl || null
    })
    .select("id,ticket_id,user_id,sender_id,sender_role,sender_name,message,attachment_url,read_at,created_at")
    .single();

  if (error) {
    logApiError(error, "Unable to send admin support chat reply.", requestContext(request, { ticketId }));
    return apiError(isMissingChatTable(error) ? "Live support chat is being prepared." : "Unable to send support reply.", { status: isMissingChatTable(error) ? 503 : 500 });
  }

  await supabase
    .from("customer_support_tickets")
    .update({
      status: "IN_REVIEW",
      admin_reply: parsed.data.message,
      last_message_at: now,
      unread_customer_count: 1,
      updated_at: now
    })
    .eq("ticket_id", ticketId);

  await sendInApp({
    userId: ticket.data.user_id,
    title: "Support reply",
    body: `Fly Logistics support replied on ${ticketId}.`,
    workflow: "support_reply",
    message: `Fly Logistics support replied on ${ticketId}.`,
    entityType: "support_ticket",
    entityId: ticketId,
    metadata: { messageId: data.id }
  });

  if (ticket.data.user_id) {
    const customer = await supabase
      .from("user_profiles")
      .select("email,full_name,role")
      .eq("id", ticket.data.user_id)
      .maybeSingle();

    if (customer.data?.email) {
      let supportPath = customer.data.role === "driver"
        ? "/driver#driver-support"
        : customer.data.role === "dispatcher"
          ? "/dispatcher#dispatcher-support"
          : "/customer#customer-support";
      if (ticket.data.business_account_id) {
        supportPath = "/merchant/dashboard#merchant-support";
      } else if (ticket.data.company_id) {
        const companyMembership = await supabase
          .from("company_members")
          .select("role")
          .eq("company_id", ticket.data.company_id)
          .eq("user_id", ticket.data.user_id)
          .in("role", ["owner", "admin", "dispatcher"])
          .maybeSingle();
        if (companyMembership.data) supportPath = "/cloud/support";
      }
      await sendEmailNotification({
        emailTo: customer.data.email,
        workflow: "support_reply",
        entityType: "support_ticket",
        entityId: ticketId,
        subject: `Fly Logistics support replied to ${ticketId}`,
        title: "You have a new support reply",
        message: parsed.data.message,
        ctaLabel: "Open support conversation",
        ctaUrl: `${new URL(request.url).origin}${supportPath}`,
        metadata: { messageId: data.id, supportPath }
      });
    }
  }

  await writeAuditLog(supabase, {
    actor: access.profile,
    action: "admin.support_chat_reply",
    entityType: "support_ticket",
    entityId: ticketId,
    metadata: { messageId: data.id },
    request
  });

  await writeOperationalEvent(supabase, {
    category: "notification",
    message: "Admin replied to live support chat.",
    entityType: "support_ticket",
    entityId: ticketId,
    metadata: { messageId: data.id, role: access.profile.role },
    request
  });

  return NextResponse.json(data, { status: 201 });
}
