import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/request-auth";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { apiError, enforceRateLimit, parseJson } from "@/server/api";
import { writeAuditLog } from "@/server/audit";
import { logApiError, requestContext } from "@/server/monitoring";
import { sendWhatsAppNotification } from "@/server/notifications/whatsapp";
import { writeOperationalEvent } from "@/server/operational-events";

export const dynamic = "force-dynamic";

const replySchema = z.object({
  conversationId: z.string().uuid(),
  message: z.string().trim().min(1).max(2000).optional(),
  action: z.enum(["resolve", "reopen", "human_required", "ai_active"]).optional()
}).refine((value) => value.message || value.action, {
  message: "Send a reply or choose a conversation action."
});

function missingWhatsAppTables(error: { code?: string; message?: string } | null | undefined) {
  return error?.code === "42P01" || error?.code === "42703" || /whatsapp_/i.test(error?.message ?? "");
}

function safeSearchTerm(value?: string | null) {
  const normalized = String(value ?? "").trim().replace(/[%(),]/g, " ").replace(/\s+/g, " ");
  return normalized.length > 80 ? normalized.slice(0, 80) : normalized;
}

export async function GET(request: Request) {
  const limited = await enforceRateLimit(request, "admin-whatsapp-inbox", { limit: 90, windowSeconds: 60 });
  if (limited) return limited;

  const access = await requireRole(request, ["admin", "customer_care", "moderator", "dispatcher"]);
  if (!access.profile) return NextResponse.json({ error: access.error }, { status: access.status });
  if (access.error) return NextResponse.json({ error: access.error }, { status: access.status });

  const supabase = getSupabaseAdmin();
  if (!supabase) return apiError("WhatsApp inbox is temporarily unavailable.", { status: 503 });

  const url = new URL(request.url);
  const conversationId = url.searchParams.get("conversationId");
  const search = safeSearchTerm(url.searchParams.get("search"));
  const status = url.searchParams.get("status")?.trim();

  let conversationsQuery = supabase
    .from("whatsapp_conversations")
    .select("id,customer_phone,customer_name,status,human_state,shipment_tracking_id,quote_request_id,last_message_at,unread_count,created_at,updated_at")
    .order("last_message_at", { ascending: false })
    .limit(80);

  if (status && status !== "all") conversationsQuery = conversationsQuery.eq("status", status);
  if (search) {
    conversationsQuery = conversationsQuery.or(`customer_phone.ilike.%${search}%,customer_name.ilike.%${search}%,shipment_tracking_id.ilike.%${search}%`);
  }

  const conversations = await conversationsQuery;
  if (conversations.error) {
    if (missingWhatsAppTables(conversations.error)) {
      return NextResponse.json({ conversations: [], messages: [], warning: "WhatsApp inbox storage is being prepared." });
    }
    logApiError(conversations.error, "Unable to load WhatsApp inbox conversations.", requestContext(request));
    return apiError("Unable to load WhatsApp inbox.", { status: 500 });
  }

  const selectedConversationId = conversationId ?? conversations.data?.[0]?.id ?? null;
  let messages: unknown[] = [];
  if (selectedConversationId) {
    const messageResult = await supabase
      .from("whatsapp_messages")
      .select("id,conversation_id,whatsapp_message_id,direction,message_type,sender,recipient,content,status,created_at,sent_at,delivered_at,read_at,failed_at,error_code,error_message")
      .eq("conversation_id", selectedConversationId)
      .order("created_at", { ascending: true })
      .limit(250);

    if (messageResult.error) {
      if (!missingWhatsAppTables(messageResult.error)) {
        logApiError(messageResult.error, "Unable to load WhatsApp inbox messages.", requestContext(request, { conversationId: selectedConversationId }));
        return apiError("Unable to load WhatsApp messages.", { status: 500 });
      }
    } else {
      messages = messageResult.data ?? [];
    }

    await supabase
      .from("whatsapp_conversations")
      .update({ unread_count: 0, updated_at: new Date().toISOString() })
      .eq("id", selectedConversationId);
  }

  return NextResponse.json({
    conversations: conversations.data ?? [],
    selectedConversationId,
    messages
  });
}

