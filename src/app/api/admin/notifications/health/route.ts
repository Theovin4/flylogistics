import { NextResponse } from "next/server";
import { requireRole } from "@/lib/request-auth";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { enforceRateLimit } from "@/server/api";
import { ResendEmailProvider } from "@/server/notifications/email";
import { TermiiSmsProvider } from "@/server/notifications/sms";
import { WhatsAppCloudProvider } from "@/server/notifications/whatsapp";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const limited = await enforceRateLimit(request, "admin-notification-health", { limit: 60, windowSeconds: 60 });
  if (limited) return limited;

  const access = await requireRole(request, ["admin", "dispatcher"]);
  if (!access.profile) return NextResponse.json({ error: access.error }, { status: access.status });
  if (access.error) return NextResponse.json({ error: access.error }, { status: access.status });

  const supabase = getSupabaseAdmin();
  let latest: { data: unknown[] | null; error: { code?: string; message?: string } | null } = supabase
    ? await supabase
        .from("notification_messages")
        .select("channel,provider,status,error_message,created_at,sent_at")
        .order("created_at", { ascending: false })
        .limit(6)
    : { data: [], error: null };

  if (supabase && latest.error && (latest.error.code === "42703" || latest.error.code === "PGRST204")) {
    latest = await supabase
      .from("notification_messages")
      .select("channel,provider,status,error_message,created_at")
      .order("created_at", { ascending: false })
      .limit(6);
  }

  const whatsappProvider = new WhatsAppCloudProvider();
  const whatsapp = await whatsappProvider.diagnose();

  return NextResponse.json({
    email: new ResendEmailProvider().health(),
    whatsapp,
    sms: new TermiiSmsProvider().health(),
    latestMessages: latest.data ?? [],
    warning: latest.error ? "Notification health logs are being prepared by Fly Logistics operations." : null
  });
}
