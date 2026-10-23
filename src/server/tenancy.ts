import { getSupabaseAdmin } from "@/lib/supabase-server";
import { hasCloudFeature, resolveCloudEntitlements, type CloudFeature } from "@/lib/cloud-plans";
import type { AuthProfile } from "@/lib/request-auth";
import { getRequestProfile } from "@/lib/request-auth";
import type { FlyRole } from "@/lib/roles";
import { logApiError, logWarn, requestContext } from "@/server/monitoring";

export const DEFAULT_COMPANY_SLUG = "fly-logistics";

export type CloudCompanyRole = "owner" | "admin" | "dispatcher" | "driver" | "customer";

export type CloudCompany = {
  id: string;
  name: string;
  slug: string;
  logo_url?: string | null;
  logo_storage_path?: string | null;
  brand_color?: string | null;
  accent_color?: string | null;
  support_email?: string | null;
  support_phone?: string | null;
  business_address?: string | null;
  public_address?: string | null;
  public_phone?: string | null;
  public_whatsapp?: string | null;
  public_support_email?: string | null;
  show_contact_on_tracking?: boolean | null;
  branding_updated_at?: string | null;
  country?: string | null;
  timezone?: string | null;
  currency?: string | null;
  locale?: string | null;
  custom_domain?: string | null;
  plan?: string | null;
  status?: string | null;
  subscription_status?: string | null;
  subscription_plan?: string | null;
  trial_ends_at?: string | null;
  billing_email?: string | null;
  billing_currency?: string | null;
  billing_amount?: number | string | null;
  flutterwave_subscription_reference?: string | null;
  subscription_started_at?: string | null;
  subscription_renews_at?: string | null;
  last_billing_reference?: string | null;
  last_billing_status?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type TenantContext = {
  companyId: string | null;
  companyRole: CloudCompanyRole | null;
  company: CloudCompany | null;
  schemaReady: boolean;
};

type SupabaseAdminClient = NonNullable<ReturnType<typeof getSupabaseAdmin>>;
type TenantSchemaError = { code?: string; message?: string } | null | undefined;

const COMPANY_SELECT =
  "id,name,slug,logo_url,logo_storage_path,brand_color,accent_color,support_email,support_phone,business_address,public_address,public_phone,public_whatsapp,public_support_email,show_contact_on_tracking,branding_updated_at,country,timezone,currency,locale,custom_domain,plan,status,subscription_status,subscription_plan,trial_ends_at,billing_email,billing_currency,billing_amount,flutterwave_subscription_reference,subscription_started_at,subscription_renews_at,last_billing_reference,last_billing_status,created_at,updated_at";

export function isTenantSchemaMissing(error: TenantSchemaError) {
  return error?.code === "42P01" || error?.code === "42703" || error?.code === "PGRST204";
}

function roleToCompanyRole(role: FlyRole): CloudCompanyRole {
  if (role === "admin") return "owner";
  if (role === "dispatcher") return "dispatcher";
  if (role === "driver") return "driver";
  return "customer";
}

export function isCompanyOperator(role: CloudCompanyRole | null | undefined) {
  return role === "owner" || role === "admin" || role === "dispatcher";
}

export function isCompanyAdmin(role: CloudCompanyRole | null | undefined) {
  return role === "owner" || role === "admin";
}

export function isShipmentDriver(profileRole: string | null | undefined, companyRole: CloudCompanyRole | null | undefined) {
  return profileRole === "driver" || (profileRole === "customer" && companyRole === "driver");
}

export async function getDefaultCompany(supabase: SupabaseAdminClient) {
  const result = await supabase
    .from("companies")
    .select(COMPANY_SELECT)
    .eq("slug", DEFAULT_COMPANY_SLUG)
    .maybeSingle();

  if (result.error && isTenantSchemaMissing(result.error)) {
    return { company: null as CloudCompany | null, error: null, schemaReady: false };
  }

  return {
    company: (result.data as CloudCompany | null) ?? null,
    error: result.error,
    schemaReady: true
  };
}

export async function removeDefaultCompanyMembership(
  supabase: SupabaseAdminClient,
  userId: string
) {
  const company = await supabase
    .from("companies")
    .select("id")
    .eq("slug", DEFAULT_COMPANY_SLUG)
    .maybeSingle();
  if (company.error) {
    if (company.error.code === "42P01") return null;
    return company.error;
  }
  if (!company.data) return null;

  const membership = await supabase
    .from("company_members")
    .delete()
    .eq("company_id", company.data.id)
    .eq("user_id", userId);

  if (membership.error?.code === "42P01") return null;
  return membership.error;
}

export async function getTenantContextForProfile(
  supabase: SupabaseAdminClient,
  profile: Pick<AuthProfile, "id" | "role" | "company_id">
): Promise<TenantContext> {
  let membershipQuery = supabase
    .from("company_members")
    .select(`company_id,role,companies(${COMPANY_SELECT})`)
    .eq("user_id", profile.id);

  // Cloud signup updates profile.company_id to the new workspace. Prefer that
  // explicit context over an older default-company membership from auth signup.
  if (profile.company_id) {
    membershipQuery = membershipQuery.eq("company_id", profile.company_id);
  }

  const membership = await membershipQuery
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!membership.error && membership.data) {
    const companyData = Array.isArray(membership.data.companies)
      ? membership.data.companies[0]
      : membership.data.companies;

    return {
      companyId: String(membership.data.company_id),
      companyRole: (membership.data.role as CloudCompanyRole | null) ?? roleToCompanyRole(profile.role),
      company: (companyData as CloudCompany | null) ?? null,
      schemaReady: true
    };
  }

  if (membership.error && !isTenantSchemaMissing(membership.error)) {
    logWarn("Unable to resolve company membership; falling back to profile company.", {
      userId: profile.id,
      reason: membership.error.message
    });
  }

  const fallbackCompanyId = profile.company_id ?? null;
  if (fallbackCompanyId && !isTenantSchemaMissing(membership.error)) {
    const company = await supabase
      .from("companies")
      .select(COMPANY_SELECT)
      .eq("id", fallbackCompanyId)
      .maybeSingle();

    if (!company.error) {
      return {
        companyId: fallbackCompanyId,
        companyRole: roleToCompanyRole(profile.role),
        company: (company.data as CloudCompany | null) ?? null,
        schemaReady: true
      };
    }
  }

  const defaultCompany = await getDefaultCompany(supabase);
  if (defaultCompany.error) {
    logWarn("Unable to resolve default Fly Logistics company.", {
      userId: profile.id,
      reason: defaultCompany.error.message
    });
  }

  return {
    companyId: defaultCompany.company?.id ?? fallbackCompanyId,
    companyRole: roleToCompanyRole(profile.role),
    company: defaultCompany.company,
    schemaReady: defaultCompany.schemaReady
  };
}

