import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/request-auth";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { apiError, enforceRateLimit, handleApiError, parseJson } from "@/server/api";
import { writeAuditLog } from "@/server/audit";
import { writeOperationalEvent } from "@/server/operational-events";

export const dynamic = "force-dynamic";

const companyUpdateSchema = z.object({
  companyId: z.string().uuid(),
  status: z.enum(["active", "suspended", "cancelled"]).optional(),
  plan: z.enum(["starter", "growth", "scale"]).optional(),
  trialEndsAt: z.string().datetime().optional()
}).refine((value) => value.status || value.plan || value.trialEndsAt, "Select an account change.");

function pageParams(request: Request) {
  const url = new URL(request.url);
  const page = Math.max(1, Number.parseInt(url.searchParams.get("page") ?? "1", 10) || 1);
  const limit = Math.min(100, Math.max(10, Number.parseInt(url.searchParams.get("limit") ?? "25", 10) || 25));
  return { page, limit, search: url.searchParams.get("search")?.trim().slice(0, 80) ?? "" };
}

export async function GET(request: Request) {
  const limited = await enforceRateLimit(request, "admin-cloud-tenants", { limit: 60, windowSeconds: 60 });
  if (limited) return limited;

  const access = await requireRole(request, ["admin"]);
  if (!access.profile) return apiError(access.error ?? "Admin access is required.", { status: access.status });

  const supabase = getSupabaseAdmin();
  if (!supabase) return apiError("Cloud tenant administration is temporarily unavailable.", { status: 503 });

  const { page, limit, search } = pageParams(request);
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  try {
    let query = supabase
      .from("companies")
      .select("id,name,slug,logo_url,plan,status,subscription_status,subscription_plan,trial_ends_at,billing_email,billing_currency,billing_amount,subscription_started_at,subscription_renews_at,last_billing_status,created_at,updated_at", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(from, to);

    if (search) {
      const escaped = search.replaceAll(",", " ");
      query = query.or(`name.ilike.%${escaped}%,slug.ilike.%${escaped}%,billing_email.ilike.%${escaped}%`);
    }

    const companiesResult = await query;
    if (companiesResult.error) throw companiesResult.error;

    const companyIds = (companiesResult.data ?? []).map((company) => String(company.id));
    const [membersResult, subscriptionsResult] = companyIds.length
      ? await Promise.all([
          supabase.from("company_members").select("company_id,role").in("company_id", companyIds).limit(5000),
          supabase.from("subscriptions").select("company_id,plan,status,amount,currency,renewal_date,created_at").in("company_id", companyIds).order("created_at", { ascending: false }).limit(1000)
        ])
      : [{ data: [], error: null }, { data: [], error: null }];

    if (membersResult.error) throw membersResult.error;
    if (subscriptionsResult.error) throw subscriptionsResult.error;

    const membersByCompany = new Map<string, Record<string, number>>();
    for (const member of membersResult.data ?? []) {
      const companyId = String(member.company_id);
      const counts = membersByCompany.get(companyId) ?? {};
      const role = String(member.role ?? "member");
      counts[role] = (counts[role] ?? 0) + 1;
      membersByCompany.set(companyId, counts);
    }

    const latestSubscription = new Map<string, (typeof subscriptionsResult.data)[number]>();
    for (const subscription of subscriptionsResult.data ?? []) {
      const companyId = String(subscription.company_id);
      if (!latestSubscription.has(companyId)) latestSubscription.set(companyId, subscription);
    }

    const companies = (companiesResult.data ?? []).map((company) => ({
      ...company,
      memberCounts: membersByCompany.get(String(company.id)) ?? {},
      subscription: latestSubscription.get(String(company.id)) ?? null
    }));

    return NextResponse.json({
      companies,
      pagination: {
        page,
        limit,
        total: companiesResult.count ?? companies.length,
        hasMore: from + companies.length < (companiesResult.count ?? 0)
      }
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return handleApiError(error, request, "Unable to load Cloud tenant accounts.");
  }
}

export async function PATCH(request: Request) {
  const limited = await enforceRateLimit(request, "admin-cloud-tenant-update", { limit: 20, windowSeconds: 60 });
  if (limited) return limited;

  const access = await requireRole(request, ["admin"]);
  if (!access.profile) return apiError(access.error ?? "Admin access is required.", { status: access.status });

  const parsed = await parseJson(request, companyUpdateSchema, "Choose a valid tenant account change.");
  if (parsed.response) return parsed.response;

  const supabase = getSupabaseAdmin();
  if (!supabase) return apiError("Cloud tenant administration is temporarily unavailable.", { status: 503 });

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (parsed.data.status) updates.status = parsed.data.status;
  if (parsed.data.plan) {
    updates.plan = parsed.data.plan;
    updates.subscription_plan = parsed.data.plan;
  }
  if (parsed.data.trialEndsAt) updates.trial_ends_at = parsed.data.trialEndsAt;

  try {
    const result = await supabase
      .from("companies")
      .update(updates)
      .eq("id", parsed.data.companyId)
      .select("id,name,slug,plan,status,subscription_status,subscription_plan,trial_ends_at,updated_at")
      .single();
    if (result.error) throw result.error;

    await writeAuditLog(supabase, {
      actor: access.profile,
      action: "cloud.tenant.update",
      entityType: "company",
      entityId: parsed.data.companyId,
      metadata: updates,
      request
    });
    await writeOperationalEvent(supabase, {
      category: "enterprise",
      message: "Cloud tenant account updated by administrator.",
      entityType: "company",
      entityId: parsed.data.companyId,
      metadata: { changedFields: Object.keys(updates).filter((key) => key !== "updated_at") },
      request
    });

    return NextResponse.json({ company: result.data });
  } catch (error) {
    return handleApiError(error, request, "Unable to update the Cloud tenant account.");
  }
}
