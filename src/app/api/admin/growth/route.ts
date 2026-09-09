import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/request-auth";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { apiError, enforceRateLimit, parseJson } from "@/server/api";
import { writeAuditLog } from "@/server/audit";
import { googleBusinessProfileHealth, syncGoogleBusinessProfile } from "@/server/google-business-profile";
import { logApiError, requestContext } from "@/server/monitoring";
import { sendEmailNotification } from "@/server/notifications/email";
import { writeOperationalEvent } from "@/server/operational-events";

export const dynamic = "force-dynamic";

type DbError = { code?: string; message?: string };

const campaignCreateSchema = z.object({
  action: z.literal("create_email_campaign"),
  name: z.string().trim().min(2).max(160),
  audience: z.enum(["customers", "merchants", "leads", "all"]).default("customers"),
  subject: z.string().trim().min(4).max(180),
  bodyText: z.string().trim().min(10).max(5000),
  ctaUrl: z.string().trim().url().optional().or(z.literal("")),
  ctaLabel: z.string().trim().max(80).optional().nullable()
});

const campaignSendSchema = z.object({
  action: z.literal("send_email_campaign"),
  campaignId: z.coerce.number().int().positive()
});

const affiliatePayoutSchema = z.object({
  action: z.literal("create_affiliate_payout"),
  affiliatePartnerId: z.coerce.number().int().positive().optional().nullable(),
  referralRewardId: z.coerce.number().int().positive().optional().nullable(),
  amount: z.coerce.number().min(0).max(1_000_000_000),
  paymentMethod: z.string().trim().max(120).optional().nullable(),
  paymentNote: z.string().trim().max(1000).optional().nullable()
});

const affiliatePayoutUpdateSchema = z.object({
  action: z.literal("update_affiliate_payout"),
  payoutId: z.coerce.number().int().positive(),
  status: z.enum(["pending", "approved", "paid", "cancelled"]),
  paymentNote: z.string().trim().max(1000).optional().nullable()
});

const googleProfileSyncSchema = z.object({
  action: z.literal("sync_google_business_profile")
});

const growthActionSchema = z.discriminatedUnion("action", [
  campaignCreateSchema,
  campaignSendSchema,
  affiliatePayoutSchema,
  affiliatePayoutUpdateSchema,
  googleProfileSyncSchema
]);

function missingOptionalTable(error: DbError | null | undefined) {
  return error?.code === "42P01" || error?.code === "42703";
}

async function safeRows<T>(query: PromiseLike<{ data: T[] | null; error: DbError | null }>, context: string) {
  const { data, error } = await query;
  if (error && missingOptionalTable(error)) return [] as T[];
  if (error) {
    logApiError(error, `Unable to load growth ${context}.`);
    return [] as T[];
  }
  return data ?? [];
}

function money(value: unknown) {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? amount : 0;
}

function dayKey(value?: string | null) {
  if (!value) return "Unknown";
  return new Date(value).toISOString().slice(0, 10);
}

function groupCount<T>(rows: T[], keyFor: (row: T) => string | null | undefined) {
  const counts = new Map<string, number>();
  rows.forEach((row) => {
    const key = keyFor(row) || "Unknown";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });
  return Array.from(counts.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);
}

function uniqueRecipients(rows: Array<{ email?: string | null; name?: string | null }>) {
  const seen = new Set<string>();
  return rows
    .map((row) => ({
      email: String(row.email ?? "").trim().toLowerCase(),
      name: String(row.name ?? "").trim()
    }))
    .filter((row) => {
      if (!row.email.includes("@") || seen.has(row.email)) return false;
      seen.add(row.email);
      return true;
    })
    .slice(0, 200);
}

