import type { getSupabaseAdmin } from "@/lib/supabase-server";
import { logOperationalEvent, logWarn } from "@/server/monitoring";

type SupabaseAdminClient = NonNullable<ReturnType<typeof getSupabaseAdmin>>;

type OperationalSeverity = "info" | "warning" | "error";

type OperationalEventInput = {
  category: "auth" | "api" | "quote" | "shipment" | "payment" | "dispatch" | "notification" | "media" | "system" | "enterprise" | "merchant" | "warehouse" | "driver" | "ai" | "support";
  severity?: OperationalSeverity;
  message: string;
  entityType?: string;
  entityId?: string | number | null;
  metadata?: Record<string, unknown>;
  request?: Request;
};

function clientIp(request?: Request) {
  return request?.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? request?.headers.get("x-real-ip") ?? null;
}

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

export async function writeOperationalEvent(supabase: SupabaseAdminClient | null, input: OperationalEventInput) {
  const metadata = safeMetadata(input.metadata ?? {}) as Record<string, unknown>;

  logOperationalEvent(input.message, {
    eventCategory: input.category,
    severity: input.severity ?? "info",
    entityType: input.entityType,
    entityId: input.entityId,
    metadata
  });

  if (!supabase) return;

  const { error } = await supabase.from("operational_events").insert({
    category: input.category,
    severity: input.severity ?? "info",
    message: input.message,
    entity_type: input.entityType ?? null,
    entity_id: input.entityId === undefined || input.entityId === null ? null : String(input.entityId),
    metadata,
    ip_address: clientIp(input.request),
    user_agent: input.request?.headers.get("user-agent") ?? null
  });

  if (error) {
    logWarn("Operational event write skipped.", {
      category: input.category,
      entityType: input.entityType,
      entityId: input.entityId,
      reason: error.message
    });
  }
}
