import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/request-auth";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { apiError, enforceRateLimit, parseJson } from "@/server/api";
import { writeAuditLog } from "@/server/audit";
import { logApiError, requestContext } from "@/server/monitoring";

export const dynamic = "force-dynamic";

const addressUpdateSchema = z.object({
  label: z.string().trim().min(1).max(80).optional(),
  addressType: z.enum(["pickup", "delivery", "billing", "office", "warehouse"]).optional(),
  address: z.string().trim().min(4).max(500).optional(),
  city: z.string().trim().max(120).optional().nullable(),
  notes: z.string().trim().max(400).optional().nullable(),
  isDefault: z.boolean().optional()
});

type RouteContext = {
  params: Promise<{ addressId: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const limited = await enforceRateLimit(request, "customer-addresses-update", { limit: 30, windowSeconds: 60 });
  if (limited) return limited;

  const access = await requireRole(request, ["customer"]);
  if (!access.profile) return NextResponse.json({ error: access.error }, { status: access.status });

  const { addressId } = await context.params;
  const numericAddressId = Number(addressId);
  if (!Number.isFinite(numericAddressId)) return apiError("A valid address ID is required.", { status: 400 });

  const parsed = await parseJson(request, addressUpdateSchema, "Please provide valid address updates.");
  if (parsed.response) return parsed.response;

  const supabase = getSupabaseAdmin();
  if (!supabase) return apiError("Saved addresses are temporarily unavailable.", { status: 503 });

  if (parsed.data.isDefault) {
    await supabase.from("customer_addresses").update({ is_default: false }).eq("user_id", access.profile.id);
  }

  const payload = {
    ...(parsed.data.label !== undefined ? { label: parsed.data.label } : {}),
    ...(parsed.data.addressType !== undefined ? { address_type: parsed.data.addressType } : {}),
    ...(parsed.data.address !== undefined ? { address: parsed.data.address } : {}),
    ...(parsed.data.city !== undefined ? { city: parsed.data.city || null } : {}),
    ...(parsed.data.notes !== undefined ? { notes: parsed.data.notes || null } : {}),
    ...(parsed.data.isDefault !== undefined ? { is_default: parsed.data.isDefault } : {}),
    updated_at: new Date().toISOString()
  };

  const { data, error } = await supabase
    .from("customer_addresses")
    .update(payload)
    .eq("id", numericAddressId)
    .eq("user_id", access.profile.id)
    .select("id,user_id,label,address_type,address,city,notes,is_default,created_at,updated_at")
    .maybeSingle();

  if (error) {
    logApiError(error, "Unable to update customer address.", requestContext(request, { userId: access.profile.id, addressId }));
    return apiError("Unable to update this address.", { status: 500 });
  }

  if (!data) return apiError("Address not found.", { status: 404 });

  await writeAuditLog(supabase, {
    actor: access.profile,
    action: "customer.address_update",
    entityType: "customer_address",
    entityId: numericAddressId,
    request
  });

  return NextResponse.json(data);
}

export async function DELETE(request: Request, context: RouteContext) {
  const limited = await enforceRateLimit(request, "customer-addresses-delete", { limit: 30, windowSeconds: 60 });
  if (limited) return limited;

  const access = await requireRole(request, ["customer"]);
  if (!access.profile) return NextResponse.json({ error: access.error }, { status: access.status });

  const { addressId } = await context.params;
  const numericAddressId = Number(addressId);
  if (!Number.isFinite(numericAddressId)) return apiError("A valid address ID is required.", { status: 400 });

  const supabase = getSupabaseAdmin();
  if (!supabase) return apiError("Saved addresses are temporarily unavailable.", { status: 503 });

  const { error } = await supabase
    .from("customer_addresses")
    .delete()
    .eq("id", numericAddressId)
    .eq("user_id", access.profile.id);

  if (error) {
    logApiError(error, "Unable to delete customer address.", requestContext(request, { userId: access.profile.id, addressId }));
    return apiError("Unable to delete this address.", { status: 500 });
  }

  await writeAuditLog(supabase, {
    actor: access.profile,
    action: "customer.address_delete",
    entityType: "customer_address",
    entityId: numericAddressId,
    request
  });

  return NextResponse.json({ ok: true });
}
