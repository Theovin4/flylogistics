import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { parseJson } from "@/server/api";
import { writeAuditLog } from "@/server/audit";
import { requireCloudFeature } from "@/server/tenancy";

const updateSchema = z.object({ role: z.enum(["admin", "dispatcher", "driver"]) });

export async function PATCH(request: Request, { params }: { params: Promise<{ memberId: string }> }) {
  const access = await requireCloudFeature(request, "team_management", ["owner", "admin"]);
  if (!access.profile || !access.tenant || access.error) return NextResponse.json({ error: access.error }, { status: access.status });
  const parsed = await parseJson(request, updateSchema, "Select a valid company role.");
  if (parsed.response) return parsed.response;
  const { memberId } = await params;
  const supabase = getSupabaseAdmin();
  if (!supabase || !access.tenant.companyId) return NextResponse.json({ error: "Team management is temporarily unavailable." }, { status: 503 });
  const result = await supabase.from("company_members").update({ role: parsed.data.role }).eq("id", memberId).eq("company_id", access.tenant.companyId).neq("role", "owner").select("id,role").maybeSingle();
  if (result.error || !result.data) return NextResponse.json({ error: "Unable to update this team member." }, { status: result.error ? 500 : 404 });
  await writeAuditLog(supabase, { actor: access.profile, action: "cloud.team.role_update", entityType: "company_member", entityId: memberId, request, metadata: { role: parsed.data.role } });
  return NextResponse.json({ member: result.data });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ memberId: string }> }) {
  const access = await requireCloudFeature(request, "team_management", ["owner", "admin"]);
  if (!access.profile || !access.tenant || access.error) return NextResponse.json({ error: access.error }, { status: access.status });
  const { memberId } = await params;
  const supabase = getSupabaseAdmin();
  if (!supabase || !access.tenant.companyId) return NextResponse.json({ error: "Team management is temporarily unavailable." }, { status: 503 });
  const target = await supabase.from("company_members").select("id,user_id,role").eq("id", memberId).eq("company_id", access.tenant.companyId).maybeSingle();
  if (!target.data || target.error) return NextResponse.json({ error: "Team member not found." }, { status: 404 });
  if (target.data.role === "owner" || target.data.user_id === access.profile.id) return NextResponse.json({ error: "The workspace owner or current account cannot be removed here." }, { status: 409 });
  const result = await supabase.from("company_members").delete().eq("id", memberId).eq("company_id", access.tenant.companyId);
  if (result.error) return NextResponse.json({ error: "Unable to remove this team member." }, { status: 500 });
  await writeAuditLog(supabase, { actor: access.profile, action: "cloud.team.remove", entityType: "company_member", entityId: memberId, request });
  return NextResponse.json({ ok: true });
}
