import { randomBytes } from "node:crypto";
import { resolveTxt } from "node:dns/promises";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { enforceRateLimit, parseJson } from "@/server/api";
import { writeAuditLog } from "@/server/audit";
import { normalizeCustomDomain } from "@/server/cloud-scale-features";
import { requireCloudFeature } from "@/server/tenancy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const domainSchema = z.object({ hostname: z.string().trim().min(1).max(253) });
const verificationRecordName = (hostname: string) => `_flylogistics-verification.${hostname}`;

async function requireScaleOwner(request: Request) {
  return requireCloudFeature(request, "custom_domain", ["owner", "admin"]);
}

export async function GET(request: Request) {
  const limited = await enforceRateLimit(request, "cloud-custom-domain", { limit: 30, windowSeconds: 60 });
  if (limited) return limited;
  const access = await requireScaleOwner(request);
  if (!access.profile || !access.tenant || access.error) return NextResponse.json({ error: access.error }, { status: access.status });
  if (!access.tenant.companyId) return NextResponse.json({ error: "Company workspace is not configured." }, { status: 409 });

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Custom domain settings are unavailable." }, { status: 503 });
  const result = await supabase
    .from("cloud_custom_domains")
    .select("id,hostname,verification_token,status,verified_at,created_at,updated_at")
    .eq("company_id", access.tenant.companyId)
    .maybeSingle();
  if (result.error) return NextResponse.json({ error: "Unable to load custom domain settings." }, { status: 500 });

  return NextResponse.json({
    domain: result.data ? {
      id: result.data.id,
      hostname: result.data.hostname,
      status: result.data.status,
      verified_at: result.data.verified_at,
      created_at: result.data.created_at,
      updated_at: result.data.updated_at,
      verificationRecord: verificationRecordName(result.data.hostname),
      verificationToken: result.data.verification_token
    } : null
  });
}

export async function PATCH(request: Request) {
  const limited = await enforceRateLimit(request, "cloud-custom-domain-update", { limit: 10, windowSeconds: 60 });
  if (limited) return limited;
  const access = await requireScaleOwner(request);
  if (!access.profile || !access.tenant || access.error) return NextResponse.json({ error: access.error }, { status: access.status });
  if (!access.tenant.companyId) return NextResponse.json({ error: "Company workspace is not configured." }, { status: 409 });

  const parsed = await parseJson(request, domainSchema, "Enter a valid custom domain.");
  if (parsed.response) return parsed.response;
  const hostname = normalizeCustomDomain(parsed.data.hostname);
  if (!hostname) return NextResponse.json({ error: "Enter a public DNS hostname without a scheme, path, or port." }, { status: 400 });

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Custom domain settings are unavailable." }, { status: 503 });
  const result = await supabase
    .from("cloud_custom_domains")
    .upsert({
      company_id: access.tenant.companyId,
      hostname,
      verification_token: randomBytes(24).toString("hex"),
      status: "pending_dns",
      verified_at: null,
      updated_at: new Date().toISOString()
    }, { onConflict: "company_id" })
    .select("id,hostname,verification_token,status,verified_at,created_at,updated_at")
    .single();
  if (result.error) {
    if (result.error.code === "23505") return NextResponse.json({ error: "This hostname is already assigned to another workspace." }, { status: 409 });
    return NextResponse.json({ error: "Unable to save the custom domain." }, { status: 500 });
  }

  await writeAuditLog(supabase, { actor: access.profile, action: "cloud.custom_domain.configure", entityType: "cloud_custom_domain", entityId: result.data.id, request });
  return NextResponse.json({
    domain: {
      id: result.data.id,
      hostname: result.data.hostname,
      status: result.data.status,
      verified_at: result.data.verified_at,
      created_at: result.data.created_at,
      updated_at: result.data.updated_at,
      verificationRecord: verificationRecordName(hostname),
      verificationToken: result.data.verification_token
    }
  }, { status: 201 });
}

export async function POST(request: Request) {
  const limited = await enforceRateLimit(request, "cloud-custom-domain-verify", { limit: 10, windowSeconds: 60 });
  if (limited) return limited;
  const access = await requireScaleOwner(request);
  if (!access.profile || !access.tenant || access.error) return NextResponse.json({ error: access.error }, { status: access.status });
  if (!access.tenant.companyId) return NextResponse.json({ error: "Company workspace is not configured." }, { status: 409 });

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Custom domain verification is unavailable." }, { status: 503 });
  const domain = await supabase.from("cloud_custom_domains").select("id,hostname,verification_token,status").eq("company_id", access.tenant.companyId).maybeSingle();
  if (domain.error) return NextResponse.json({ error: "Unable to load custom domain settings." }, { status: 500 });
  if (!domain.data) return NextResponse.json({ error: "Configure a custom domain before verifying it." }, { status: 404 });
  const configuredDomain = domain.data;
  if (configuredDomain.status === "verified") return NextResponse.json({ domain: { id: configuredDomain.id, hostname: configuredDomain.hostname, status: "verified" } });

  let records: string[][];
  try {
    records = await resolveTxt(verificationRecordName(configuredDomain.hostname));
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENODATA" || code === "ENOTFOUND" || code === "EAI_AGAIN") {
      return NextResponse.json({ error: "The DNS verification record is not visible yet.", status: "pending_dns" }, { status: 409 });
    }
    return NextResponse.json({ error: "DNS verification could not be completed." }, { status: 502 });
  }

  if (!records.some((record) => record.join("") === configuredDomain.verification_token)) {
    return NextResponse.json({ error: "The DNS verification record does not match.", status: "pending_dns" }, { status: 409 });
  }

  const verifiedAt = new Date().toISOString();
  const updated = await supabase.from("cloud_custom_domains").update({ status: "verified", verified_at: verifiedAt, updated_at: verifiedAt }).eq("id", configuredDomain.id).eq("company_id", access.tenant.companyId).select("id,hostname,status,verified_at").single();
  if (updated.error) return NextResponse.json({ error: "Unable to save domain verification state." }, { status: 500 });
  await writeAuditLog(supabase, { actor: access.profile, action: "cloud.custom_domain.verify", entityType: "cloud_custom_domain", entityId: configuredDomain.id, request });
  return NextResponse.json({ domain: updated.data });
}

export async function DELETE(request: Request) {
  const limited = await enforceRateLimit(request, "cloud-custom-domain-delete", { limit: 10, windowSeconds: 60 });
  if (limited) return limited;
  const access = await requireScaleOwner(request);
  if (!access.profile || !access.tenant || access.error) return NextResponse.json({ error: access.error }, { status: access.status });
  if (!access.tenant.companyId) return NextResponse.json({ error: "Company workspace is not configured." }, { status: 409 });
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Custom domain settings are unavailable." }, { status: 503 });
  const result = await supabase.from("cloud_custom_domains").delete().eq("company_id", access.tenant.companyId).select("id").maybeSingle();
  if (result.error) return NextResponse.json({ error: "Unable to remove custom domain settings." }, { status: 500 });
  if (result.data) await writeAuditLog(supabase, { actor: access.profile, action: "cloud.custom_domain.remove", entityType: "cloud_custom_domain", entityId: result.data.id, request });
  return NextResponse.json({ ok: true });
}
