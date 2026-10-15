import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { enforceRateLimit, parseJson } from "@/server/api";
import { writeAuditLog } from "@/server/audit";
import { requireCloudFeature, requireCompanyRole } from "@/server/tenancy";

export const dynamic = "force-dynamic";

const customerSchema = z.object({
  customerType: z.enum(["individual", "business"]).default("individual"),
  name: z.string().trim().min(2).max(160),
  email: z.string().trim().email().optional().or(z.literal("")),
  phone: z.string().trim().min(5).max(40),
  organization: z.string().trim().max(160).optional().or(z.literal("")),
  addressLine: z.string().trim().min(6).max(300),
  city: z.string().trim().min(2).max(100),
  state: z.string().trim().min(2).max(100),
  country: z.string().trim().min(2).max(100).default("Nigeria"),
  notes: z.string().trim().max(1500).optional().or(z.literal(""))
});

export async function GET(request: Request) {
  const limited = await enforceRateLimit(request, "cloud-customers", { limit: 100, windowSeconds: 60 });
  if (limited) return limited;
  const access = await requireCompanyRole(request, ["owner", "admin", "dispatcher"]);
  if (!access.profile || !access.tenant || access.error) return NextResponse.json({ error: access.error }, { status: access.status });
  const supabase = getSupabaseAdmin();
  if (!supabase || !access.tenant.companyId) return NextResponse.json({ error: "Customer directory is temporarily unavailable." }, { status: 503 });

  const url = new URL(request.url);
  const search = url.searchParams.get("search")?.trim() ?? "";
  const status = url.searchParams.get("status")?.trim() ?? "";
  let query = supabase
    .from("cloud_customers")
    .select("id,customer_type,name,email,phone,organization,address_line,city,state,country,notes,status,last_shipment_at,created_at,updated_at")
    .eq("company_id", access.tenant.companyId)
    .order("created_at", { ascending: false })
    .limit(250);
  if (status && status !== "all") query = query.eq("status", status);
  if (search) query = query.or(`name.ilike.%${search.replaceAll(",", "")}%,email.ilike.%${search.replaceAll(",", "")}%,phone.ilike.%${search.replaceAll(",", "")}%`);
  const result = await query;
  if (result.error) return NextResponse.json({ error: "Unable to load company customers.", details: result.error.message }, { status: 500 });
  return NextResponse.json({ customers: result.data ?? [] });
}

export async function POST(request: Request) {
  const limited = await enforceRateLimit(request, "cloud-customers-create", { limit: 40, windowSeconds: 60 });
  if (limited) return limited;
  const access = await requireCloudFeature(request, "operations", ["owner", "admin", "dispatcher"]);
  if (!access.profile || !access.tenant || access.error) return NextResponse.json({ error: access.error }, { status: access.status });
  const parsed = await parseJson(request, customerSchema, "Complete the required customer details.");
  if (parsed.response) return parsed.response;
  const supabase = getSupabaseAdmin();
  if (!supabase || !access.tenant.companyId) return NextResponse.json({ error: "Customer creation is temporarily unavailable." }, { status: 503 });

  const result = await supabase.from("cloud_customers").insert({
    company_id: access.tenant.companyId,
    customer_type: parsed.data.customerType,
    name: parsed.data.name,
    email: parsed.data.email || null,
    phone: parsed.data.phone,
    organization: parsed.data.organization || null,
    address_line: parsed.data.addressLine,
    city: parsed.data.city,
    state: parsed.data.state,
    country: parsed.data.country,
    notes: parsed.data.notes || null,
    status: "active"
  }).select("*").single();
  if (result.error) {
    const duplicate = result.error.code === "23505";
    return NextResponse.json({ error: duplicate ? "A customer with this email already exists." : "Unable to create customer." }, { status: duplicate ? 409 : 500 });
  }
  await writeAuditLog(supabase, { actor: access.profile, action: "cloud.customer.create", entityType: "cloud_customer", entityId: result.data.id, request });
  return NextResponse.json({ customer: result.data }, { status: 201 });
}
