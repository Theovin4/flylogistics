import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/request-auth";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { enforceRateLimit, parseJson } from "@/server/api";
import { writeAuditLog } from "@/server/audit";
import { sendEmail, sendInApp, sendSms, sendWhatsApp } from "@/server/notifications/service";
import { writeOperationalEvent } from "@/server/operational-events";

const resendSchema = z.object({
  messageId: z.union([z.string().trim().min(1), z.number()])
});

export async function POST(request: Request) {
  const limited = await enforceRateLimit(request, "admin-notification-resend", { limit: 30, windowSeconds: 60 });
  if (limited) return limited;

  const access = await requireRole(request, ["admin", "dispatcher"]);
  if (!access.profile) return NextResponse.json({ error: access.error }, { status: access.status });
  if (access.error) return NextResponse.json({ error: access.error }, { status: access.status });

  const parsed = await parseJson(request, resendSchema, "Choose a notification message to resend.");
  if (parsed.response) return parsed.response;

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Notification resend is temporarily unavailable." }, { status: 503 });

  const { data: message, error } = await supabase
    .from("notification_messages")
    .select("*")
    .eq("id", parsed.data.messageId)
    .maybeSingle();

  if (error) return NextResponse.json({ error: "Unable to load notification message." }, { status: 500 });
  if (!message) return NextResponse.json({ error: "Notification message not found." }, { status: 404 });

  const metadata = (message.metadata && typeof message.metadata === "object" ? message.metadata : {}) as Record<string, unknown>;
  const input = {
    to: message.recipient,
    message: message.message_body,
    workflow: message.workflow ?? "custom",
    entityType: message.entity_type ?? undefined,
    entityId: message.entity_id ?? undefined,
    metadata: { resentFromMessageId: message.id, originalProvider: message.provider }
  };

  const result =
    message.channel === "sms"
      ? await sendSms(input)
      : message.channel === "email"
        ? await sendEmail({
            ...input,
            emailTo: message.recipient,
            subject: typeof metadata.subject === "string" ? metadata.subject : undefined,
            title: typeof metadata.title === "string" ? metadata.title : undefined
          })
        : message.channel === "in_app"
          ? await sendInApp({
              ...input,
              userId: message.recipient,
              title: typeof metadata.title === "string" ? metadata.title : undefined,
              body: message.message_body,
              category: message.workflow ?? "custom"
            })
          : await sendWhatsApp(input);

  await writeAuditLog(supabase, {
    actor: access.profile,
    action: "notification.resend",
    entityType: "notification",
    entityId: message.id,
    metadata: { channel: message.channel, resultProvider: result.provider, ok: result.ok },
    request
  });
  await writeOperationalEvent(supabase, {
    category: "notification",
    severity: result.ok ? "info" : "warning",
    message: "Notification resend action executed.",
    entityType: message.entity_type ?? "notification",
    entityId: message.entity_id ?? message.id,
    metadata: { channel: message.channel, resultProvider: result.provider, ok: result.ok },
    request
  });

  return NextResponse.json(result, { status: result.ok ? 200 : 202 });
}