async function campaignRecipients(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  audience: string
) {
  const customerQuery = supabase
    .from("user_profiles")
    .select("email,full_name,role")
    .eq("role", "customer")
    .limit(200);
  const merchantQuery = supabase
    .from("business_accounts")
    .select("contact_email,contact_name,billing_email,account_name")
    .limit(200);
  const leadQuery = supabase
    .from("growth_leads")
    .select("email,full_name,status")
    .limit(200);

  const [customers, merchants, leads] = await Promise.all([
    audience === "customers" || audience === "all" ? customerQuery : Promise.resolve({ data: [], error: null }),
    audience === "merchants" || audience === "all" ? merchantQuery : Promise.resolve({ data: [], error: null }),
    audience === "leads" || audience === "all" ? leadQuery : Promise.resolve({ data: [], error: null })
  ]);

  const rows = [
    ...((customers.data ?? []) as Array<{ email?: string | null; full_name?: string | null }>).map((row) => ({ email: row.email, name: row.full_name })),
    ...((merchants.data ?? []) as Array<{ contact_email?: string | null; billing_email?: string | null; contact_name?: string | null; account_name?: string | null }>).flatMap((row) => [
      { email: row.contact_email, name: row.contact_name ?? row.account_name },
      { email: row.billing_email, name: row.account_name }
    ]),
    ...((leads.data ?? []) as Array<{ email?: string | null; full_name?: string | null }>).map((row) => ({ email: row.email, name: row.full_name }))
  ];

  return uniqueRecipients(rows);
}

