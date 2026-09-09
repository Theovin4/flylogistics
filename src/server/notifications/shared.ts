import { getSupabaseAdmin } from "@/lib/supabase-server";
import { logWarn } from "@/server/monitoring";
import { writeOperationalEvent } from "@/server/operational-events";

export type NotificationChannel = "email" | "whatsapp" | "sms" | "in_app";

export type NotificationRequest = {
  to?: string | null;
  message: string;
  workflow?: string;
  entityType?: string;
  entityId?: string | number | null;
  metadata?: Record<string, unknown>;
};

export type NotificationDeliveryResult = {
  ok: boolean;
  mode: "link" | "sent" | "queued" | "failed" | "not_configured";
  provider: string;
  status: "LINK_READY" | "SENT" | "QUEUED" | "DELIVERED" | "READ" | "FAILED" | "NOT_CONFIGURED";
  url?: string;
  providerMessageId?: string;
  providerStatus?: string;
  reason?: string;
};

function safeMetadata(value: unknown, seen = new WeakSet<object>(), depth = 0): unknown {
  if (value === undefined) return null;
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (depth > 8) return "[max-depth]";
  if (Array.isArray(value)) return value.map((item) => safeMetadata(item, seen, depth + 1));
  if (typeof value === "object") {
    if (seen.has(value)) return "[circular]";
    seen.add(value);
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => {
        if (/(secret|api[_-]?key|token|authorization|password)/i.test(key)) return [key, "[redacted]"];
        return [key, safeMetadata(item, seen, depth + 1)];
      })
    );
  }
  return String(value);
}

function insertPayload(channel: NotificationChannel, input: NotificationRequest, result: NotificationDeliveryResult) {
  const sentAt = result.ok && result.status !== "LINK_READY" ? new Date().toISOString() : null;
  const deliveredAt = result.ok && ["DELIVERED", "READ"].includes(result.status) ? sentAt : null;
  const readAt = result.ok && result.status === "READ" ? sentAt : null;

  return {
    channel,
    provider: result.provider,
    workflow: input.workflow ?? "custom",
    recipient: input.to ?? null,
    message_body: input.message,
    status: result.status,
    provider_message_id: result.providerMessageId ?? null,
    external_message_id: result.providerMessageId ?? null,
    provider_status: result.providerStatus ?? result.mode,
    error_message: result.reason ?? null,
    entity_type: input.entityType ?? null,
    entity_id: input.entityId === undefined || input.entityId === null ? null : String(input.entityId),
    metadata: safeMetadata(input.metadata ?? {}),
    sent_at: sentAt,
    delivered_at: deliveredAt,
    read_at: readAt
  };
}

function optionalNotificationColumn(error: { message?: string; code?: string } | null | undefined) {
  const message = error?.message ?? "";
  return message.match(/column "([^"]+)" of relation "notification_messages"/i)?.[1] ?? message.match(/Could not find the '([^']+)' column/i)?.[1] ?? null;
}

export async function recordNotificationAttempt(
  channel: NotificationChannel,
  input: NotificationRequest,
  result: NotificationDeliveryResult
) {
  const supabase = getSupabaseAdmin();

  await writeOperationalEvent(supabase, {
    category: "notification",
    severity: result.ok ? "info" : "warning",
    message: result.ok ? `${channel.toUpperCase()} notification processed.` : `${channel.toUpperCase()} notification failed or is not configured.`,
    entityType: input.entityType ?? "notification",
    entityId: input.entityId,
    metadata: {
      channel,
      workflow: input.workflow,
      provider: result.provider,
      mode: result.mode,
      status: result.status,
      providerMessageId: result.providerMessageId,
      reason: result.reason,
      ...input.metadata
    }
  });

  if (!supabase) return;

  const payload = insertPayload(channel, input, result) as Record<string, unknown>;
  const removedColumns = new Set<string>();
  let lastError: { message: string; code?: string } | null = null;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const currentPayload = { ...payload };
    removedColumns.forEach((column) => delete currentPayload[column]);
    const inserted = await supabase.from("notification_messages").insert(currentPayload);
    if (!inserted.error) return;

    lastError = inserted.error;
    const missing = optionalNotificationColumn(inserted.error);
    if (!missing || removedColumns.has(missing) || !(missing in payload)) break;
    removedColumns.add(missing);
  }

  logWarn("Notification message log write skipped.", {
    channel,
    workflow: input.workflow,
    provider: result.provider,
    reason: lastError?.message ?? "Unknown notification log write error."
  });
}
