import crypto from "node:crypto";
import { cleanEnv } from "@/lib/env";
import { canonicalSiteUrl } from "@/lib/site";
import { normalizeWhatsAppPhone } from "@/lib/whatsapp";
import { customerTrackingMessageForCarrierStatus } from "@/lib/tracking-status";
import type { getSupabaseAdmin } from "@/lib/supabase-server";
import { logWarn } from "@/server/monitoring";
import { rateLimit } from "@/server/rate-limit";
import { sendWhatsAppNotification } from "@/server/notifications/whatsapp";
import { writeOperationalEvent } from "@/server/operational-events";

type SupabaseAdminClient = NonNullable<ReturnType<typeof getSupabaseAdmin>>;
type JsonRecord = Record<string, unknown>;

type ContactSnapshot = {
  waId?: string | null;
  name?: string | null;
};

export type ParsedWhatsAppMessage = {
  id: string;
  from: string;
  timestamp?: string | null;
  type: string;
  content: string;
  contact?: ContactSnapshot | null;
  raw: JsonRecord;
};

export type ParsedWhatsAppStatus = {
  id: string;
  recipientId?: string | null;
  status: string;
  timestamp?: string | null;
  conversationId?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  raw: JsonRecord;
};

export type ParsedWhatsAppEvent = {
  object?: string | null;
  phoneNumberIds: string[];
  businessAccountIds: string[];
  messages: ParsedWhatsAppMessage[];
  statuses: ParsedWhatsAppStatus[];
};

export type WhatsAppConversationRow = {
  id: string;
  company_id?: string | null;
  contact_id?: string | null;
  customer_phone: string;
  whatsapp_id?: string | null;
  customer_name?: string | null;
  status?: string | null;
  human_state?: string | null;
  shipment_tracking_id?: string | null;
  quote_request_id?: string | null;
  last_message_at?: string | null;
  unread_count?: number | null;
  created_at?: string | null;
  updated_at?: string | null;
};

const HUMAN_TRIGGER_PATTERN = /\b(agent|human|person|support|complaint|refund|dispute|lost|missing|damage|damaged|unsafe|angry|cancel|cancelled|failed|failure|not delivered|wrong|problem)\b/i;
const TRACKING_ID_PATTERN = /\bFLY-[A-Z0-9-]{6,}\b/i;
const MAX_MESSAGE_PREVIEW = 1200;

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : null;
}

function asArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function stringAt(record: JsonRecord | null | undefined, keys: string[]) {
  for (const key of keys) {
    const value = record?.[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return null;
}

function safeText(value?: string | null) {
  const trimmed = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!trimmed) return "";
  return trimmed.length > MAX_MESSAGE_PREVIEW ? `${trimmed.slice(0, MAX_MESSAGE_PREVIEW - 3)}...` : trimmed;
}

function messageContent(message: JsonRecord) {
  const type = stringAt(message, ["type"]) ?? "unknown";
  const text = asRecord(message.text);
  const button = asRecord(message.button);
  const interactive = asRecord(message.interactive);
  const buttonReply = asRecord(interactive?.button_reply);
  const listReply = asRecord(interactive?.list_reply);
  const image = asRecord(message.image);
  const document = asRecord(message.document);

  const content =
    stringAt(text, ["body"]) ??
    stringAt(button, ["text"]) ??
    stringAt(buttonReply, ["title", "id"]) ??
    stringAt(listReply, ["title", "id"]) ??
    stringAt(image, ["caption"]) ??
    stringAt(document, ["caption", "filename"]) ??
    `${type} message received`;

  return safeText(content);
}

function statusError(status: JsonRecord) {
  const firstError = asRecord(asArray(status.errors)[0]);
  const errorData = asRecord(firstError?.error_data);
  return {
    code: stringAt(firstError, ["code"]),
    message: stringAt(errorData, ["details"]) ?? stringAt(firstError, ["message", "title"])
  };
}

function metaTimestamp(value?: string | null) {
  if (value && /^\d+$/.test(value)) return new Date(Number(value) * 1000).toISOString();
  return new Date().toISOString();
}

function eventHash(prefix: string, payload: unknown) {
  return `${prefix}_${crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex").slice(0, 32)}`;
}

export function parseWhatsAppWebhookPayload(body: unknown): ParsedWhatsAppEvent {
  const root = asRecord(body);
  const messages: ParsedWhatsAppMessage[] = [];
  const statuses: ParsedWhatsAppStatus[] = [];
  const phoneNumberIds = new Set<string>();
  const businessAccountIds = new Set<string>();
  const contactNames = new Map<string, ContactSnapshot>();

  for (const entryValue of asArray(root?.entry)) {
    const entry = asRecord(entryValue);
    const entryId = stringAt(entry, ["id"]);
    if (entryId) businessAccountIds.add(entryId);

    for (const changeValue of asArray(entry?.changes)) {
      const change = asRecord(changeValue);
      const value = asRecord(change?.value);
      const metadata = asRecord(value?.metadata);
      const phoneNumberId = stringAt(metadata, ["phone_number_id"]);
      if (phoneNumberId) phoneNumberIds.add(phoneNumberId);

      for (const contactValue of asArray(value?.contacts)) {
        const contact = asRecord(contactValue);
        const profile = asRecord(contact?.profile);
        const waId = stringAt(contact, ["wa_id"]);
        if (waId) {
          contactNames.set(waId, {
            waId,
            name: stringAt(profile, ["name"])
          });
        }
      }

      for (const messageValue of asArray(value?.messages)) {
        const message = asRecord(messageValue);
        const id = stringAt(message, ["id"]);
        const from = stringAt(message, ["from"]);
        if (!message || !id || !from) continue;
        messages.push({
          id,
          from: normalizeWhatsAppPhone(from),
          timestamp: stringAt(message, ["timestamp"]),
          type: stringAt(message, ["type"]) ?? "unknown",
          content: messageContent(message),
          contact: contactNames.get(from) ?? contactNames.get(normalizeWhatsAppPhone(from)) ?? null,
          raw: message
        });
      }

      for (const statusValue of asArray(value?.statuses)) {
        const status = asRecord(statusValue);
        const id = stringAt(status, ["id"]);
        const state = stringAt(status, ["status"]);
        if (!status || !id || !state) continue;
        const conversation = asRecord(status.conversation);
        const error = statusError(status);
        statuses.push({
          id,
          recipientId: stringAt(status, ["recipient_id"]),
          status: state,
          timestamp: stringAt(status, ["timestamp"]),
          conversationId: stringAt(conversation, ["id"]),
          errorCode: error.code,
          errorMessage: error.message,
          raw: status
        });
      }
    }
  }

  return {
    object: stringAt(root, ["object"]),
    phoneNumberIds: Array.from(phoneNumberIds),
    businessAccountIds: Array.from(businessAccountIds),
    messages,
    statuses
  };
}

export function receiptStatus(status: string | null | undefined) {
  const normalized = String(status ?? "").trim().toLowerCase();
  if (normalized === "read") return "READ";
  if (normalized === "delivered") return "DELIVERED";
  if (normalized === "sent") return "SENT";
  if (normalized === "failed") return "FAILED";
  return normalized ? normalized.toUpperCase() : "WEBHOOK_RECEIVED";
}

async function defaultCompanyId(supabase: SupabaseAdminClient) {
  const { data } = await supabase.from("companies").select("id").eq("slug", "fly-logistics").maybeSingle();
  return typeof data?.id === "string" ? data.id : null;
}

async function recordEvent(
  supabase: SupabaseAdminClient,
  eventId: string,
  eventType: string,
  payload: JsonRecord,
  phoneNumberId?: string | null
) {
  const inserted = await supabase
    .from("whatsapp_events")
    .insert({
      event_id: eventId,
      event_type: eventType,
      phone_number_id: phoneNumberId ?? null,
      payload,
      processed_at: new Date().toISOString()
    })
    .select("id")
    .maybeSingle();

  if (!inserted.error) return { duplicate: false };
  if (inserted.error.code === "23505") return { duplicate: true };

  logWarn("WhatsApp event log write failed.", {
    eventType,
    eventId,
    reason: inserted.error.message
  });
  return { duplicate: false, error: inserted.error.message };
}

async function upsertConversation(
  supabase: SupabaseAdminClient,
  message: ParsedWhatsAppMessage,
  companyId: string | null
): Promise<WhatsAppConversationRow | null> {
  const now = metaTimestamp(message.timestamp);
  const contactResult = await supabase
    .from("whatsapp_contacts")
    .upsert(
      {
        company_id: companyId,
        phone: message.from,
        whatsapp_id: message.contact?.waId ?? message.from,
        profile_name: message.contact?.name ?? null,
        display_name: message.contact?.name ?? null,
        last_seen_at: now,
        updated_at: now
      },
      { onConflict: "company_id,phone" }
    )
    .select("id,display_name,profile_name,is_blocked")
    .maybeSingle();

  if (contactResult.error) {
    logWarn("WhatsApp contact upsert failed.", { reason: contactResult.error.message, phone: message.from });
  }

  const existing = await supabase
    .from("whatsapp_conversations")
    .select("*")
    .eq("customer_phone", message.from)
    .maybeSingle();

  const trackingMatch = message.content.match(TRACKING_ID_PATTERN)?.[0]?.toUpperCase() ?? existing.data?.shipment_tracking_id ?? null;
  const humanRequired = HUMAN_TRIGGER_PATTERN.test(message.content) || existing.data?.human_state === "human_required";

  if (existing.data) {
    const updated = await supabase
      .from("whatsapp_conversations")
      .update({
        contact_id: contactResult.data?.id ?? existing.data.contact_id ?? null,
        customer_name: message.contact?.name ?? existing.data.customer_name ?? null,
        whatsapp_id: message.contact?.waId ?? existing.data.whatsapp_id ?? message.from,
        shipment_tracking_id: trackingMatch,
        status: existing.data.status === "resolved" ? "open" : existing.data.status ?? "open",
        human_state: humanRequired ? "human_required" : existing.data.human_state ?? "ai_active",
        last_message_at: now,
        unread_count: Number(existing.data.unread_count ?? 0) + 1,
        updated_at: now
      })
      .eq("id", existing.data.id)
      .select("*")
      .maybeSingle();
    return (updated.data ?? existing.data) as WhatsAppConversationRow;
  }

  const created = await supabase
    .from("whatsapp_conversations")
    .insert({
      company_id: companyId,
      contact_id: contactResult.data?.id ?? null,
      customer_phone: message.from,
      whatsapp_id: message.contact?.waId ?? message.from,
      customer_name: message.contact?.name ?? null,
      shipment_tracking_id: trackingMatch,
      status: "open",
      human_state: humanRequired ? "human_required" : "ai_active",
      last_message_at: now,
      unread_count: 1
    })
    .select("*")
    .maybeSingle();

  if (created.error) {
    logWarn("WhatsApp conversation create failed.", { reason: created.error.message, phone: message.from });
    return null;
  }

  return created.data as WhatsAppConversationRow;
}

async function insertInboundMessage(
  supabase: SupabaseAdminClient,
  message: ParsedWhatsAppMessage,
  conversation: WhatsAppConversationRow | null,
  companyId: string | null
) {
  const inserted = await supabase.from("whatsapp_messages").insert({
    company_id: companyId,
    conversation_id: conversation?.id ?? null,
    whatsapp_message_id: message.id,
    direction: "inbound",
    message_type: message.type,
    sender: message.from,
    recipient: cleanEnv(process.env.WHATSAPP_CLOUD_PHONE_NUMBER_ID) ?? cleanEnv(process.env.WHATSAPP_PHONE_NUMBER_ID) ?? null,
    content: message.content,
    status: "received",
    metadata: {
      whatsappTimestamp: message.timestamp,
      contactName: message.contact?.name ?? null
    },
    created_at: metaTimestamp(message.timestamp)
  });

  if (inserted.error && inserted.error.code !== "23505") {
    logWarn("WhatsApp inbound message write failed.", { reason: inserted.error.message, messageId: message.id });
  }
}

async function updateStatusReceipts(supabase: SupabaseAdminClient, statuses: ParsedWhatsAppStatus[]) {
  let notificationUpdates = 0;
  let inboxUpdates = 0;

  for (const item of statuses) {
    const nextStatus = receiptStatus(item.status);
    const timestamp = metaTimestamp(item.timestamp);
    const payload: Record<string, unknown> = {
      status: nextStatus,
      error_message: item.errorMessage ?? null,
      metadata: {
        whatsapp_status: item.status,
        whatsapp_recipient_id: item.recipientId,
        whatsapp_conversation_id: item.conversationId,
        whatsapp_error_code: item.errorCode
      }
    };
    if (nextStatus === "DELIVERED") payload.delivered_at = timestamp;
    if (nextStatus === "READ") payload.read_at = timestamp;
    if (nextStatus === "SENT") payload.sent_at = timestamp;

    const notificationResult = await supabase
      .from("notification_messages")
      .update(payload)
      .eq("external_message_id", item.id)
      .select("id");
    if (!notificationResult.error) notificationUpdates += notificationResult.data?.length ?? 0;

    const messagePayload: Record<string, unknown> = {
      status: nextStatus,
      error_code: item.errorCode ?? null,
      error_message: item.errorMessage ?? null
    };
    if (nextStatus === "DELIVERED") messagePayload.delivered_at = timestamp;
    if (nextStatus === "READ") messagePayload.read_at = timestamp;
    if (nextStatus === "SENT") messagePayload.sent_at = timestamp;
    if (nextStatus === "FAILED") messagePayload.failed_at = timestamp;

    const inboxResult = await supabase
      .from("whatsapp_messages")
      .update(messagePayload)
      .eq("whatsapp_message_id", item.id)
      .select("id");
    if (!inboxResult.error) inboxUpdates += inboxResult.data?.length ?? 0;
  }

  return { notificationUpdates, inboxUpdates };
}

async function shipmentTrackingResponse(supabase: SupabaseAdminClient, trackingId: string) {
  const { data, error } = await supabase
    .from("shipments")
    .select("tracking_id,status,eta,timeline,updated_at,carrier_status")
    .eq("tracking_id", trackingId)
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    return `We could not find ${trackingId}. Please check the Fly Logistics tracking number and try again: ${canonicalSiteUrl}/tracking`;
  }

  const timeline = Array.isArray(data.timeline) ? data.timeline : [];
  const latest = [...timeline].reverse().find((item) => item && typeof item === "object") as Record<string, unknown> | undefined;
  const latestText =
    typeof latest?.description === "string"
      ? latest.description
      : typeof latest?.label === "string"
        ? latest.label
        : "The latest tracking event is being updated by Fly Logistics operations.";
  const statusMessage = customerTrackingMessageForCarrierStatus(data.status, data.carrier_status);
  const eta = data.eta ? `\nETA: ${data.eta}` : "";

  return [
    `Fly Logistics tracking update`,
    `Tracking ID: ${data.tracking_id}`,
    `Status: ${statusMessage}`,
    eta.trim(),
    `Latest update: ${safeText(latestText)}`,
    `Track anytime: ${canonicalSiteUrl}/tracking?tracking=${encodeURIComponent(String(data.tracking_id))}`
  ].filter(Boolean).join("\n");
}

