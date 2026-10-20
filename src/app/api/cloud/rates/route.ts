import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { enforceRateLimit, parseJson } from "@/server/api";
import { writeAuditLog } from "@/server/audit";
import { requireCloudFeature } from "@/server/tenancy";

export const dynamic = "force-dynamic";

const rateSchema = z.object({
  name: z.string().trim().min(2).max(120),
  serviceType: z.enum(["local_nigeria", "international_import", "international_export"]),
  originZone: z.string().trim().max(120).optional().or(z.literal("")),
  destinationZone: z.string().trim().max(120).optional().or(z.literal("")),
  basePrice: z.coerce.number().min(0).max(1_000_000_000),
  includedWeightKg: z.coerce.number().positive().max(100_000),
  extraKgPrice: z.coerce.number().min(0).max(1_000_000_000),
  currency: z.string().trim().length(3).default("NGN"),
  etaMinHours: z.coerce.number().int().positive().max(10000).optional(),
  etaMaxHours: z.coerce.number().int().positive().max(10000).optional(),
  isActive: z.boolean().default(true)
}).superRefine((data, context) => {
  if (data.etaMinHours && data.etaMaxHours && data.etaMaxHours < data.etaMinHours) {
    context.addIssue({ code: "custom", message: "Maximum ETA must be greater than or equal to minimum ETA.", path: ["etaMaxHours"] });
  }
  if (data.isActive && data.basePrice === 0 && data.extraKgPrice === 0) {
    context.addIssue({ code: "custom", message: "An active rate cannot charge zero for both the base price and extra weight.", path: ["basePrice"] });
  }
});

function normalizedZone(value?: string | null) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized === "*" || normalized === "all" ? "" : normalized;
}

export async function GET(request: Request) {
  const access = await requireCloudFeature(request, "rates", ["owner", "admin", "dispatcher"]);
  if (!access.profile || !access.tenant || access.error) return NextResponse.json({ error: access.error }, { status: access.status });
  const supabase = getSupabaseAdmin();
  if (!supabase || !access.tenant.companyId) return NextResponse.json({ error: "Company rates are temporarily unavailable." }, { status: 503 });
  const result = await supabase.from("tenant_rate_cards").select("*").eq("company_id", access.tenant.companyId).order("created_at", { ascending: false });
  if (result.error) return NextResponse.json({ error: "Unable to load company rates." }, { status: 500 });
  return NextResponse.json({ rates: result.data ?? [] });
}

export async function POST(request: Request) {
  const limited = await enforceRateLimit(request, "cloud-rates", { limit: 30, windowSeconds: 60 });
  if (limited) return limited;
  const access = await requireCloudFeature(request, "rates", ["owner", "admin"]);
  if (!access.profile || !access.tenant || access.error) return NextResponse.json({ error: access.error }, { status: access.status });
  const parsed = await parseJson(request, rateSchema, "Complete the company rate details.");
  if (parsed.response) return parsed.response;
  const supabase = getSupabaseAdmin();
  if (!supabase || !access.tenant.companyId) return NextResponse.json({ error: "Company rates are temporarily unavailable." }, { status: 503 });
  if (parsed.data.isActive) {
    const existing = await supabase
      .from("tenant_rate_cards")
      .select("id,name,origin_zone,destination_zone")
      .eq("company_id", access.tenant.companyId)
      .eq("service_type", parsed.data.serviceType)
      .eq("is_active", true)
      .limit(100);
    if (existing.error) return NextResponse.json({ error: "Unable to validate this rate against active pricing." }, { status: 500 });
    const conflict = existing.data?.find((rate) => normalizedZone(rate.origin_zone) === normalizedZone(parsed.data.originZone) && normalizedZone(rate.destination_zone) === normalizedZone(parsed.data.destinationZone));
    if (conflict) return NextResponse.json({ error: `An active rate named “${conflict.name}” already covers the same service and route. Pause it before activating another.` }, { status: 409 });
  }
  const result = await supabase.from("tenant_rate_cards").insert({
    company_id: access.tenant.companyId,
    name: parsed.data.name,
    service_type: parsed.data.serviceType,
    origin_zone: parsed.data.originZone || null,
    destination_zone: parsed.data.destinationZone || null,
    base_price: parsed.data.basePrice,
    included_weight_kg: parsed.data.includedWeightKg,
    extra_kg_price: parsed.data.extraKgPrice,
    currency: (parsed.data.currency ?? "NGN").toUpperCase(),
    eta_min_hours: parsed.data.etaMinHours ?? null,
    eta_max_hours: parsed.data.etaMaxHours ?? null,
    is_active: parsed.data.isActive
  }).select("*").single();
  if (result.error) return NextResponse.json({ error: "Unable to create company rate." }, { status: 500 });
  await writeAuditLog(supabase, { actor: access.profile, action: "cloud.rate.create", entityType: "tenant_rate_card", entityId: result.data.id, request });
  return NextResponse.json({ rate: result.data }, { status: 201 });
}
