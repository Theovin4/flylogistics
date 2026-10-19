import { NextResponse } from "next/server";
import { z } from "zod";
import { siteConfig } from "@/lib/site";
import { isCloudPlanLimitReached } from "@/lib/cloud-plans";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { enforceRateLimit, parseJson } from "@/server/api";
import { writeAuditLog } from "@/server/audit";
import { logApiError, requestContext } from "@/server/monitoring";
import { removeDefaultCompanyMembership, requireCloudFeature } from "@/server/tenancy";

export const dynamic = "force-dynamic";

const teamSchema = z.object({
  name: z.string().trim().min(2).max(160),
  email: z.string().trim().email(),
  role: z.enum(["admin", "dispatcher", "driver"])
});

export async function GET(request: Request) {
  const access = await requireCloudFeature(request, "team_management", ["owner", "admin"]);
  if (!access.profile || !access.tenant || access.error) return NextResponse.json({ error: access.error }, { status: access.status });
  const supabase = getSupabaseAdmin();
  if (!supabase || !access.tenant.companyId) return NextResponse.json({ error: "Team management is temporarily unavailable." }, { status: 503 });

  const members = await supabase.from("company_members").select("id,user_id,role,created_at").eq("company_id", access.tenant.companyId).order("created_at");
  if (members.error) return NextResponse.json({ error: "Unable to load company team." }, { status: 500 });
  const userIds = (members.data ?? []).map((member) => String(member.user_id));
  const profiles = userIds.length
    ? await supabase.from("user_profiles").select("id,email,full_name,phone").in("id", userIds)
    : { data: [], error: null };
  const profileMap = new Map((profiles.data ?? []).map((profile) => [String(profile.id), profile]));
  const team = (members.data ?? []).map((member) => ({ ...member, profile: profileMap.get(String(member.user_id)) ?? null }));
  return NextResponse.json({ team, limit: access.entitlements?.limits.users ?? null });
}

export async function POST(request: Request) {
  const limited = await enforceRateLimit(request, "cloud-team-invite", { limit: 15, windowSeconds: 300 });
  if (limited) return limited;
  const access = await requireCloudFeature(request, "team_management", ["owner", "admin"]);
  if (!access.profile || !access.tenant || access.error) return NextResponse.json({ error: access.error }, { status: access.status });
  const parsed = await parseJson(request, teamSchema, "Enter a valid name, email, and company role.");
  if (parsed.response) return parsed.response;
  const supabase = getSupabaseAdmin();
  if (!supabase || !access.tenant.companyId) return NextResponse.json({ error: "Team invitations are temporarily unavailable." }, { status: 503 });

  const count = await supabase.from("company_members").select("id", { count: "exact", head: true }).eq("company_id", access.tenant.companyId);
  const userLimit = access.entitlements?.limits.users ?? null;
  if (isCloudPlanLimitReached(count.count ?? 0, userLimit)) {
    return NextResponse.json({ error: `${access.entitlements?.plan ?? "Current"} plan supports ${userLimit} team members. Upgrade the company plan before adding another member.` }, { status: 409 });
  }

  const email = parsed.data.email.toLowerCase();
  let profile = await supabase.from("user_profiles").select("id,email").ilike("email", email).maybeSingle();
  let invited = false;
  if (!profile.data) {
    const invite = await supabase.auth.admin.inviteUserByEmail(email, {
      data: { full_name: parsed.data.name, role: "customer" },
      redirectTo: `${(process.env.NEXT_PUBLIC_APP_URL?.trim() || siteConfig.url).replace(/\/$/, "")}/cloud/login?invited=1`
    });
    if (invite.error || !invite.data.user) return NextResponse.json({ error: invite.error?.message ?? "Unable to send the secure team invitation." }, { status: 502 });
    profile = { data: { id: invite.data.user.id, email }, error: null } as typeof profile;
    invited = true;
  }

  const memberUserId = profile.data?.id;
  if (!memberUserId) return NextResponse.json({ error: "Unable to resolve the invited team account." }, { status: 502 });
  const defaultMembershipError = await removeDefaultCompanyMembership(supabase, memberUserId);
  if (defaultMembershipError) {
    logApiError(
      defaultMembershipError,
      "Unable to remove the default Fly company membership before adding the Cloud team member.",
      requestContext(request, { userId: memberUserId, companyId: access.tenant.companyId })
    );
    return NextResponse.json({ error: "Unable to prepare this account for the company workspace." }, { status: 503 });
  }
  const membership = await supabase.from("company_members").upsert({
    company_id: access.tenant.companyId,
    user_id: memberUserId,
    role: parsed.data.role
  }, { onConflict: "company_id,user_id" }).select("id,user_id,role,created_at").single();
  if (membership.error) return NextResponse.json({ error: "Unable to add this team member." }, { status: 500 });
  await supabase.from("user_profiles").update({ company_id: access.tenant.companyId, full_name: parsed.data.name }).eq("id", memberUserId);
  const invitationRecord = {
    company_id: access.tenant.companyId,
    email,
    name: parsed.data.name,
    role: parsed.data.role,
    status: invited ? "pending" : "accepted",
    invited_by: access.profile.id,
    accepted_at: invited ? null : new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  const existingInvitation = await supabase.from("company_invitations").select("id").eq("company_id", access.tenant.companyId).ilike("email", email).eq("status", "pending").maybeSingle();
  if (existingInvitation.data?.id) {
    await supabase.from("company_invitations").update(invitationRecord).eq("id", existingInvitation.data.id);
  } else {
    await supabase.from("company_invitations").insert(invitationRecord);
  }
  await writeAuditLog(supabase, { actor: access.profile, action: "cloud.team.add", entityType: "company_member", entityId: membership.data.id, request, metadata: { role: parsed.data.role, invited } });
  return NextResponse.json({ member: membership.data, invited, message: invited ? "Invitation sent securely." : "Team member added." }, { status: 201 });
}
