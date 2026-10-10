import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { enforceRateLimit, parseJson } from "@/server/api";
import { writeAuditLog } from "@/server/audit";
import { requireCompanyRole } from "@/server/tenancy";

const updateSchema = z.object({
  customerType: z.enum(["individual", "business"]).optional(),
  name: z.string().trim().min(2).max(160).optional(),
  email: z.string().trim().email().optional().or(z.literal("")),
  phone: z.string().trim().min(5).max(40).optional(),
  organization: z.string().trim().max(160).optional().or(z.literal("")),
  addressLine: z.string().trim().min(6).max(300).optional(),
  city: z.string().trim().min(2).max(100).optional(),
  state: z.string().trim().min(2).max(100).optional(),
  country: z.string().trim().min(2).max(100).optional(),
  notes: z.string().trim().max(1500).optional().or(z.literal("")),
  status: z.enum(["active", "inactive", "blocked"]).optional()
});

export async function PATCH(request: Request, { params }: { params: Promise<{ customerId: string }> }) {
  const limited = await enforceRateLimit(request, "cloud-customer-update", { limit: 60, windowSeconds: 60 });
  if (limited) return limited;
  const access = await requireCompanyRole(request, ["owner", "admin", "dispatcher"]);
  if (!access.profile || !access.tenant || access.error) return NextResponse.json({ error: access.error }, { status: access.status });
  const parsed = await parseJson(request, updateSchema, "Enter valid customer details.");
  if (parsed.response) return parsed.response;
  const supabase = getSupabaseAdmin();
  if (!supabase || !access.tenant.companyId) return NextResponse.json({ error: "Customer management is temporarily unavailable." }, { status: 503 });
  const { customerId } = await params;
  const values = parsed.data;
  const result = await supabase.from("cloud_customers").update({
    ...(values.customerType !== undefined ? { customer_type: values.customerType } : {}),
    ...(values.name !== undefined ? { name: values.name } : {}),
    ...(values.email !== undefined ? { email: values.email || null } : {}),
    ...(values.phone !== undefined ? { phone: values.phone } : {}),
    ...(values.organization !== undefined ? { organization: values.organization || null } : {}),
    ...(values.addressLine !== undefined ? { address_line: values.addressLine } : {}),
    ...(values.city !== undefined ? { city: values.city } : {}),
    ...(values.state !== undefined ? { state: values.state } : {}),
    ...(values.country !== undefined ? { country: values.country } : {}),
    ...(values.notes !== undefined ? { notes: values.notes || null } : {}),
    ...(values.status !== undefined ? { status: values.status } : {}),
    updated_at: new Date().toISOString()
  }).eq("id", customerId).eq("company_id", access.tenant.companyId).select("*").maybeSingle();
  if (result.error) return NextResponse.json({ error: "Unable to update customer." }, { status: 500 });
  if (!result.data) return NextResponse.json({ error: "Customer not found." }, { status: 404 });
  await writeAuditLog(supabase, { actor: access.profile, action: "cloud.customer.update", entityType: "cloud_customer", entityId: customerId, request });
  return NextResponse.json({ customer: result.data });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ customerId: string }> }) {
  const limited = await enforceRateLimit(request, "cloud-customer-delete", { limit: 20, windowSeconds: 60 });
  if (limited) return limited;
  const access = await requireCompanyRole(request, ["owner", "admin"]);
  if (!access.profile || !access.tenant || access.error) return NextResponse.json({ error: access.error }, { status: access.status });
  const supabase = getSupabaseAdmin();
  if (!supabase || !access.tenant.companyId) return NextResponse.json({ error: "Customer management is temporarily unavailable." }, { status: 503 });
  const { customerId } = await params;
  const result = await supabase.from("cloud_customers").delete().eq("id", customerId).eq("company_id", access.tenant.companyId).select("id").maybeSingle();
  if (result.error) return NextResponse.json({ error: "Unable to delete customer." }, { status: 500 });
  if (!result.data) return NextResponse.json({ error: "Customer not found." }, { status: 404 });
  await writeAuditLog(supabase, { actor: access.profile, action: "cloud.customer.delete", entityType: "cloud_customer", entityId: customerId, request });
  return NextResponse.json({ ok: true });
}
