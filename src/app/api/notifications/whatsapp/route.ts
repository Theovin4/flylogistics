import { NextResponse } from "next/server";
import { z } from "zod";
import { sendWhatsAppNotification } from "@/server/notifications/whatsapp";
import { enforceRateLimit, parseJson } from "@/server/api";
import { writeAuditLog } from "@/server/audit";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { writeOperationalEvent } from "@/server/operational-events";
import { requireCloudFeature } from "@/server/tenancy";

const whatsappNotificationSchema = z.object({
  to: z.string().trim().optional(),
  message: z.string().trim().min(1).max(2000),
  workflow: z.string().trim().max(80).optional(),
  entityType: z.string().trim().max(80).optional(),
  entityId: z.union([z.string().trim().max(160), z.number()]).optional().nullable(),
  metadata: z.record(z.unknown()).optional()
});

export async function POST(request: Request) {
  const limited = await enforceRateLimit(request, "admin-whatsapp-notification", { limit: 40, windowSeconds: 60 });
  if (limited) return limited;

  const access = await requireCloudFeature(request, "whatsapp_notifications", ["owner", "admin", "dispatcher"]);
  if (!access.profile) return NextResponse.json({ error: access.error }, { status: access.status });
  if (access.error) return NextResponse.json({ error: access.error }, { status: access.status });

  const parsed = await parseJson(request, whatsappNotificationSchema, "A recipient and WhatsApp message are required.");
  if (parsed.response) return parsed.response;

  const supabase = getSupabaseAdmin();
  const result = await sendWhatsAppNotification(parsed.data);
  await writeAuditLog(supabase, {
    actor: access.profile,
    action: "notification.whatsapp",
    entityType: "notification",
    entityId: parsed.data.entityId,
    metadata: { provider: result.provider, mode: result.mode, ok: result.ok, workflow: parsed.data.workflow },
    request
  });
  await writeOperationalEvent(supabase, {
    category: "notification",
    severity: result.ok ? "info" : "warning",
    message: "WhatsApp notification action executed.",
    entityType: parsed.data.entityType ?? "notification",
    entityId: parsed.data.entityId,
    metadata: { provider: result.provider, mode: result.mode, ok: result.ok, workflow: parsed.data.workflow },
    request
  });
  return NextResponse.json(result, { status: result.ok ? 200 : 202 });
}
