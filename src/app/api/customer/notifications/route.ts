import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/request-auth";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { apiError, enforceRateLimit, parseJson } from "@/server/api";
import { logApiError, requestContext } from "@/server/monitoring";

export const dynamic = "force-dynamic";

const notificationUpdateSchema = z.object({
  notificationId: z.coerce.number().optional(),
  readAll: z.boolean().optional()
});

function isMissingNotificationsTable(error: { code?: string; message?: string }) {
  return error.code === "42P01" || error.code === "42703" || error.message?.includes("customer_notifications");
}

export async function GET(request: Request) {
  const limited = await enforceRateLimit(request, "customer-notifications", { limit: 80, windowSeconds: 60 });
  if (limited) return limited;

  const access = await requireRole(request, ["customer"]);
  if (!access.profile) return NextResponse.json({ error: access.error }, { status: access.status });

  const supabase = getSupabaseAdmin();
  if (!supabase) return apiError("Customer notifications are temporarily unavailable.", { status: 503 });

  const { data, error } = await supabase
    .from("customer_notifications")
    .select("id,user_id,title,body,category,entity_type,entity_id,read_at,created_at")
    .eq("user_id", access.profile.id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    if (isMissingNotificationsTable(error)) return NextResponse.json({ notifications: [], warning: "Customer notifications are being prepared by Fly Logistics operations." });
    logApiError(error, "Unable to load customer notifications.", requestContext(request, { userId: access.profile.id }));
    return apiError("Unable to load notifications.", { status: 500 });
  }

  return NextResponse.json({ notifications: data ?? [] });
}

export async function PATCH(request: Request) {
  const limited = await enforceRateLimit(request, "customer-notifications-update", { limit: 40, windowSeconds: 60 });
  if (limited) return limited;

  const access = await requireRole(request, ["customer"]);
  if (!access.profile) return NextResponse.json({ error: access.error }, { status: access.status });

  const parsed = await parseJson(request, notificationUpdateSchema, "A valid notification update is required.");
  if (parsed.response) return parsed.response;
  if (!parsed.data.readAll && !parsed.data.notificationId) {
    return apiError("Choose one notification or mark all as read.", { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) return apiError("Customer notifications are temporarily unavailable.", { status: 503 });

  const readAt = new Date().toISOString();
  const query = supabase
    .from("customer_notifications")
    .update({ read_at: readAt })
    .eq("user_id", access.profile.id);

  const result = parsed.data.readAll ? await query : await query.eq("id", parsed.data.notificationId ?? 0);

  if (result.error) {
    if (isMissingNotificationsTable(result.error)) return apiError("Customer notifications are being prepared by Fly Logistics operations.", { status: 503 });
    logApiError(result.error, "Unable to update customer notification.", requestContext(request, { userId: access.profile.id }));
    return apiError("Unable to update notification.", { status: 500 });
  }

  const logUpdate = supabase
    .from("notification_messages")
    .update({ read_at: readAt, status: "READ" })
    .eq("channel", "in_app")
    .eq("recipient", access.profile.id);

  const logResult = parsed.data.readAll
    ? await logUpdate.is("read_at", null)
    : await logUpdate.eq("external_message_id", String(parsed.data.notificationId ?? 0));

  if (logResult.error && logResult.error.code !== "42703" && logResult.error.code !== "PGRST204") {
    logApiError(logResult.error, "Unable to update in-app notification read log.", requestContext(request, { userId: access.profile.id }));
  }

  return NextResponse.json({ ok: true });
}