export async function getRequestTenantContext(request: Request) {
  const access = await getRequestProfile(request);
  if (!access.profile) return { ...access, tenant: null as TenantContext | null };

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return {
      ...access,
      tenant: null as TenantContext | null,
      status: 503,
      error: "Company workspace is temporarily unavailable."
    };
  }

  try {
    const tenant = await getTenantContextForProfile(supabase, access.profile);
    return { ...access, tenant };
  } catch (error) {
    logApiError(error, "Unable to resolve company workspace.", requestContext(request, { userId: access.profile.id }));
    return {
      ...access,
      tenant: null as TenantContext | null,
      status: 500,
      error: "Unable to resolve company workspace."
    };
  }
}

export async function requireCompanyRole(
  request: Request,
  allowedRoles: CloudCompanyRole[] = ["owner", "admin", "dispatcher"]
) {
  const access = await getRequestTenantContext(request);
  if (!access.profile || !access.tenant) return access;
  if (access.profile.role === "admin") return access;
  if (access.tenant.companyRole && allowedRoles.includes(access.tenant.companyRole)) return access;
  return {
    ...access,
    status: 403,
    error: "Your company role does not have access to this workspace action."
  };
}

export function getTenantEntitlements(tenant: TenantContext | null | undefined) {
  return resolveCloudEntitlements(tenant?.company, {
    internalCompanyId: process.env.FLY_INTERNAL_COMPANY_ID?.trim() || null
  });
}

export async function requireCloudFeature(
  request: Request,
  feature: CloudFeature,
  allowedRoles: CloudCompanyRole[] = ["owner", "admin", "dispatcher"]
) {
  const access = await requireCompanyRole(request, allowedRoles);
  if (!access.profile || !access.tenant || access.error) return { ...access, entitlements: null };

  const entitlements = getTenantEntitlements(access.tenant);
  if (entitlements.accessState === "restricted") {
    return {
      ...access,
      entitlements,
      status: 402,
      error: entitlements.billingStatus === "expired"
        ? "Your trial or subscription has expired. Choose a plan to continue."
        : "Your Cloud subscription requires attention before this action can continue."
    };
  }

  if (!hasCloudFeature(entitlements, feature)) {
    return {
      ...access,
      entitlements,
      status: 403,
      error: `This feature is not included in the ${entitlements.plan} plan. Upgrade your Cloud plan to continue.`
    };
  }

  return { ...access, entitlements };
}

export function withCompanyId<T extends Record<string, unknown>>(payload: T, companyId?: string | null): T {
  if (!companyId) return payload;
  return { ...payload, company_id: companyId };
}
