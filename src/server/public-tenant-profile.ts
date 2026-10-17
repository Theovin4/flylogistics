import type { SupabaseClient } from "@supabase/supabase-js";
import { publicTenantProfile, type PublicTenantProfile, type TenantBrandProfile } from "@/lib/tenant-branding";
import { logWarn } from "@/server/monitoring";

const PUBLIC_TENANT_SELECT = "id,name,slug,logo_url,brand_color,public_address,public_phone,public_whatsapp,public_support_email,show_contact_on_tracking,status,plan,subscription_status,trial_ends_at,subscription_renews_at";

async function profileForResult(supabase: SupabaseClient, company: Record<string, unknown> | null, companyId: string | null) {
  if (!company || !companyId) return { profile: null as PublicTenantProfile | null, error: null };
  const preferences = await supabase.from("cloud_brand_preferences").select("platform_branding_removed").eq("company_id", companyId).maybeSingle();
  if (preferences.error) {
    const message = preferences.error.message.toLowerCase();
    const missingSchema = ["42p01", "42703", "pgrst204", "pgrst205"].includes(preferences.error.code ?? "") || message.includes("cloud_brand_preferences") && message.includes("could not find");
    if (!missingSchema) return { profile: null as PublicTenantProfile | null, error: preferences.error };
    logWarn("Cloud branding preferences are unavailable; platform branding remains enabled until the schema is installed.", {
      companyId,
      code: preferences.error.code ?? null
    });
  }
  return {
    profile: publicTenantProfile(company as unknown as TenantBrandProfile, preferences.data?.platform_branding_removed === true),
    error: null
  };
}

export async function getPublicTenantProfileById(supabase: SupabaseClient, companyId: string) {
  const result = await supabase.from("companies").select(PUBLIC_TENANT_SELECT).eq("id", companyId).eq("status", "active").maybeSingle();
  if (result.error) return { profile: null as PublicTenantProfile | null, error: result.error };
  return profileForResult(supabase, result.data as Record<string, unknown> | null, companyId);
}

export async function getPublicTenantProfileBySlug(supabase: SupabaseClient, slug: string) {
  const result = await supabase.from("companies").select(PUBLIC_TENANT_SELECT).eq("slug", slug).eq("status", "active").maybeSingle();
  if (result.error || !result.data) return { profile: null as PublicTenantProfile | null, error: result.error };
  return profileForResult(supabase, result.data as Record<string, unknown>, String(result.data.id));
}
