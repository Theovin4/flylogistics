import { notFound } from "next/navigation";
import { CloudCustomerPortal } from "@/components/cloud/cloud-customer-portal";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { tenantCssVariables } from "@/lib/tenant-branding";
import { getPublicTenantProfileBySlug } from "@/server/public-tenant-profile";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

export default async function TenantCustomerPortalPage({ params }: { params: Promise<{ tenantSlug: string }> }) {
  const { tenantSlug } = await params;
  const supabase = getSupabaseAdmin();
  if (!supabase) notFound();
  const result = await getPublicTenantProfileBySlug(supabase, tenantSlug);
  if (result.error || !result.profile) notFound();
  return <div style={tenantCssVariables(result.profile)}><CloudCustomerPortal company={result.profile} /></div>;
}
