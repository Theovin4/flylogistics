import assert from "node:assert/strict";
import test from "node:test";
import {
  canActorSelectShipmentTenant,
  resolveShipmentOwnership,
  shipmentOwnershipErrorStatus,
  shipmentOwnershipSourceForActor
} from "../src/server/shipment-ownership";

const flyCompanyId = "ceba317a-ecdd-414c-8668-d5e162e11fa1";
const tenantCompanyId = "6dc19592-4cf2-4e3e-8d38-c0879cd65a1d";

function companyLookup(existingIds: string[]) {
  return {
    from: () => ({
      select: () => ({
        eq: (_column: string, value: string) => ({
          maybeSingle: async () => existingIds.includes(value)
            ? { data: { id: value }, error: null }
            : { data: null, error: null }
        })
      })
    })
  };
}

test("global Fly admin ownership never follows a stale tenant profile", () => {
  assert.equal(
    shipmentOwnershipSourceForActor({ role: "admin", company_id: tenantCompanyId }, flyCompanyId),
    "fly_operations"
  );
});

test("tenant owner remains Cloud-owned", () => {
  assert.equal(
    shipmentOwnershipSourceForActor({ role: "customer", company_id: tenantCompanyId }, flyCompanyId),
    "cloud_tenant"
  );
});

test("only a Fly admin may select an explicit shipment tenant", () => {
  assert.equal(canActorSelectShipmentTenant({ role: "admin" }), true);
  assert.equal(canActorSelectShipmentTenant({ role: "dispatcher" }), false);
  assert.equal(canActorSelectShipmentTenant({ role: "customer" }), false);
  assert.equal(canActorSelectShipmentTenant({ role: "driver" }), false);
});

test("internal staff are Fly-owned only when bound to the trusted ID", () => {
  assert.equal(
    shipmentOwnershipSourceForActor({ role: "dispatcher", company_id: flyCompanyId }, flyCompanyId),
    "fly_operations"
  );
  assert.equal(
    shipmentOwnershipSourceForActor({ role: "dispatcher", company_id: tenantCompanyId }, flyCompanyId),
    "cloud_tenant"
  );
});

test("an admin acting in a verified tenant cannot select a different tenant", async () => {
  const original = process.env.FLY_INTERNAL_COMPANY_ID;
  process.env.FLY_INTERNAL_COMPANY_ID = flyCompanyId;
  try {
    const selected = await resolveShipmentOwnership({
      supabase: companyLookup([flyCompanyId, tenantCompanyId]) as never,
      actor: { role: "admin", company_id: tenantCompanyId },
      tenant: { companyId: tenantCompanyId, companyRole: "owner", company: null, schemaReady: true },
      explicitlySelectedTenantId: tenantCompanyId
    });
    assert.deepEqual(selected, {
      companyId: tenantCompanyId,
      source: "cloud_tenant",
      explicitlySelectedTenant: true
    });

    const globalSelection = await resolveShipmentOwnership({
      supabase: companyLookup([flyCompanyId, tenantCompanyId]) as never,
      actor: { role: "admin", company_id: null },
      tenant: {
        companyId: flyCompanyId,
        companyRole: "owner",
        company: { id: flyCompanyId, name: "Fly Logistics", slug: "fly-logistics" },
        schemaReady: true
      },
      explicitlySelectedTenantId: tenantCompanyId
    });
    assert.deepEqual(globalSelection, {
      companyId: tenantCompanyId,
      source: "cloud_tenant",
      explicitlySelectedTenant: true
    });

    await assert.rejects(
      resolveShipmentOwnership({
        supabase: companyLookup([flyCompanyId, tenantCompanyId, "2d9afc71-d188-42c8-8143-8ae5985169bc"]) as never,
        actor: { role: "admin", company_id: tenantCompanyId },
        tenant: {
          companyId: tenantCompanyId,
          companyRole: "owner",
          company: { id: tenantCompanyId, name: "Tenant A", slug: "tenant-a" },
          schemaReady: true
        },
        explicitlySelectedTenantId: "2d9afc71-d188-42c8-8143-8ae5985169bc"
      }),
      /does not match the active verified tenant context/
    );

    await assert.rejects(
      resolveShipmentOwnership({
        supabase: companyLookup([flyCompanyId, tenantCompanyId]) as never,
        actor: { role: "customer", company_id: tenantCompanyId },
        tenant: { companyId: tenantCompanyId, companyRole: "owner", company: null, schemaReady: true },
        explicitlySelectedTenantId: tenantCompanyId
      }),
      /Only Fly Logistics administrators/
    );
  } finally {
    if (original === undefined) delete process.env.FLY_INTERNAL_COMPANY_ID;
    else process.env.FLY_INTERNAL_COMPANY_ID = original;
  }
});

test("shipment ownership errors become safe client or configuration responses", () => {
  assert.equal(shipmentOwnershipErrorStatus(new Error("Only Fly Logistics administrators can select a tenant workspace explicitly.")), 403);
  assert.equal(shipmentOwnershipErrorStatus(new Error("The selected tenant workspace does not match the active verified tenant context.")), 403);
  assert.equal(shipmentOwnershipErrorStatus(new Error("A verified Cloud tenant workspace is required to create this shipment.")), 403);
  assert.equal(shipmentOwnershipErrorStatus(new Error("The selected tenant workspace was not found.")), 404);
  assert.equal(shipmentOwnershipErrorStatus(new Error("Unable to verify the selected tenant workspace.")), 503);
  assert.equal(shipmentOwnershipErrorStatus(new Error("Unexpected database failure.")), null);
  assert.equal(shipmentOwnershipErrorStatus("unexpected failure"), null);
});
