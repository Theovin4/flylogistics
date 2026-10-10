import { cookies } from "next/headers";
import type { ReactNode } from "react";
import { CloudTenantProvider } from "@/components/cloud/cloud-tenant-context";
import { resolveFreshProfileFromAccessToken } from "@/lib/auth-profile";
import type { TenantBrandProfile } from "@/lib/tenant-branding";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { getTenantContextForProfile } from "@/server/tenancy";

export default async function CloudLayout({ children }: { children: ReactNode }) {
  let company: TenantBrandProfile | null = null;
  let role: string | null = null;
  const token = (await cookies()).get("fly_session")?.value;

  if (token) {
    const resolved = await resolveFreshProfileFromAccessToken(token, "cloud-layout");
    const supabase = getSupabaseAdmin();
    if (resolved.profile && supabase) {
      const tenant = await getTenantContextForProfile(supabase, resolved.profile);
      company = tenant.company as TenantBrandProfile | null;
      role = tenant.companyRole;
    }
  }

  return (
    <CloudTenantProvider company={company} role={role}>
      {children}
    </CloudTenantProvider>
  );
}
