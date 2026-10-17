import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { parseJson } from "@/server/api";
import { writeAuditLog } from "@/server/audit";
import { requireCloudFeature } from "@/server/tenancy";

const updateSchema = z.object({ isActive: z.boolean() });

export async function PATCH(request: Request, { params }: { params: Promise<{ rateId: string }> }) {
  const access = await requireCloudFeature(request, "rates", ["owner", "admin"]);
  if (!access.profile || !access.tenant || access.error) return NextResponse.json({ error: access.error }, { status: access.status });
  const parsed = await parseJson(request, updateSchema, "Select a valid rate status.");
  if (parsed.response) return parsed.response;
  const { rateId } = await params;
  const supabase = getSupabaseAdmin();
  if (!supabase || !access.tenant.companyId) return NextResponse.json({ error: "Company rates are temporarily unavailable." }, { status: 503 });
  const result = await supabase.from("tenant_rate_cards").update({ is_active: parsed.data.isActive, updated_at: new Date().toISOString() }).eq("id", rateId).eq("company_id", access.tenant.companyId).select("*").maybeSingle();
  if (result.error || !result.data) return NextResponse.json({ error: "Unable to update this company rate." }, { status: result.error ? 500 : 404 });
  await writeAuditLog(supabase, { actor: access.profile, action: "cloud.rate.update", entityType: "tenant_rate_card", entityId: rateId, request, metadata: { active: parsed.data.isActive } });
  return NextResponse.json({ rate: result.data });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ rateId: string }> }) {
  const access = await requireCloudFeature(request, "rates", ["owner", "admin"]);
  if (!access.profile || !access.tenant || access.error) return NextResponse.json({ error: access.error }, { status: access.status });
  const { rateId } = await params;
  const supabase = getSupabaseAdmin();
  if (!supabase || !access.tenant.companyId) return NextResponse.json({ error: "Company rates are temporarily unavailable." }, { status: 503 });
  const result = await supabase.from("tenant_rate_cards").delete().eq("id", rateId).eq("company_id", access.tenant.companyId).select("id").maybeSingle();
  if (result.error) return NextResponse.json({ error: "Unable to delete this company rate." }, { status: 500 });
  if (!result.data) return NextResponse.json({ error: "Company rate not found." }, { status: 404 });
  await writeAuditLog(supabase, { actor: access.profile, action: "cloud.rate.delete", entityType: "tenant_rate_card", entityId: rateId, request });
  return NextResponse.json({ ok: true });
}
