import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { enforceRateLimit, parseJson } from "@/server/api";
import { writeAuditLog } from "@/server/audit";
import { requireCloudFeature, requireCompanyRole } from "@/server/tenancy";

export const dynamic = "force-dynamic";

const preferencesSchema = z.object({ platformBrandingRemoved: z.boolean() });

export async function GET(request: Request) {
  const limited = await enforceRateLimit(request, "cloud-brand-preferences", { limit: 30, windowSeconds: 60 });
  if (limited) return limited;
  const access = await requireCompanyRole(request, ["owner", "admin"]);
  if (!access.profile || !access.tenant || access.error) return NextResponse.json({ error: access.error }, { status: access.status });
  if (!access.tenant.companyId) return NextResponse.json({ error: "Company workspace is not configured." }, { status: 409 });
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Branding preferences are unavailable." }, { status: 503 });
  const result = await supabase.from("cloud_brand_preferences").select("platform_branding_removed").eq("company_id", access.tenant.companyId).maybeSingle();
  if (result.error) return NextResponse.json({ error: "Unable to load branding preferences." }, { status: 500 });
  return NextResponse.json({ platformBrandingRemoved: result.data?.platform_branding_removed ?? false });
}

export async function PATCH(request: Request) {
  const limited = await enforceRateLimit(request, "cloud-brand-preferences-update", { limit: 15, windowSeconds: 60 });
  if (limited) return limited;
  const access = await requireCompanyRole(request, ["owner", "admin"]);
  if (!access.profile || !access.tenant || access.error) return NextResponse.json({ error: access.error }, { status: access.status });
  if (!access.tenant.companyId) return NextResponse.json({ error: "Company workspace is not configured." }, { status: 409 });
  const parsed = await parseJson(request, preferencesSchema, "Choose a valid platform branding preference.");
  if (parsed.response) return parsed.response;

  if (parsed.data.platformBrandingRemoved) {
    const featureAccess = await requireCloudFeature(request, "remove_platform_branding", ["owner", "admin"]);
    if (!featureAccess.profile || featureAccess.error) return NextResponse.json({ error: featureAccess.error }, { status: featureAccess.status });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Branding preferences are unavailable." }, { status: 503 });
  const result = await supabase.from("cloud_brand_preferences").upsert({
    company_id: access.tenant.companyId,
    platform_branding_removed: parsed.data.platformBrandingRemoved,
    updated_at: new Date().toISOString()
  }, { onConflict: "company_id" }).select("platform_branding_removed").single();
  if (result.error) return NextResponse.json({ error: "Unable to save branding preferences." }, { status: 500 });
  await writeAuditLog(supabase, { actor: access.profile, action: "cloud.branding.preference_update", entityType: "cloud_brand_preference", entityId: access.tenant.companyId, request });
  return NextResponse.json({ platformBrandingRemoved: result.data.platform_branding_removed });
}