export async function GET(request: Request) {
  const limited = await enforceRateLimit(request, "admin-growth", { limit: 80, windowSeconds: 60 });
  if (limited) return limited;

  const access = await requireRole(request, ["admin", "customer_care", "moderator", "finance"]);
  if (!access.profile) return NextResponse.json({ error: access.error }, { status: access.status });
  if (access.error) return NextResponse.json({ error: access.error }, { status: access.status });

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Growth dashboard is temporarily unavailable." }, { status: 503 });

  try {
    const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const [quotes, shipments, merchants, leads, crmContacts, referrals, loyalty, testimonials, campaigns, affiliatePartners, emailCampaigns, campaignSends, affiliatePayouts, googleProfileSyncs] = await Promise.all([
      safeRows<{
        request_id: string;
        status?: string | null;
        payment_status?: string | null;
        payment_amount?: number | string | null;
        quoted_price?: number | string | null;
        estimated_price?: number | string | null;
        customer_email?: string | null;
        delivery_category?: string | null;
        destination_state?: string | null;
        destination_country?: string | null;
        created_at?: string | null;
      }>(
        supabase
          .from("quote_requests")
          .select("request_id,status,payment_status,payment_amount,quoted_price,estimated_price,customer_email,delivery_category,destination_state,destination_country,created_at")
          .gte("created_at", since)
          .order("created_at", { ascending: false })
          .limit(1000),
        "quotes"
      ),
      safeRows<{
        tracking_id: string;
        status?: string | null;
        payment_status?: string | null;
        payment_amount?: number | string | null;
        customer_email?: string | null;
        carrier_provider?: string | null;
        destination_state?: string | null;
        destination_country?: string | null;
        created_at?: string | null;
      }>(
        supabase
          .from("shipments")
          .select("tracking_id,status,payment_status,payment_amount,customer_email,carrier_provider,destination_state,destination_country,created_at")
          .gte("created_at", since)
          .order("created_at", { ascending: false })
          .limit(1000),
        "shipments"
      ),
      safeRows<{ id: number | string; account_name?: string | null; status?: string | null; created_at?: string | null }>(
        supabase.from("business_accounts").select("id,account_name,status,created_at").order("created_at", { ascending: false }).limit(300),
        "merchant accounts"
      ),
      safeRows<{ id: number | string; status?: string | null; source?: string | null; campaign?: string | null; created_at?: string | null }>(
        supabase.from("growth_leads").select("id,status,source,campaign,created_at").order("created_at", { ascending: false }).limit(500),
        "leads"
      ),
      safeRows<{ id: number | string; lifecycle_stage?: string | null; source?: string | null; email?: string | null; created_at?: string | null }>(
        supabase.from("crm_contacts").select("id,lifecycle_stage,source,email,created_at").order("created_at", { ascending: false }).limit(500),
        "CRM contacts"
      ),
      safeRows<{ id: number | string; status?: string | null; reward_amount?: number | string | null; created_at?: string | null }>(
        supabase.from("referral_rewards").select("id,status,reward_amount,created_at").order("created_at", { ascending: false }).limit(500),
        "referrals"
      ),
      safeRows<{ id: number | string; status?: string | null; bonus_amount?: number | string | null; created_at?: string | null }>(
        supabase.from("loyalty_rewards").select("id,status,bonus_amount,created_at").order("created_at", { ascending: false }).limit(500),
        "loyalty"
      ),
      safeRows<{ id: number | string; rating?: number | string | null; status?: string | null; created_at?: string | null }>(
        supabase.from("customer_testimonials").select("id,rating,status,created_at").order("created_at", { ascending: false }).limit(300),
        "testimonials"
      ),
      safeRows<{ id: number | string; source?: string | null; medium?: string | null; campaign?: string | null; event_name?: string | null; created_at?: string | null }>(
        supabase.from("campaign_events").select("id,source,medium,campaign,event_name,created_at").order("created_at", { ascending: false }).limit(1000),
        "campaign events"
      ),
      safeRows<{ id: number | string; partner_name?: string | null; status?: string | null; commission_rate?: number | string | null; created_at?: string | null }>(
        supabase.from("affiliate_partners").select("id,partner_name,status,commission_rate,created_at").order("created_at", { ascending: false }).limit(300),
        "affiliate partners"
      ),
      safeRows<{ id: number | string; name?: string | null; status?: string | null; audience?: string | null; sent_count?: number | string | null; created_at?: string | null }>(
        supabase.from("email_campaigns").select("id,name,status,audience,subject,sent_count,created_at,sent_at,last_error").order("created_at", { ascending: false }).limit(300),
        "email campaigns"
      ),
      safeRows<{ id: number | string; campaign_id?: number | string | null; status?: string | null; recipient_email?: string | null; sent_at?: string | null; created_at?: string | null }>(
        supabase.from("email_campaign_sends").select("id,campaign_id,status,recipient_email,sent_at,created_at").order("created_at", { ascending: false }).limit(500),
        "email campaign sends"
      ),
      safeRows<{ id: number | string; amount?: number | string | null; status?: string | null; payout_reference?: string | null; created_at?: string | null; paid_at?: string | null }>(
        supabase.from("affiliate_payouts").select("id,amount,status,payout_reference,created_at,paid_at").order("created_at", { ascending: false }).limit(300),
        "affiliate payouts"
      ),
      safeRows<{ id: number | string; status?: string | null; location_name?: string | null; error_message?: string | null; synced_at?: string | null; created_at?: string | null }>(
        supabase.from("google_business_profile_syncs").select("id,status,location_name,error_message,synced_at,created_at").order("created_at", { ascending: false }).limit(30),
        "Google Business Profile syncs"
      )
    ]);

    const paidQuotes = quotes.filter((quote) => String(quote.payment_status ?? "").toUpperCase() === "PAID");
    const paidShipments = shipments.filter((shipment) => String(shipment.payment_status ?? "").toUpperCase() === "PAID");
    const uniqueCustomers = new Set([
      ...quotes.map((quote) => quote.customer_email?.toLowerCase()).filter(Boolean),
      ...shipments.map((shipment) => shipment.customer_email?.toLowerCase()).filter(Boolean)
    ]);
    const leadTotal = leads.length + quotes.length + merchants.length + crmContacts.length;
    const conversionTotal = paidQuotes.length + paidShipments.length;
    const revenue = paidQuotes.reduce((sum, quote) => sum + money(quote.payment_amount ?? quote.quoted_price ?? quote.estimated_price), 0)
      + paidShipments.reduce((sum, shipment) => sum + money(shipment.payment_amount), 0);

    const gbpHealth = await googleBusinessProfileHealth(supabase);

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      metrics: {
        leads: leadTotal,
        prospects: quotes.filter((quote) => !["PAID", "CONVERTED_TO_SHIPMENT"].includes(String(quote.status ?? "").toUpperCase())).length,
        customers: uniqueCustomers.size,
        merchants: merchants.length,
        crmContacts: crmContacts.length,
        paidConversions: conversionTotal,
        conversionRate: leadTotal ? Math.round((conversionTotal / leadTotal) * 1000) / 10 : 0,
        revenue,
        referrals: referrals.length,
        loyaltyRewards: loyalty.length,
        testimonials: testimonials.length,
        campaignEvents: campaigns.length,
        affiliatePartners: affiliatePartners.length,
        emailCampaigns: emailCampaigns.length,
        emailSends: campaignSends.length,
        affiliatePayouts: affiliatePayouts.length,
        affiliatePayoutTotal: affiliatePayouts.reduce((sum, payout) => sum + money(payout.amount), 0)
      },
      charts: {
        leadsOverTime: groupCount([...leads, ...quotes], (row) => dayKey(row.created_at)).sort((a, b) => a.label.localeCompare(b.label)).slice(-14),
        leadSources: groupCount(leads, (row) => row.source),
        crmStages: groupCount(crmContacts, (row) => row.lifecycle_stage),
        campaigns: groupCount(campaigns, (row) => row.campaign ?? row.source),
        quoteCategories: groupCount(quotes, (row) => row.delivery_category),
        topDestinations: groupCount([...quotes, ...shipments], (row) => row.destination_state ?? row.destination_country),
        carrierRevenue: groupCount(paidShipments, (row) => row.carrier_provider),
        conversionFunnel: [
          { label: "Leads", value: leadTotal },
          { label: "Prospects", value: quotes.filter((quote) => !["PAID", "CONVERTED_TO_SHIPMENT"].includes(String(quote.status ?? "").toUpperCase())).length },
          { label: "Paid", value: conversionTotal },
          { label: "Customers", value: uniqueCustomers.size }
        ],
        emailCampaigns: groupCount(emailCampaigns, (row) => row.status),
        emailDelivery: groupCount(campaignSends, (row) => row.status),
        affiliates: groupCount(affiliatePartners, (row) => row.status),
        affiliatePayouts: groupCount(affiliatePayouts, (row) => row.status),
        attributionRevenue: groupCount(campaigns, (row) => row.campaign ?? row.source)
      },
      latest: {
        leads: leads.slice(0, 8),
        crmContacts: crmContacts.slice(0, 8),
        merchants: merchants.slice(0, 8),
        testimonials: testimonials.slice(0, 8),
        campaigns: campaigns.slice(0, 8),
        affiliates: affiliatePartners.slice(0, 8),
        emailCampaigns: emailCampaigns.slice(0, 8),
        emailSends: campaignSends.slice(0, 8),
        affiliatePayouts: affiliatePayouts.slice(0, 8),
        googleBusinessProfile: googleProfileSyncs.slice(0, 5)
      },
      marketingSetup: {
        googleAnalytics: Boolean(process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID),
        metaPixel: Boolean(process.env.NEXT_PUBLIC_META_PIXEL_ID || process.env.META_PIXEL_ID),
        metaConversionsApi: Boolean(process.env.META_CONVERSIONS_API_ACCESS_TOKEN),
        googleBusinessProfile: gbpHealth.configured,
        googleBusinessProfileUrl: Boolean(process.env.GOOGLE_BUSINESS_PROFILE_URL)
      },
      googleBusinessProfile: {
        ...gbpHealth,
        lastSync: googleProfileSyncs[0] ?? null
      }
    });
  } catch (error) {
    logApiError(error, "Unable to load growth dashboard.", requestContext(request));
    return NextResponse.json({ error: "Unable to load growth dashboard." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const limited = await enforceRateLimit(request, "admin-growth-actions", { limit: 40, windowSeconds: 60 });
  if (limited) return limited;

  const access = await requireRole(request, ["admin", "customer_care", "moderator", "finance"]);
  if (!access.profile) return NextResponse.json({ error: access.error }, { status: access.status });
  if (access.error) return NextResponse.json({ error: access.error }, { status: access.status });

  const parsed = await parseJson(request, growthActionSchema, "Invalid growth action.");
  if (parsed.response) return parsed.response;

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Growth operations are temporarily unavailable." }, { status: 503 });

  try {
    if (parsed.data.action === "create_email_campaign") {
      const { data, error } = await supabase
        .from("email_campaigns")
        .insert({
          name: parsed.data.name,
          audience: parsed.data.audience,
          target_segment: parsed.data.audience,
          subject: parsed.data.subject,
          body_text: parsed.data.bodyText,
          cta_url: parsed.data.ctaUrl || null,
          cta_label: parsed.data.ctaLabel || "Open Fly Logistics",
          status: "draft",
          metadata: { createdBy: access.profile.email }
        })
        .select("*")
        .single();

      if (error) throw error;
      await writeAuditLog(supabase, { actor: access.profile, action: "growth.email_campaign_create", entityType: "email_campaign", entityId: String(data.id), metadata: parsed.data, request });
      return NextResponse.json(data, { status: 201 });
    }

    if (parsed.data.action === "send_email_campaign") {
      const campaign = await supabase
        .from("email_campaigns")
        .select("*")
        .eq("id", parsed.data.campaignId)
        .maybeSingle();

      if (campaign.error) throw campaign.error;
      if (!campaign.data) return apiError("Email campaign not found.", { status: 404 });

      const recipients = await campaignRecipients(supabase, String(campaign.data.audience ?? campaign.data.target_segment ?? "customers"));
      if (recipients.length === 0) return apiError("No recipients are available for this campaign audience.", { status: 409 });

      let sent = 0;
      let failed = 0;
      const now = new Date().toISOString();

      for (const recipient of recipients) {
        const result = await sendEmailNotification({
          emailTo: recipient.email,
          workflow: "email_campaign",
          subject: String(campaign.data.subject ?? "Fly Logistics update"),
          title: String(campaign.data.name ?? "Fly Logistics update"),
          message: String(campaign.data.body_text ?? "Fly Logistics has an update for you."),
          ctaUrl: String(campaign.data.cta_url ?? ""),
          ctaLabel: String(campaign.data.cta_label ?? "Open Fly Logistics"),
          entityType: "email_campaign",
          entityId: String(campaign.data.id),
          metadata: {
            campaignId: campaign.data.id,
            audience: campaign.data.audience,
            recipientName: recipient.name
          }
        });

        if (result.ok) sent += 1;
        else failed += 1;

        await supabase.from("email_campaign_sends").insert({
          campaign_id: campaign.data.id,
          recipient_email: recipient.email,
          recipient_name: recipient.name || null,
          status: result.ok ? "sent" : "failed",
          provider: "resend",
          provider_message_id: result.providerMessageId ?? null,
          error_message: result.reason ?? null,
          sent_at: result.ok ? now : null,
          metadata: { providerStatus: result.providerStatus ?? null }
        });
      }

      const status = failed > 0 && sent === 0 ? "failed" : failed > 0 ? "sent_with_errors" : "sent";
      await supabase
        .from("email_campaigns")
        .update({
          status,
          sent_count: sent,
          last_error: failed ? `${failed} recipient(s) failed.` : null,
          sent_at: now,
          updated_at: now
        })
        .eq("id", campaign.data.id);

      await writeAuditLog(supabase, { actor: access.profile, action: "growth.email_campaign_send", entityType: "email_campaign", entityId: String(campaign.data.id), metadata: { sent, failed }, request });
      await writeOperationalEvent(supabase, { category: "enterprise", message: "Email campaign send completed.", entityType: "email_campaign", entityId: String(campaign.data.id), metadata: { sent, failed }, request });

      return NextResponse.json({ ok: true, sent, failed, total: recipients.length, status });
    }

    if (parsed.data.action === "create_affiliate_payout") {
      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from("affiliate_payouts")
        .insert({
          affiliate_partner_id: parsed.data.affiliatePartnerId ?? null,
          referral_reward_id: parsed.data.referralRewardId ?? null,
          payout_reference: `FLY-AFF-${Date.now()}`,
          amount: parsed.data.amount,
          currency: "NGN",
          status: "approved",
          payment_method: parsed.data.paymentMethod || null,
          payment_note: parsed.data.paymentNote || null,
          approved_by: access.profile.id,
          approved_at: now,
          updated_at: now
        })
        .select("*")
        .single();

      if (error) throw error;
      await writeAuditLog(supabase, { actor: access.profile, action: "growth.affiliate_payout_create", entityType: "affiliate_payout", entityId: String(data.id), metadata: parsed.data, request });
      return NextResponse.json(data, { status: 201 });
    }

    if (parsed.data.action === "update_affiliate_payout") {
      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from("affiliate_payouts")
        .update({
          status: parsed.data.status,
          payment_note: parsed.data.paymentNote || null,
          paid_at: parsed.data.status === "paid" ? now : null,
          updated_at: now
        })
        .eq("id", parsed.data.payoutId)
        .select("*")
        .single();

      if (error) throw error;
      await writeAuditLog(supabase, { actor: access.profile, action: "growth.affiliate_payout_update", entityType: "affiliate_payout", entityId: String(data.id), metadata: parsed.data, request });
      return NextResponse.json(data);
    }

    const result = await syncGoogleBusinessProfile(supabase, request, access.profile);
    return NextResponse.json(result, { status: result.ok ? 200 : 202 });
  } catch (error) {
    logApiError(error, "Unable to process growth action.", requestContext(request));
    return NextResponse.json({ error: "Unable to complete growth action." }, { status: 500 });
  }
}
