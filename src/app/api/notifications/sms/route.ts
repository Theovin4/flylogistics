import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { enforceRateLimit, parseJson } from "@/server/api";
import { writeAuditLog } from "@/server/audit";
import { sendSms } from "@/server/notifications/service";
import { writeOperationalEvent } from "@/server/operational-events";
import { requireCloudFeature } from "@/server/tenancy";

const smsNotificationSchema = z.object({
  to: z.string().trim().min(5).max(40),
  message: z.string().trim().min(1).max(459),
  workflow: z.string().trim().max(80).optional(),
  entityType: z.string().trim().max(80).optional(),
  entityId: z.union([z.string().trim().max(160), z.number()]).optional().nullable(),
  route: z.enum(["dnd", "generic"]).optional(),
  metadata: z.record(z.unknown()).optional()
});

export async function POST(request: Request) {
  const limited = await enforceRateLimit(request, "admin-sms-notification", { limit: 40, windowSeconds: 60 });
  if (limited) return limited;

  const access = await requireCloudFeature(request, "operations", ["owner", "admin", "dispatcher"]);
  if (!access.profile) return NextResponse.json({ error: access.error }, { status: access.status });
  if (access.error) return NextResponse.json({ error: access.error }, { status: access.status });

  const parsed = await parseJson(request, smsNotificationSchema, "A recipient and SMS message are required.");
  if (parsed.response) return parsed.response;

  const supabase = getSupabaseAdmin();
  const result = await sendSms(parsed.data);
  await writeAuditLog(supabase, {
    actor: access.profile,
    action: "notification.sms",
    entityType: "notification",
    entityId: parsed.data.entityId,
    metadata: { provider: result.provider, mode: result.mode, ok: result.ok, workflow: parsed.data.workflow },
    request
  });
  await writeOperationalEvent(supabase, {
    category: "notification",
    severity: result.ok ? "info" : "warning",
    message: "SMS notification action executed.",
    entityType: parsed.data.entityType ?? "notification",
    entityId: parsed.data.entityId,
    metadata: { provider: result.provider, mode: result.mode, ok: result.ok, workflow: parsed.data.workflow },
    request
  });

  return NextResponse.json(result, { status: result.ok ? 200 : 202 });
}