export async function POST(request: Request) {
  const limited = await enforceRateLimit(request, "admin-whatsapp-inbox-send", { limit: 60, windowSeconds: 60 });
  if (limited) return limited;

  const access = await requireRole(request, ["admin", "customer_care", "moderator", "dispatcher"]);
  if (!access.profile) return NextResponse.json({ error: access.error }, { status: access.status });
  if (access.error) return NextResponse.json({ error: access.error }, { status: access.status });

  const parsed = await parseJson(request, replySchema, "Choose a WhatsApp conversation and type a reply.");
  if (parsed.response) return parsed.response;

  const supabase = getSupabaseAdmin();
  if (!supabase) return apiError("WhatsApp inbox is temporarily unavailable.", { status: 503 });

  const conversation = await supabase
    .from("whatsapp_conversations")
    .select("*")
    .eq("id", parsed.data.conversationId)
    .maybeSingle();

  if (conversation.error) {
    logApiError(conversation.error, "Unable to load WhatsApp conversation.", requestContext(request, { conversationId: parsed.data.conversationId }));
    return apiError("Unable to load WhatsApp conversation.", { status: 500 });
  }
  if (!conversation.data) return apiError("WhatsApp conversation not found.", { status: 404 });

  const now = new Date().toISOString();
  const updates: Record<string, unknown> = { updated_at: now };
  if (parsed.data.action === "resolve") {
    updates.status = "resolved";
    updates.human_state = "human_required";
  } else if (parsed.data.action === "reopen") {
    updates.status = "open";
  } else if (parsed.data.action === "human_required") {
    updates.human_state = "human_required";
    updates.status = "open";
  } else if (parsed.data.action === "ai_active") {
    updates.human_state = "ai_active";
    updates.status = "open";
  }

  let sendResult: Awaited<ReturnType<typeof sendWhatsAppNotification>> | null = null;
  if (parsed.data.message) {
    sendResult = await sendWhatsAppNotification({
      to: conversation.data.customer_phone,
      message: parsed.data.message,
      workflow: "whatsapp_admin_reply",
      entityType: "whatsapp_conversation",
      entityId: conversation.data.id,
      metadata: {
        actorId: access.profile.id,
        actorRole: access.profile.role
      }
    });

    await supabase.from("whatsapp_messages").insert({
      company_id: conversation.data.company_id ?? null,
      conversation_id: conversation.data.id,
      whatsapp_message_id: sendResult.providerMessageId ?? null,
      direction: "outbound",
      message_type: "text",
      sender: access.profile.full_name ?? access.profile.email ?? "Fly Logistics support",
      recipient: conversation.data.customer_phone,
      content: parsed.data.message,
      status: sendResult.status,
      metadata: {
        workflow: "whatsapp_admin_reply",
        provider: sendResult.provider,
        mode: sendResult.mode,
        reason: sendResult.reason ?? null
      },
      sent_at: sendResult.ok ? now : null,
      failed_at: sendResult.ok ? null : now,
      error_message: sendResult.reason ?? null
    });

    updates.status = "open";
    updates.human_state = "human_required";
    updates.last_message_at = now;
  }

  await supabase.from("whatsapp_conversations").update(updates).eq("id", conversation.data.id);

  await writeAuditLog(supabase, {
    actor: access.profile,
    action: parsed.data.message ? "whatsapp.reply" : `whatsapp.${parsed.data.action}`,
    entityType: "whatsapp_conversation",
    entityId: conversation.data.id,
    metadata: { action: parsed.data.action, sent: sendResult?.ok ?? false },
    request
  });

  await writeOperationalEvent(supabase, {
    category: "notification",
    severity: sendResult && !sendResult.ok ? "warning" : "info",
    message: parsed.data.message ? "Admin replied to WhatsApp conversation." : "Admin updated WhatsApp conversation state.",
    entityType: "whatsapp_conversation",
    entityId: conversation.data.id,
    metadata: { action: parsed.data.action, sent: sendResult?.ok ?? null, provider: sendResult?.provider ?? null },
    request
  });

  return NextResponse.json({ ok: true, result: sendResult, action: parsed.data.action ?? null });
}
