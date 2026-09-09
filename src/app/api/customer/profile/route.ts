import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/request-auth";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { enforceRateLimit, parseJson } from "@/server/api";
import { writeAuditLog } from "@/server/audit";
import { logApiError, requestContext } from "@/server/monitoring";

export const dynamic = "force-dynamic";

const profileSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  company: z.string().trim().max(120).optional(),
  phone: z.string().trim().max(40).optional(),
  emailNotificationsEnabled: z.boolean().optional(),
  whatsappNotificationsEnabled: z.boolean().optional(),
  smsNotificationsEnabled: z.boolean().optional()
});

const profileSelect = "id,email,full_name,company,phone,role,email_notifications_enabled,whatsapp_notifications_enabled,sms_notifications_enabled";

async function fetchCustomerProfile(id: string) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;

  let result = await supabase.from("user_profiles").select(profileSelect).eq("id", id).maybeSingle();
  if (result.error && (result.error.code === "42703" || result.error.code === "PGRST204")) {
    result = await supabase.from("user_profiles").select("id,email,full_name,company,phone,role").eq("id", id).maybeSingle();
  }
  if (result.error) return null;
  return {
    ...result.data,
    email_notifications_enabled: "email_notifications_enabled" in (result.data ?? {}) ? result.data?.email_notifications_enabled : true,
    whatsapp_notifications_enabled: "whatsapp_notifications_enabled" in (result.data ?? {}) ? result.data?.whatsapp_notifications_enabled : true,
    sms_notifications_enabled: "sms_notifications_enabled" in (result.data ?? {}) ? result.data?.sms_notifications_enabled : true
  };
}

export async function GET(request: Request) {
  const access = await requireRole(request, ["customer"]);
  if (!access.profile) return NextResponse.json({ error: access.error }, { status: access.status });
  if (access.error) return NextResponse.json({ error: access.error }, { status: access.status });
  return NextResponse.json((await fetchCustomerProfile(access.profile.id)) ?? {
    ...access.profile,
    email_notifications_enabled: true,
    whatsapp_notifications_enabled: true,
    sms_notifications_enabled: true
  });
}

export async function PATCH(request: Request) {
  const limited = await enforceRateLimit(request, "customer-profile-update", { limit: 30, windowSeconds: 60 });
  if (limited) return limited;

  const access = await requireRole(request, ["customer"]);
  if (!access.profile) return NextResponse.json({ error: access.error }, { status: access.status });
  if (access.error) return NextResponse.json({ error: access.error }, { status: access.status });

  const parsed = await parseJson(request, profileSchema, "Please complete your profile details.");
  if (parsed.response) return parsed.response;

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Customer profile updates are temporarily unavailable." }, { status: 503 });

  const payload = {
    id: access.profile.id,
    email: access.profile.email,
    full_name: parsed.data.fullName,
    company: parsed.data.company || null,
    phone: parsed.data.phone || null,
    role: access.profile.role,
    email_notifications_enabled: parsed.data.emailNotificationsEnabled ?? true,
    whatsapp_notifications_enabled: parsed.data.whatsappNotificationsEnabled ?? true,
    sms_notifications_enabled: parsed.data.smsNotificationsEnabled ?? true,
    updated_at: new Date().toISOString()
  };

  const first = await supabase
    .from("user_profiles")
    .upsert(payload)
    .select(profileSelect)
    .single();
  let data: Record<string, unknown> | null = first.data;
  let error: typeof first.error = first.error;

  if (error && (error.code === "42703" || error.code === "PGRST204")) {
    const fallbackPayload = { ...payload } as Record<string, unknown>;
    delete fallbackPayload.email_notifications_enabled;
    delete fallbackPayload.whatsapp_notifications_enabled;
    delete fallbackPayload.sms_notifications_enabled;
    const fallback = await supabase
      .from("user_profiles")
      .upsert(fallbackPayload)
      .select("id,email,full_name,company,phone,role")
      .single();
    data = fallback.data as Record<string, unknown> | null;
    error = fallback.error;
  }

  if (error) {
    logApiError(error, "Unable to update customer profile.", requestContext(request, { userId: access.profile.id }));
    return NextResponse.json({ error: "Unable to update your profile." }, { status: 500 });
  }

  await writeAuditLog(supabase, {
    actor: access.profile,
    action: "customer.profile_update",
    entityType: "user_profile",
    entityId: access.profile.id,
    request
  });

  return NextResponse.json({
    ...data,
    email_notifications_enabled: "email_notifications_enabled" in (data ?? {}) ? data?.email_notifications_enabled : parsed.data.emailNotificationsEnabled ?? true,
    whatsapp_notifications_enabled: "whatsapp_notifications_enabled" in (data ?? {}) ? data?.whatsapp_notifications_enabled : parsed.data.whatsappNotificationsEnabled ?? true,
    sms_notifications_enabled: "sms_notifications_enabled" in (data ?? {}) ? data?.sms_notifications_enabled : parsed.data.smsNotificationsEnabled ?? true
  });
}
