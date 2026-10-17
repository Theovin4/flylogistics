import type { AuthProfile } from "@/lib/request-auth";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import type { TenantContext } from "@/server/tenancy";

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
    if (explicitlySelectedTenantId === internalCompanyId) {
      throw new Error("Use the Fly Logistics operations workflow for internal shipments.");
    }
    const company = await input.supabase
      .from("companies")
      .select("id")
      .eq("id", explicitlySelectedTenantId)
      .maybeSingle();
    if (company.error || !company.data?.id) {
      throw new Error("The selected tenant workspace could not be verified.");
    }
    return { companyId: explicitlySelectedTenantId, source: "cloud_tenant", explicitlySelectedTenant: true };
  }

  const source = shipmentOwnershipSourceForActor(input.actor, internalCompanyId);
  if (source === "fly_operations") {
    if (!internalCompanyId) {
      throw new Error("FLY_INTERNAL_COMPANY_ID must be configured before Fly Logistics can create shipments.");
    }
    const company = await input.supabase.from("companies").select("id").eq("id", internalCompanyId).maybeSingle();
    if (company.error || !company.data?.id) {
      throw new Error("The configured Fly Logistics company could not be verified.");
    }
    return { companyId: internalCompanyId, source, explicitlySelectedTenant: false };
  }

  if (!input.tenant.schemaReady || !input.tenant.companyId) {
    throw new Error("A verified Cloud tenant workspace is required to create this shipment.");
  }
  return { companyId: input.tenant.companyId, source, explicitlySelectedTenant: false };
}