function intentFor(content: string) {
  const trackingId = content.match(TRACKING_ID_PATTERN)?.[0]?.toUpperCase();
  if (trackingId || /\b(track|where is|package|delivery status|shipment status)\b/i.test(content)) return { type: "track", trackingId };
  if (/\b(quote|price|pricing|cost|rate|how much)\b/i.test(content)) return { type: "quote" };
  if (/\b(book|ship|send a package|create shipment|delivery request)\b/i.test(content)) return { type: "book" };
  if (/\b(payment|wallet|paid|receipt|invoice)\b/i.test(content)) return { type: "payment" };
  if (/\b(international|export|import|worldwide|abroad|overseas)\b/i.test(content)) return { type: "international" };
  if (HUMAN_TRIGGER_PATTERN.test(content) || /\b(help|support|speak|talk)\b/i.test(content)) return { type: "support" };
  return { type: "hello" };
}

async function maybeSendAutomatedReply(
  supabase: SupabaseAdminClient,
  message: ParsedWhatsAppMessage,
  conversation: WhatsAppConversationRow | null
) {
  if (conversation?.human_state === "human_required") return null;

  const humanRequired = HUMAN_TRIGGER_PATTERN.test(message.content);
  const intent = intentFor(message.content);
  let response: string | null = null;

  if (humanRequired || intent.type === "support") {
    response = "Fly Logistics support has received your message. A human support specialist will review this conversation and reply as soon as possible.";
    await supabase
      .from("whatsapp_conversations")
      .update({ human_state: "human_required", status: "open", updated_at: new Date().toISOString() })
      .eq("id", conversation?.id ?? "");
  } else if (intent.type === "track") {
    const rate = await rateLimit(`whatsapp-track:${message.from}`, { limit: 8, windowSeconds: 300 });
    if (!rate.ok) {
      response = "For security, tracking lookups are temporarily limited on this WhatsApp number. Please try again shortly or use the Fly Logistics tracking page.";
    } else if (intent.trackingId) {
      response = await shipmentTrackingResponse(supabase, intent.trackingId);
    } else {
      response = `Please send your Fly Logistics tracking number in this format: TRACK FLY-2026-XXXXXX\nYou can also track here: ${canonicalSiteUrl}/tracking`;
    }
  } else if (intent.type === "quote") {
    response = `Get an instant Fly Logistics delivery price here: ${canonicalSiteUrl}/quote\nYou can choose local, interstate, international import, or international export.`;
  } else if (intent.type === "book") {
    response = `Create or sign in to your Fly Logistics customer account to book securely: ${canonicalSiteUrl}/customer/login\nYour Fly tracking number appears after payment is confirmed.`;
  } else if (intent.type === "payment") {
    response = `Fly Logistics payments are confirmed only after secure server verification. For wallet, receipts, and invoices, sign in here: ${canonicalSiteUrl}/customer`;
  } else if (intent.type === "international") {
    response = `Fly Logistics supports international import and export requests. Start here: ${canonicalSiteUrl}/international-shipping-from-nigeria`;
  } else {
    response = [
      "Welcome to Fly Logistics.",
      "Reply with:",
      "TRACK FLY-2026-XXXXXX for shipment status",
      "QUOTE for delivery pricing",
      "BOOK to create a shipment",
      "INTERNATIONAL for import/export",
      "SUPPORT to speak with customer care"
    ].join("\n");
  }

  if (!response) return null;
  const result = await sendWhatsAppNotification({
    to: message.from,
    message: response,
    workflow: `whatsapp_${intent.type}`,
    entityType: "whatsapp_conversation",
    entityId: conversation?.id ?? message.id,
    metadata: {
      inboundMessageId: message.id,
      intent: intent.type,
      conversationId: conversation?.id ?? null
    }
  });

  if (conversation?.id) {
    await supabase.from("whatsapp_messages").insert({
      company_id: conversation.company_id ?? null,
      conversation_id: conversation.id,
      whatsapp_message_id: result.providerMessageId ?? null,
      direction: "outbound",
      message_type: "text",
      sender: "fly_logistics",
      recipient: message.from,
      content: response,
      status: result.status,
      metadata: {
        workflow: `whatsapp_${intent.type}`,
        provider: result.provider,
        mode: result.mode,
        reason: result.reason ?? null
      },
      sent_at: result.ok ? new Date().toISOString() : null
    });
    await supabase
      .from("whatsapp_conversations")
      .update({ last_message_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", conversation.id);
  }

  return result;
}

export async function processWhatsAppWebhookEvent(supabase: SupabaseAdminClient, event: ParsedWhatsAppEvent, request?: Request) {
  const companyId = await defaultCompanyId(supabase);
  let duplicates = 0;
  let inboundStored = 0;
  let repliesSent = 0;

  for (const message of event.messages) {
    const idempotency = await recordEvent(
      supabase,
      message.id,
      "message",
      { id: message.id, from: message.from, type: message.type, timestamp: message.timestamp, contentPreview: message.content },
      event.phoneNumberIds[0]
    );
    if (idempotency.duplicate) {
      duplicates += 1;
      continue;
    }
    const conversation = await upsertConversation(supabase, message, companyId);
    await insertInboundMessage(supabase, message, conversation, companyId);
    inboundStored += 1;

    const reply = await maybeSendAutomatedReply(supabase, message, conversation);
    if (reply?.ok) repliesSent += 1;
  }

  for (const status of event.statuses) {
    const idempotency = await recordEvent(
      supabase,
      eventHash("status", { id: status.id, status: status.status, timestamp: status.timestamp }),
      "status",
      { id: status.id, status: status.status, recipientId: status.recipientId, timestamp: status.timestamp },
      event.phoneNumberIds[0]
    );
    if (idempotency.duplicate) duplicates += 1;
  }

  const receiptUpdates = await updateStatusReceipts(supabase, event.statuses);

  await writeOperationalEvent(supabase, {
    category: "notification",
    severity: "info",
    message: "WhatsApp Cloud webhook processed.",
    entityType: "whatsapp_webhook",
    entityId: event.messages[0]?.id ?? event.statuses[0]?.id ?? event.businessAccountIds[0] ?? null,
    metadata: {
      provider: "whatsapp_cloud_api",
      object: event.object,
      phoneNumberIds: event.phoneNumberIds,
      businessAccountIds: event.businessAccountIds,
      messageCount: event.messages.length,
      statusCount: event.statuses.length,
      inboundStored,
      duplicates,
      repliesSent,
      receiptUpdates
    },
    request
  });

  return {
    inboundStored,
    repliesSent,
    duplicates,
    receiptUpdates
  };
}
