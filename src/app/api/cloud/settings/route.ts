import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { enforceRateLimit, parseJson } from "@/server/api";
import { requireCompanyRole } from "@/server/tenancy";

export const dynamic = "force-dynamic";

const settingsSchema = z.object({
  name: z.string().trim().min(2).max(160).optional(),
  logoUrl: z.string().trim().url().optional().or(z.literal("")),
  brandColor: z.string().trim().regex(/^#[0-9a-f]{6}$/i).optional().or(z.literal("")),
  supportEmail: z.string().trim().email().optional().or(z.literal("")),
  supportPhone: z.string().trim().max(40).optional().or(z.literal(""))
});

export async function GET(request: Request) {
  const limited = await enforceRateLimit(request, "cloud-settings", { limit: 80, windowSeconds: 60 });
  if (limited) return limited;

  const access = await requireCompanyRole(request, ["owner", "admin", "dispatcher"]);
  if (!access.profile || !access.tenant) return NextResponse.json({ error: access.error }, { status: access.status });
  if (access.error) return NextResponse.json({ error: access.error }, { status: access.status });

  return NextResponse.json({
    company: access.tenant.company,
    role: access.tenant.companyRole
  });
}

export async function PATCH(request: Request) {
  const limited = await enforceRateLimit(request, "cloud-settings-update", { limit: 30, windowSeconds: 60 });
  if (limited) return limited;

  const access = await requireCompanyRole(request, ["owner", "admin"]);
  if (!access.profile || !access.tenant) return NextResponse.json({ error: access.error }, { status: access.status });
  if (access.error) return NextResponse.json({ error: access.error }, { status: access.status });

  const parsed = await parseJson(request, settingsSchema, "Enter valid company settings.");
  if (parsed.response) return parsed.response;

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Cloud settings are temporarily unavailable." }, { status: 503 });
  if (!access.tenant.companyId) return NextResponse.json({ error: "Company workspace is not configured." }, { status: 409 });

  const updates = {
    ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
    ...(parsed.data.logoUrl !== undefined ? { logo_url: parsed.data.logoUrl || null } : {}),
    ...(parsed.data.brandColor !== undefined ? { brand_color: parsed.data.brandColor || null } : {}),
    ...(parsed.data.supportEmail !== undefined ? { support_email: parsed.data.supportEmail || null } : {}),
    ...(parsed.data.supportPhone !== undefined ? { support_phone: parsed.data.supportPhone || null } : {}),
    updated_at: new Date().toISOString()
  };

  const { data, error } = await supabase
    .from("companies")
    .update(updates)
    .eq("id", access.tenant.companyId)
    .select("id,name,slug,logo_url,brand_color,support_email,support_phone,custom_domain,plan,status,subscription_status,subscription_plan,trial_ends_at,billing_email,billing_currency,billing_amount,flutterwave_subscription_reference,subscription_started_at,subscription_renews_at,last_billing_reference,last_billing_status,created_at,updated_at")
    .single();

  if (error) return NextResponse.json({ error: "Unable to update company settings.", details: error.message }, { status: 500 });

  return NextResponse.json({ company: data });
}
