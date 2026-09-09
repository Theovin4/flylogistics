import { NextResponse } from "next/server";
import { requireRole } from "@/lib/request-auth";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { enforceRateLimit } from "@/server/api";
import { logApiError, requestContext } from "@/server/monitoring";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const limited = await enforceRateLimit(request, "admin-audit-logs", { limit: 60, windowSeconds: 60 });
  if (limited) return limited;

  const access = await requireRole(request, ["admin"]);
  if (!access.profile) return NextResponse.json({ error: access.error }, { status: access.status });
  if (access.error) return NextResponse.json({ error: access.error }, { status: access.status });

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Audit logs are temporarily unavailable." }, { status: 503 });

  const { data, error } = await supabase
    .from("audit_logs")
    .select("id,actor_email,actor_role,action,entity_type,entity_id,metadata,ip_address,user_agent,created_at")
    .order("created_at", { ascending: false })
    .limit(75);

  if (error) {
    logApiError(error, "Unable to load audit logs.", requestContext(request));
    return NextResponse.json({
      logs: [],
      warning: "Audit logs are being prepared by Fly Logistics operations."
    });
  }

  return NextResponse.json({ logs: data ?? [] });
}
