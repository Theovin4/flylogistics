import { NextResponse } from "next/server";
import { z } from "zod";
import { cloudTrialEndsAt } from "@/lib/cloud-plans";
import { normalizeRole } from "@/lib/roles";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { enforceRateLimit, parseJson } from "@/server/api";
import { logApiError, logAuthError, requestContext } from "@/server/monitoring";
import { isTenantSchemaMissing, removeDefaultCompanyMembership } from "@/server/tenancy";
import { strongPasswordIssue } from "@/lib/account-security";
import {
  isValidCurrencyCode,
  isValidIanaTimezone,
  normalizeCountryCode,
  normalizeTenantLocale,
  supportedCloudBillingCurrencies
} from "@/lib/tenant-locale";

const signupSchema = z.object({
  companyName: z.string().trim().min(2).max(160),
  ownerName: z.string().trim().min(2).max(160),
  email: z.string().trim().email(),
  password: z.string().min(10).max(128).superRefine((password, context) => {
    const issue = strongPasswordIssue(password);
    if (issue) context.addIssue({ code: z.ZodIssueCode.custom, message: issue });
  }),
  phone: z.string().trim().min(5).max(40),
  slug: z.string().trim().min(2).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/i),
  country: z.string().trim().min(2).max(100),
  timezone: z.string().trim().min(3).max(100).refine(isValidIanaTimezone, "Choose a valid IANA timezone."),
  currency: z.string().trim().toUpperCase().refine(isValidCurrencyCode, "Choose a valid ISO-4217 currency."),
  billingCurrency: z.enum(supportedCloudBillingCurrencies),
  locale: z.string().trim().min(2).max(35).optional()
});

function normalizeSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export async function POST(request: Request) {
  const limited = await enforceRateLimit(request, "cloud-signup", { limit: 8, windowSeconds: 60 });
  if (limited) return limited;

  const parsed = await parseJson(request, signupSchema, "Please complete your company signup details.");
  if (parsed.response) return parsed.response;

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Fly Logistics Cloud signup is temporarily unavailable." }, { status: 503 });

  const slug = normalizeSlug(parsed.data.slug);
  if (!slug) return NextResponse.json({ error: "Choose a valid company slug." }, { status: 400 });
  const country = normalizeCountryCode(parsed.data.country);
  if (!country) return NextResponse.json({ error: "Choose a valid ISO country." }, { status: 400 });

  const existingCompany = await supabase.from("companies").select("id").eq("slug", slug).maybeSingle();
  if (existingCompany.error && isTenantSchemaMissing(existingCompany.error)) {
    return NextResponse.json({ error: "Fly Logistics Cloud signup is temporarily unavailable." }, { status: 503 });
  }
  if (existingCompany.error) return NextResponse.json({ error: "Unable to check company slug availability." }, { status: 500 });
  if (existingCompany.data) return NextResponse.json({ error: "This company slug is already taken." }, { status: 409 });

  const createdUser = await supabase.auth.admin.createUser({
    email: parsed.data.email,
    password: parsed.data.password,
    email_confirm: true,
    user_metadata: {
      full_name: parsed.data.ownerName,
      phone: parsed.data.phone,
      company: parsed.data.companyName,
      role: "customer"
    }
  });

  if (createdUser.error || !createdUser.data.user) {
    logAuthError(
      createdUser.error ?? new Error("No user returned during Cloud signup."),
      "Unable to create Fly Logistics Cloud owner account.",
      requestContext(request, { email: parsed.data.email, slug })
    );
    return NextResponse.json(
      { error: "Unable to create the owner account. Check whether this email already has an account." },
      { status: 400 }
    );
  }

  const user = createdUser.data.user;
  const company = await supabase
    .from("companies")
    .insert({
      name: parsed.data.companyName,
      slug,
      support_email: parsed.data.email,
      support_phone: parsed.data.phone,
      brand_color: "#ff7900",
      plan: "starter",
      status: "active",
      subscription_status: "trialing",
      subscription_plan: "starter",
      trial_ends_at: cloudTrialEndsAt(),
      billing_email: parsed.data.email,
      country,
      timezone: parsed.data.timezone,
      currency: parsed.data.currency,
      locale: normalizeTenantLocale(parsed.data.locale, country),
      billing_currency: parsed.data.billingCurrency,
      billing_amount: 0
    })
    .select("*")
    .single();

  if (company.error || !company.data) {
    await supabase.auth.admin.deleteUser(user.id);
    logApiError(
      company.error ?? new Error("No company returned during Cloud signup."),
      "Unable to create Fly Logistics Cloud workspace.",
      requestContext(request, { userId: user.id, slug })
    );
    return NextResponse.json({ error: "Unable to create the company workspace right now." }, { status: 500 });
  }

  const profile = await supabase.from("user_profiles").upsert(
    {
      id: user.id,
      email: parsed.data.email,
      full_name: parsed.data.ownerName,
      company: parsed.data.companyName,
      company_id: company.data.id,
      phone: parsed.data.phone,
      role: normalizeRole("customer"),
      updated_at: new Date().toISOString()
    },
    { onConflict: "id" }
  );

  if (profile.error) {
    await supabase.from("companies").delete().eq("id", company.data.id);
    await supabase.auth.admin.deleteUser(user.id);
    logApiError(
      profile.error,
      "Unable to create Fly Logistics Cloud owner profile.",
      requestContext(request, { userId: user.id, companyId: company.data.id })
    );
    return NextResponse.json({ error: "Unable to complete the owner profile right now." }, { status: 500 });
  }

  const membership = await supabase.from("company_members").insert({
    company_id: company.data.id,
    user_id: user.id,
    role: "owner"
  });

  if (membership.error) {
    await supabase.from("user_profiles").delete().eq("id", user.id);
    await supabase.from("companies").delete().eq("id", company.data.id);
    await supabase.auth.admin.deleteUser(user.id);
    logApiError(
      membership.error,
      "Unable to create Fly Logistics Cloud owner membership.",
      requestContext(request, { userId: user.id, companyId: company.data.id })
    );
    return NextResponse.json({ error: "Unable to complete company access setup right now." }, { status: 500 });
  }

  const defaultMembershipError = await removeDefaultCompanyMembership(supabase, user.id);
  if (defaultMembershipError) {
    const rollbackErrors = await Promise.all([
      supabase.from("company_members").delete().eq("company_id", company.data.id).eq("user_id", user.id),
      supabase.from("user_profiles").delete().eq("id", user.id),
      supabase.from("companies").delete().eq("id", company.data.id)
    ]);
    for (const rollback of rollbackErrors) {
      if (rollback.error) {
        logApiError(
          rollback.error,
          "Unable to roll back the incomplete Cloud owner workspace.",
          requestContext(request, { userId: user.id, companyId: company.data.id })
        );
      }
    }
    const userRollback = await supabase.auth.admin.deleteUser(user.id);
    if (userRollback.error) {
      logApiError(
        userRollback.error,
        "Unable to remove the incomplete Cloud owner account after company access setup failed.",
        requestContext(request, { userId: user.id, slug })
      );
    }
    logApiError(
      defaultMembershipError,
      "Unable to remove the default Fly company membership for the Cloud owner.",
      requestContext(request, { userId: user.id, slug })
    );
    return NextResponse.json({ error: "Unable to prepare the owner account right now." }, { status: 503 });
  }

  return NextResponse.json({
    ok: true,
    company: {
      id: company.data.id,
      name: company.data.name,
      slug: company.data.slug
    },
    email: parsed.data.email,
    redirectTo: "/cloud/dashboard"
  }, { status: 201 });
}
