import { NextResponse } from "next/server";
import { requireRole } from "@/lib/request-auth";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { enforceRateLimit } from "@/server/api";
import { logApiError, requestContext } from "@/server/monitoring";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const limited = await enforceRateLimit(request, "admin-notification-messages", { limit: 60, windowSeconds: 60 });
  if (limited) return limited;

  const access = await requireRole(request, ["admin", "dispatcher"]);
  if (!access.profile) return NextResponse.json({ error: access.error }, { status: access.status });
  if (access.error) return NextResponse.json({ error: access.error }, { status: access.status });

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Notification logs are temporarily unavailable." }, { status: 503 });

  const first = await supabase
    .from("notification_messages")
    .select("id,channel,provider,workflow,recipient,message_body,status,provider_message_id,external_message_id,provider_status,error_message,entity_type,entity_id,created_at,sent_at,delivered_at,read_at")
    .order("created_at", { ascending: false })
    .limit(75);
  let data: unknown[] | null = first.data;
  let error: typeof first.error = first.error;

  if (error && (error.code === "42703" || error.code === "PGRST204")) {
    const fallback = await supabase
      .from("notification_messages")
      .select("id,channel,provider,workflow,recipient,message_body,status,provider_message_id,provider_status,error_message,entity_type,entity_id,created_at")
      .order("created_at", { ascending: false })
      .limit(75);
    data = fallback.data as unknown[] | null;
    error = fallback.error;
  }

  if (error) {
    logApiError(error, "Unable to load notification message logs.", requestContext(request));
    return NextResponse.json({
      messages: [],
      warning: "Notification message logs are being prepared by Fly Logistics operations."
    });
  }

  return NextResponse.json({ messages: data ?? [] });
}
