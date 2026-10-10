import type { SupabaseClient } from "@supabase/supabase-js";
import { publicTenantProfile, type PublicTenantProfile, type TenantBrandProfile } from "@/lib/tenant-branding";

const PUBLIC_TENANT_SELECT = "id,name,slug,logo_url,brand_color,public_address,public_phone,public_whatsapp,public_support_email,show_contact_on_tracking,status";

export async function getPublicTenantProfileById(supabase: SupabaseClient, companyId: string) {
  const result = await supabase.from("companies").select(PUBLIC_TENANT_SELECT).eq("id", companyId).eq("status", "active").maybeSingle();
  return { profile: result.data ? publicTenantProfile(result.data as TenantBrandProfile) : null as PublicTenantProfile | null, error: result.error };
}

export async function getPublicTenantProfileBySlug(supabase: SupabaseClient, slug: string) {
  const result = await supabase.from("companies").select(PUBLIC_TENANT_SELECT).eq("slug", slug).eq("status", "active").maybeSingle();
  return { profile: result.data ? publicTenantProfile(result.data as TenantBrandProfile) : null as PublicTenantProfile | null, error: result.error };
}
