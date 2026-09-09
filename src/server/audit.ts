import type { FlyRole } from "@/lib/roles";
import type { getSupabaseAdmin } from "@/lib/supabase-server";
import { logWarn } from "@/server/monitoring";

type SupabaseAdminClient = NonNullable<ReturnType<typeof getSupabaseAdmin>>;

type AuditActor = {
  id?: string | null;
  email?: string | null;
  role?: FlyRole | null;
};

type AuditInput = {
  actor?: AuditActor | null;
  action: string;
  entityType: string;
  entityId?: string | number | null;
  metadata?: Record<string, unknown>;
  request?: Request;
};

function clientIp(request?: Request) {
  return request?.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? request?.headers.get("x-real-ip") ?? null;
}

export async function writeAuditLog(supabase: SupabaseAdminClient | null, input: AuditInput) {
  if (!supabase) return;

  const payload = {
    actor_id: input.actor?.id ?? null,
    actor_email: input.actor?.email ?? null,
    actor_role: input.actor?.role ?? null,
    action: input.action,
    entity_type: input.entityType,
    entity_id: input.entityId === undefined || input.entityId === null ? null : String(input.entityId),
    metadata: input.metadata ?? {},
    ip_address: clientIp(input.request),
    user_agent: input.request?.headers.get("user-agent") ?? null
  };

  const { error } = await supabase.from("audit_logs").insert(payload);
  if (error) {
    logWarn("Audit log write skipped.", { action: input.action, entityType: input.entityType, reason: error.message });
  }
}
