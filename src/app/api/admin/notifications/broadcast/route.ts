import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/request-auth";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { apiError, enforceRateLimit, parseJson } from "@/server/api";
import { writeAuditLog } from "@/server/audit";
import { logApiError, requestContext } from "@/server/monitoring";
import { sendCustomerNotification, type CustomerNotificationChannel } from "@/server/notifications/service";
import { writeOperationalEvent } from "@/server/operational-events";

export const dynamic = "force-dynamic";

const broadcastSchema = z.object({
  title: z.string().trim().min(3).max(120),
  body: z.string().trim().min(5).max(1200),
  audience: z.enum(["all_customers", "customers_with_shipments", "customers_with_quotes"]).default("all_customers"),
  severity: z.enum(["info", "warning"]).default("info"),
  channels: z.array(z.enum(["in_app", "email", "whatsapp"])).min(1).max(3).default(["in_app"]),
  entityType: z.string().trim().max(80).optional(),
  entityId: z.union([z.string().trim().max(160), z.number()]).optional().nullable()
});

type CustomerRecipient = {
  id: string;
  email: string | null;
  full_name?: string | null;
  phone?: string | null;
  email_notifications_enabled?: boolean | null;
  whatsapp_notifications_enabled?: boolean | null;
  sms_notifications_enabled?: boolean | null;
};

async function loadRecipients(supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>, audience: z.infer<typeof broadcastSchema>["audience"]) {
  const profiles = await supabase
    .from("user_profiles")
    .select("id,email,full_name,phone,email_notifications_enabled,whatsapp_notifications_enabled,sms_notifications_enabled")
    .eq("role", "customer")
    .order("created_at", { ascending: false })
    .limit(500);

  let data = profiles.data as CustomerRecipient[] | null;
  let error = profiles.error;

  if (error && (error.code === "42703" || error.code === "PGRST204")) {
    const fallback = await supabase
      .from("user_profiles")
      .select("id,email,full_name,phone,whatsapp_notifications_enabled,sms_notifications_enabled")
      .eq("role", "customer")
      .limit(500);
    data = fallback.data as CustomerRecipient[] | null;
    error = fallback.error;
  }

  if (error || !data?.length) return { data: data ?? [], error };
  if (audience === "all_customers") return { data, error: null };

  const emails = data.map((profile) => profile.email).filter(Boolean) as string[];
  if (!emails.length) return { data: [], error: null };

  const table = audience === "customers_with_shipments" ? "shipments" : "quote_requests";
  const emailColumn = audience === "customers_with_shipments" ? "customer_email" : "customer_email";
  const linked = await supabase
    .from(table)
    .select(emailColumn)
    .in(emailColumn, emails)
    .limit(1000);

  if (linked.error) return { data, error: null };
  const linkedEmails = new Set((linked.data ?? []).map((row) => String((row as Record<string, unknown>)[emailColumn] ?? "").toLowerCase()).filter(Boolean));
  return { data: data.filter((profile) => linkedEmails.has(String(profile.email ?? "").toLowerCase())), error: null };
}

export async function POST(request: Request) {
  const limited = await enforceRateLimit(request, "admin-notification-broadcast", { limit: 8, windowSeconds: 300 });
  if (limited) return limited;

  const access = await requireRole(request, ["admin"]);
  if (!access.profile) return NextResponse.json({ error: access.error }, { status: access.status });
  if (access.error) return NextResponse.json({ error: access.error }, { status: access.status });

  const parsed = await parseJson(request, broadcastSchema, "Complete the broadcast message.");
  if (parsed.response) return parsed.response;

  const supabase = getSupabaseAdmin();
  if (!supabase) return apiError("Notification broadcast is temporarily unavailable.", { status: 503 });

  const audience = parsed.data.audience ?? "all_customers";
  const recipients = await loadRecipients(supabase, audience);
  if (recipients.error) {
    logApiError(recipients.error, "Unable to load broadcast recipients.", requestContext(request, { audience }));
    return apiError("Unable to load broadcast recipients.", { status: 500 });
  }

  const broadcastId = `FLY-BROADCAST-${Date.now()}`;
  const channels = parsed.data.channels as CustomerNotificationChannel[];
  const results = [];

  for (const recipient of recipients.data) {
    const result = await sendCustomerNotification({
      channels,
      to: recipient.phone,
      emailTo: recipient.email,
      message: `${parsed.data.title}\n\n${parsed.data.body}`,
      workflow: parsed.data.severity === "warning" ? "service_alert" : "admin_broadcast",
      entityType: parsed.data.entityType ?? "announcement",
      entityId: parsed.data.entityId ?? broadcastId,
        metadata: { broadcastId, audience, title: parsed.data.title, subject: `Fly Logistics: ${parsed.data.title}` },
      preferences: {
        userId: recipient.id,
        email: recipient.email,
        emailEnabled: recipient.email_notifications_enabled !== false,
        whatsappEnabled: recipient.whatsapp_notifications_enabled !== false,
        smsEnabled: recipient.sms_notifications_enabled !== false
      },
      emailSubject: `Fly Logistics: ${parsed.data.title}`,
      emailTitle: parsed.data.title,
      inAppTitle: parsed.data.title,
      inAppBody: parsed.data.body,
      inAppCategory: parsed.data.severity === "warning" ? "service_alert" : "announcement",
      emailCtaLabel: "Open dashboard",
      emailCtaUrl: "https://flylogistics.com.ng/customer"
    });
    results.push(result);
  }

  await writeAuditLog(supabase, {
    actor: access.profile,
    action: "notification.broadcast",
    entityType: "announcement",
    entityId: broadcastId,
    metadata: { audience, channels, total: recipients.data.length, success: results.filter((result) => result.ok).length },
    request
  });

  await writeOperationalEvent(supabase, {
    category: "notification",
    severity: parsed.data.severity,
    message: parsed.data.severity === "warning" ? "Service alert broadcast sent." : "Customer announcement broadcast sent.",
    entityType: "announcement",
    entityId: broadcastId,
    metadata: { audience, channels, total: recipients.data.length, success: results.filter((result) => result.ok).length },
    request
  });

  return NextResponse.json({
    ok: true,
    broadcastId,
    total: recipients.data.length,
    success: results.filter((result) => result.ok).length,
    failed: results.filter((result) => !result.ok).length
  });
}
