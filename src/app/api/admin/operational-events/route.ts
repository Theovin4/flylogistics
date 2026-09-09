import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/request-auth";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { apiError, enforceRateLimit } from "@/server/api";
import { logApiError, requestContext } from "@/server/monitoring";
import { getTenantContextForProfile } from "@/server/tenancy";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  severity: z.enum(["all", "info", "warning", "error"]).default("all"),
  category: z.string().trim().max(80).optional().catch(undefined),
  entityType: z.string().trim().max(80).optional().catch(undefined),
  entityId: z.string().trim().max(120).optional().catch(undefined),
  limit: z.coerce.number().int().min(25).max(200).default(100)
});

export async function GET(request: Request) {
  const limited = await enforceRateLimit(request, "admin-operational-events", { limit: 60, windowSeconds: 60 });
  if (limited) return limited;

  const access = await requireRole(request, ["admin"]);
  if (!access.profile) return NextResponse.json({ error: access.error }, { status: access.status });
  if (access.error) return NextResponse.json({ error: access.error }, { status: access.status });

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Operational events are temporarily unavailable." }, { status: 503 });
  const tenant = await getTenantContextForProfile(supabase, access.profile);

  const params = Object.fromEntries(new URL(request.url).searchParams.entries());
  const parsed = querySchema.safeParse(params);
  if (!parsed.success) return apiError("Invalid operational event filters.", { status: 400, details: parsed.error.issues });

  let query = supabase
    .from("operational_events")
    .select("id,category,severity,message,entity_type,entity_id,metadata,ip_address,created_at")
    .order("created_at", { ascending: false })
    .limit(parsed.data.limit);

  if (parsed.data.severity !== "all") query = query.eq("severity", parsed.data.severity);
  if (parsed.data.category) query = query.ilike("category", `%${parsed.data.category}%`);
  if (parsed.data.entityType) query = query.ilike("entity_type", `%${parsed.data.entityType}%`);
  if (parsed.data.entityId) query = query.ilike("entity_id", `%${parsed.data.entityId}%`);
  if (tenant.schemaReady && tenant.companyId) query = query.eq("company_id", tenant.companyId);

  const { data, error } = await query;

  if (error) {
    logApiError(error, "Unable to load operational events.", requestContext(request));
    return NextResponse.json({
      events: [],
      warning: "Operational events are being prepared by Fly Logistics operations."
    });
  }

  return NextResponse.json({ events: data ?? [] });
}
