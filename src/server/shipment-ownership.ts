import type { AuthProfile } from "@/lib/request-auth";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { DEFAULT_COMPANY_SLUG, type TenantContext } from "@/server/tenancy";

type SupabaseAdminClient = NonNullable<ReturnType<typeof getSupabaseAdmin>>;

export type ShipmentOwnershipSource = "fly_operations" | "cloud_tenant";

export type ShipmentOwnership = {
  companyId: string;
  source: ShipmentOwnershipSource;
  explicitlySelectedTenant: boolean;
};

const trustedInternalRoles = new Set(["dispatcher", "customer_care", "moderator", "finance", "warehouse"]);

export function trustedFlyInternalCompanyId() {
  return process.env.FLY_INTERNAL_COMPANY_ID?.trim() || null;
}

export function shipmentOwnershipSourceForActor(
  actor: Pick<AuthProfile, "role" | "company_id">,
  internalCompanyId = trustedFlyInternalCompanyId()
): ShipmentOwnershipSource {
  if (actor.role === "admin") return "fly_operations";
  if (internalCompanyId && actor.company_id === internalCompanyId && trustedInternalRoles.has(actor.role)) {
    return "fly_operations";
  }
  return "cloud_tenant";
}

export function canActorSelectShipmentTenant(actor: Pick<AuthProfile, "role">) {
  return actor.role === "admin";
}

export function shipmentOwnershipErrorStatus(error: unknown) {
  if (!(error instanceof Error)) return null;

  switch (error.message) {
    case "Only Fly Logistics administrators can select a tenant workspace explicitly.":
    case "The selected tenant workspace does not match the active verified tenant context.":
    case "A verified Cloud tenant workspace is required to create this shipment.":
      return 403;
    case "The selected tenant workspace was not found.":
      return 404;
    case "Unable to verify the selected tenant workspace.":
    case "Unable to verify the configured Fly Logistics company.":
    case "The configured Fly Logistics company was not found.":
    case "FLY_INTERNAL_COMPANY_ID must be configured before Fly Logistics can create shipments.":
      return 503;
    default:
      return null;
  }
}

export async function resolveShipmentOwnership(input: {
  supabase: SupabaseAdminClient;
  actor: Pick<AuthProfile, "role" | "company_id">;
  tenant: TenantContext;
  explicitlySelectedTenantId?: string;
}): Promise<ShipmentOwnership> {
  const internalCompanyId = trustedFlyInternalCompanyId();
  const explicitlySelectedTenantId = input.explicitlySelectedTenantId?.trim();

  if (explicitlySelectedTenantId) {
    if (!canActorSelectShipmentTenant(input.actor)) {
      throw new Error("Only Fly Logistics administrators can select a tenant workspace explicitly.");
    }
    const activeTenantId = input.tenant.companyId;
    const activeTenantIsVerifiedCloudTenant =
      input.tenant.schemaReady &&
      Boolean(activeTenantId) &&
      Boolean(input.tenant.company?.id === activeTenantId) &&
      input.tenant.company?.slug !== DEFAULT_COMPANY_SLUG;
    if (activeTenantIsVerifiedCloudTenant && activeTenantId !== explicitlySelectedTenantId) {
      throw new Error("The selected tenant workspace does not match the active verified tenant context.");
    }
    if (explicitlySelectedTenantId === internalCompanyId) {
      throw new Error("Use the Fly Logistics operations workflow for internal shipments.");
    }
    const company = await input.supabase
      .from("companies")
      .select("id")
      .eq("id", explicitlySelectedTenantId)
      .maybeSingle();
    if (company.error) throw new Error("Unable to verify the selected tenant workspace.");
    if (!company.data?.id) throw new Error("The selected tenant workspace was not found.");
    return { companyId: explicitlySelectedTenantId, source: "cloud_tenant", explicitlySelectedTenant: true };
  }

  const source = shipmentOwnershipSourceForActor(input.actor, internalCompanyId);
  if (source === "fly_operations") {
    if (!internalCompanyId) {
      throw new Error("FLY_INTERNAL_COMPANY_ID must be configured before Fly Logistics can create shipments.");
    }
    const company = await input.supabase.from("companies").select("id").eq("id", internalCompanyId).maybeSingle();
    if (company.error) throw new Error("Unable to verify the configured Fly Logistics company.");
    if (!company.data?.id) throw new Error("The configured Fly Logistics company was not found.");
    return { companyId: internalCompanyId, source, explicitlySelectedTenant: false };
  }

  if (!input.tenant.schemaReady || !input.tenant.companyId) {
    throw new Error("A verified Cloud tenant workspace is required to create this shipment.");
  }
  return { companyId: input.tenant.companyId, source, explicitlySelectedTenant: false };
}
