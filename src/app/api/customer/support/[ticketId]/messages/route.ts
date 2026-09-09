import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/request-auth";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { apiError, enforceRateLimit, parseJson } from "@/server/api";
import { notifyAdmin } from "@/server/admin-notifications";
import { writeAuditLog } from "@/server/audit";
import { logApiError, requestContext } from "@/server/monitoring";
import { writeOperationalEvent } from "@/server/operational-events";

export const dynamic = "force-dynamic";

const messageSchema = z.object({
  message: z.string().trim().min(1).max(2000),
  attachmentUrl: z.string().trim().url().optional().or(z.literal(""))
});

function isMissingChatTable(error: { code?: string; message?: string } | null | undefined) {
  return error?.code === "42P01" || error?.code === "42703";
}

async function paramsTicketId(params: Promise<{ ticketId: string }> | { ticketId: string }) {
  const resolved = await params;
  return decodeURIComponent(resolved.ticketId).trim();
}

async function customerTicket(supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>, ticketId: string, userId: string) {
  return supabase
    .from("customer_support_tickets")
    .select("id,ticket_id,user_id,company_id,business_account_id,subject,status")
    .eq("ticket_id", ticketId)
    .eq("user_id", userId)
    .maybeSingle();
}

export async function GET(request: Request, { params }: { params: Promise<{ ticketId: string }> }) {
  const limited = await enforceRateLimit(request, "customer-support-chat", { limit: 120, windowSeconds: 60 });
  if (limited) return limited;

  const access = await requireRole(request, ["customer", "driver", "dispatcher"]);
  if (!access.profile) return NextResponse.json({ error: access.error }, { status: access.status });

  const supabase = getSupabaseAdmin();
  if (!supabase) return apiError("Customer support chat is temporarily unavailable.", { status: 503 });

  const ticketId = await paramsTicketId(params);
  const ticket = await customerTicket(supabase, ticketId, access.profile.id);
  if (ticket.error) {
    logApiError(ticket.error, "Unable to verify customer support chat.", requestContext(request, { ticketId }));
    return apiError("Unable to open this support conversation.", { status: 500 });
  }
  if (!ticket.data) return apiError("Support conversation not found.", { status: 404 });

  const { data, error } = await supabase
    .from("support_chat_messages")
    .select("id,ticket_id,user_id,sender_id,sender_role,sender_name,message,attachment_url,read_at,created_at")
    .eq("ticket_id", ticketId)
    .order("created_at", { ascending: true })
    .limit(200);

  if (error) {
    if (isMissingChatTable(error)) return NextResponse.json({ messages: [], warning: "Live support chat is being prepared." });
    logApiError(error, "Unable to load customer support chat.", requestContext(request, { ticketId }));
    return apiError("Unable to load support conversation.", { status: 500 });
  }

  await supabase
    .from("support_chat_messages")
    .update({ read_at: new Date().toISOString() })
    .eq("ticket_id", ticketId)
    .neq("sender_role", "customer")
    .is("read_at", null);

  await supabase
    .from("customer_support_tickets")
    .update({ unread_customer_count: 0, updated_at: new Date().toISOString() })
    .eq("ticket_id", ticketId);

  return NextResponse.json({ ticket: ticket.data, messages: data ?? [] });
}

export async function POST(request: Request, { params }: { params: Promise<{ ticketId: string }> }) {
  const limited = await enforceRateLimit(request, "customer-support-chat-send", { limit: 30, windowSeconds: 60 });
  if (limited) return limited;

  const access = await requireRole(request, ["customer", "driver", "dispatcher"]);
  if (!access.profile) return NextResponse.json({ error: access.error }, { status: access.status });

  const parsed = await parseJson(request, messageSchema, "Type a message before sending.");
  if (parsed.response) return parsed.response;

  const supabase = getSupabaseAdmin();
  if (!supabase) return apiError("Customer support chat is temporarily unavailable.", { status: 503 });

  const ticketId = await paramsTicketId(params);
  const ticket = await customerTicket(supabase, ticketId, access.profile.id);
  if (ticket.error) {
    logApiError(ticket.error, "Unable to verify customer support chat send.", requestContext(request, { ticketId }));
    return apiError("Unable to open this support conversation.", { status: 500 });
  }
  if (!ticket.data) return apiError("Support conversation not found.", { status: 404 });

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("support_chat_messages")
    .insert({
      ticket_id: ticketId,
      user_id: access.profile.id,
      company_id: ticket.data.company_id ?? null,
      business_account_id: ticket.data.business_account_id ?? null,
      sender_id: access.profile.id,
      sender_role: "customer",
      sender_name: access.profile.full_name ?? access.profile.email ?? "Customer",
      message: parsed.data.message,
      attachment_url: parsed.data.attachmentUrl || null
    })
    .select("id,ticket_id,user_id,sender_id,sender_role,sender_name,message,attachment_url,read_at,created_at")
    .single();

  if (error) {
    logApiError(error, "Unable to send customer support chat message.", requestContext(request, { ticketId }));
    return apiError(isMissingChatTable(error) ? "Live support chat is being prepared." : "Unable to send support message.", { status: isMissingChatTable(error) ? 503 : 500 });
  }

  await supabase
    .from("customer_support_tickets")
    .update({
      status: String(ticket.data.status ?? "OPEN").toUpperCase() === "RESOLVED" ? "OPEN" : ticket.data.status ?? "OPEN",
      last_message_at: now,
      unread_admin_count: 1,
      updated_at: now
    })
    .eq("ticket_id", ticketId);

  await notifyAdmin(supabase, {
    title: "New support chat message",
    message: `${access.profile.email ?? "A customer"} replied on ${ticketId}.`,
    severity: "info",
    entityType: "support_ticket",
    entityId: ticketId,
    request
  });

  await writeAuditLog(supabase, {
    actor: access.profile,
    action: "customer.support_chat_message",
    entityType: "support_ticket",
    entityId: ticketId,
    metadata: { messageId: data.id },
    request
  });

  await writeOperationalEvent(supabase, {
    category: "notification",
    message: "Customer sent a live support chat message.",
    entityType: "support_ticket",
    entityId: ticketId,
    metadata: { messageId: data.id },
    request
  });

  return NextResponse.json(data, { status: 201 });
}
