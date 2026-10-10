import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/request-auth";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { enforceRateLimit, parseJson } from "@/server/api";
import { writeAuditLog } from "@/server/audit";
import { logApiError, requestContext } from "@/server/monitoring";
import { writeOperationalEvent } from "@/server/operational-events";
import { MERCHANT_DEFAULT_DISCOUNT_RATE } from "@/server/merchant-pricing";

export const dynamic = "force-dynamic";

const onboardingSchema = z.object({
  businessName: z.string().trim().min(2).max(180),
  businessType: z.string().trim().min(2).max(120),
  contactName: z.string().trim().min(2).max(160),
  contactEmail: z.string().trim().email().max(240),
  contactPhone: z.string().trim().min(10).max(40),
  pickupAddress: z.string().trim().min(8).max(260),
  city: z.string().trim().min(2).max(120),
  state: z.string().trim().min(2).max(120),
  country: z.string().trim().min(2).max(100).default("Nigeria"),
  monthlyShipmentVolume: z.string().trim().min(1).max(80),
  websiteSocial: z.string().trim().max(200).optional().or(z.literal("")),
  billingTerms: z.enum(["prepaid", "weekly", "monthly"]).default("prepaid")
});

export async function POST(request: Request) {
  const limited = await enforceRateLimit(request, "merchant-onboarding", { limit: 8, windowSeconds: 300 });
  if (limited) return limited;

  const access = await requireRole(request, ["customer"]);
  if (!access.profile) return NextResponse.json({ error: access.error }, { status: access.status });
  const parsed = await parseJson(request, onboardingSchema, "Complete the required business details.");
  if (parsed.response) return parsed.response;

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Merchant onboarding is temporarily unavailable." }, { status: 503 });

  try {
    const existingMembership = await supabase
      .from("business_account_members")
      .select("business_account_id,role,status")
      .eq("user_id", access.profile.id)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();
    if (existingMembership.error) throw existingMembership.error;
    if (existingMembership.data?.business_account_id) {
      const account = await supabase
        .from("business_accounts")
        .select("id,status")
        .eq("id", existingMembership.data.business_account_id)
        .maybeSingle();
      if (account.error) throw account.error;
      if (String(account.data?.status ?? "").toUpperCase() !== "ACTIVE") {
        return NextResponse.json({ error: "This merchant account is not active. Contact Fly Logistics support." }, { status: 403 });
      }
      return NextResponse.json({ ok: true, existing: true, accountId: existingMembership.data.business_account_id });
    }

    const onboardingKey = `merchant-owner-${access.profile.id}`;
    const accountPayload = {
      account_name: parsed.data.businessName,
      business_type: parsed.data.businessType,
      contact_name: parsed.data.contactName,
      contact_email: parsed.data.contactEmail,
      contact_phone: parsed.data.contactPhone,
      billing_email: parsed.data.contactEmail,
      billing_terms: parsed.data.billingTerms,
      address: parsed.data.pickupAddress,
      city: parsed.data.city,
      state: parsed.data.state,
      country: parsed.data.country,
      monthly_shipment_volume: parsed.data.monthlyShipmentVolume,
      website_social: parsed.data.websiteSocial || null,
      status: "ACTIVE",
      verification_status: "unverified",
      pricing_tier: "merchant",
      discount_rate: MERCHANT_DEFAULT_DISCOUNT_RATE,
      onboarding_key: onboardingKey,
      onboarding_completed_at: new Date().toISOString(),
      created_by: access.profile.id,
      updated_at: new Date().toISOString()
    };

    const accountResult = await supabase
      .from("business_accounts")
      .upsert(accountPayload, { onConflict: "onboarding_key" })
      .select("*")
      .single();
    if (accountResult.error || !accountResult.data) throw accountResult.error ?? new Error("Merchant account was not returned.");

    const membership = await supabase.from("business_account_members").upsert({
      business_account_id: accountResult.data.id,
      user_id: access.profile.id,
      role: "owner",
      status: "active"
    }, { onConflict: "business_account_id,user_id" }).select("id").single();
    if (membership.error) throw membership.error;

    await supabase.from("customer_addresses").insert({
      user_id: access.profile.id,
      business_account_id: accountResult.data.id,
      label: "Primary pickup",
      address_type: "pickup",
      address: parsed.data.pickupAddress,
      city: parsed.data.city,
      notes: `${parsed.data.state}, ${parsed.data.country}`,
      is_default: true,
      updated_at: new Date().toISOString()
    });

    await writeAuditLog(supabase, {
      actor: access.profile,
      action: "merchant.onboarding.complete",
      entityType: "business_account",
      entityId: String(accountResult.data.id),
      metadata: { businessName: parsed.data.businessName },
      request
    });
    await writeOperationalEvent(supabase, {
      category: "merchant",
      message: "Merchant onboarding completed.",
      entityType: "business_account",
      entityId: String(accountResult.data.id),
      metadata: { businessName: parsed.data.businessName },
      request
    });

    return NextResponse.json({ ok: true, accountId: accountResult.data.id }, { status: 201 });
  } catch (error) {
    logApiError(error, "Unable to complete merchant onboarding.", requestContext(request, { userId: access.profile.id }));
    return NextResponse.json({ error: "Unable to create the merchant business account. Please try again." }, { status: 500 });
  }
}
