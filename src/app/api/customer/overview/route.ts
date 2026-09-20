import { NextResponse } from "next/server";
import { publicShipmentTimeline, type QuoteRequestRecord, type ShipmentRecord } from "@/lib/shipments";
import { requireRole } from "@/lib/request-auth";
import { shipmentWithDriverSelect } from "@/lib/shipment-data";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { enforceRateLimit } from "@/server/api";
import { logApiError, requestContext } from "@/server/monitoring";
import { getTenantContextForProfile } from "@/server/tenancy";
import { getWalletOverview, isWalletSchemaMissing } from "@/server/wallets";

export const dynamic = "force-dynamic";

function isOptionalCustomerTableMissing(error: { code?: string; message?: string }) {
  return error.code === "42P01" || error.code === "42703";
}

function sanitizeCustomerShipment(shipment: ShipmentRecord): ShipmentRecord {
  const safeShipment: ShipmentRecord = {
    ...shipment,
    carrier: null,
    carrier_provider: null,
    carrier_shipment_id: null,
    carrier_tracking_id: null,
    carrier_order_id: null,
    carrier_order_no: null,
    carrier_waybill_no: null,
    carrier_label_url: null,
    carrier_rate_amount: null,
    carrier_cost_amount: null,
    carrier_profit_amount: null,
    carrier_margin_percent: null,
    carrier_status: null,
    carrier_payload: null,
    carrier_response: null,
    carrier_error: null,
    carrier_raw_response: null,
    carrier_synced_at: null,
    external_tracking_enabled: false,
    proof_image_url: null,
    timeline: publicShipmentTimeline(shipment)
  };

  if (safeShipment.assigned_driver) safeShipment.assigned_driver = { ...safeShipment.assigned_driver, phone: null };
  return safeShipment;
}

export async function GET(request: Request) {
  const limited = await enforceRateLimit(request, "customer-overview", { limit: 80, windowSeconds: 60 });
  if (limited) return limited;

  const access = await requireRole(request, ["customer"]);
  if (!access.profile) return NextResponse.json({ error: access.error }, { status: access.status });
  if (access.error) return NextResponse.json({ error: access.error }, { status: access.status });

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Customer portal data is temporarily unavailable." }, { status: 503 });
  const tenant = await getTenantContextForProfile(supabase, access.profile);

  const email = access.profile.email?.trim();
  if (!email) {
    return NextResponse.json({
      profile: access.profile,
      quoteRequests: [],
      shipments: [],
      addresses: [],
      supportTickets: [],
      notifications: [],
      referralRewards: [],
      loyaltyRewards: [],
      testimonials: [],
      wallet: null,
      walletTransactions: [],
      warnings: []
    });
  }

  let quotesQuery = supabase
    .from("quote_requests")
    .select("*")
    .ilike("customer_email", email)
    .order("created_at", { ascending: false })
    .limit(50);
  let shipmentsQuery = supabase
    .from("shipments")
    .select(shipmentWithDriverSelect)
    .ilike("customer_email", email)
    .order("created_at", { ascending: false })
    .limit(50);
  if (tenant.schemaReady && tenant.companyId) {
    quotesQuery = quotesQuery.eq("company_id", tenant.companyId);
    shipmentsQuery = shipmentsQuery.eq("company_id", tenant.companyId);
  }

  const [quotesResult, shipmentsResult, addressesResult, ticketsResult, notificationsResult, referralRewardsResult, loyaltyRewardsResult, testimonialsResult, walletOverview] = await Promise.all([
    quotesQuery,
    shipmentsQuery,
    supabase
      .from("customer_addresses")
      .select("id,user_id,label,address_type,address,city,notes,is_default,created_at,updated_at")
      .eq("user_id", access.profile.id)
      .order("created_at", { ascending: false })
      .limit(30),
    supabase
      .from("customer_support_tickets")
      .select("*")
      .eq("user_id", access.profile.id)
      .order("created_at", { ascending: false })
      .limit(30),
    supabase
      .from("customer_notifications")
      .select("id,user_id,title,body,category,entity_type,entity_id,read_at,created_at")
      .eq("user_id", access.profile.id)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("referral_rewards")
      .select("id,referrer_user_id,referred_user_id,referral_code,reward_amount,currency,status,reward_type,created_at,approved_at,paid_at")
      .or(`referrer_user_id.eq.${access.profile.id},referred_user_id.eq.${access.profile.id}`)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("loyalty_rewards")
      .select("id,user_id,business_account_id,reward_type,bonus_amount,currency,status,reason,created_at,approved_at,applied_at")
      .eq("user_id", access.profile.id)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("customer_testimonials")
      .select("id,user_id,customer_name,company,rating,review,status,source,created_at,approved_at")
      .eq("user_id", access.profile.id)
      .order("created_at", { ascending: false })
      .limit(20),
    getWalletOverview(supabase, access.profile.id, tenant.companyId)
  ]);

  if (quotesResult.error) {
    logApiError(quotesResult.error, "Unable to load customer quote requests.", requestContext(request, { customerEmail: email }));
    return NextResponse.json({ error: "Unable to load your quote requests." }, { status: 500 });
  }

  if (shipmentsResult.error) {
    logApiError(shipmentsResult.error, "Unable to load customer shipments.", requestContext(request, { customerEmail: email }));
    return NextResponse.json({ error: "Unable to load your shipments." }, { status: 500 });
  }

  if (addressesResult.error && !isOptionalCustomerTableMissing(addressesResult.error)) {
    logApiError(addressesResult.error, "Unable to load customer addresses.", requestContext(request, { customerEmail: email }));
  }

  if (ticketsResult.error && !isOptionalCustomerTableMissing(ticketsResult.error)) {
    logApiError(ticketsResult.error, "Unable to load customer support tickets.", requestContext(request, { customerEmail: email }));
  }

  if (notificationsResult.error && !isOptionalCustomerTableMissing(notificationsResult.error)) {
    logApiError(notificationsResult.error, "Unable to load customer notifications.", requestContext(request, { customerEmail: email }));
  }

  if (referralRewardsResult.error && !isOptionalCustomerTableMissing(referralRewardsResult.error)) {
    logApiError(referralRewardsResult.error, "Unable to load customer referral rewards.", requestContext(request, { customerEmail: email }));
  }

  if (loyaltyRewardsResult.error && !isOptionalCustomerTableMissing(loyaltyRewardsResult.error)) {
    logApiError(loyaltyRewardsResult.error, "Unable to load customer loyalty rewards.", requestContext(request, { customerEmail: email }));
  }

  if (testimonialsResult.error && !isOptionalCustomerTableMissing(testimonialsResult.error)) {
    logApiError(testimonialsResult.error, "Unable to load customer testimonials.", requestContext(request, { customerEmail: email }));
  }

  const warnings = [
    addressesResult.error && isOptionalCustomerTableMissing(addressesResult.error) ? "Saved addresses are temporarily unavailable." : null,
    ticketsResult.error && isOptionalCustomerTableMissing(ticketsResult.error) ? "Customer support is temporarily unavailable." : null,
    notificationsResult.error && isOptionalCustomerTableMissing(notificationsResult.error) ? "Customer notifications are temporarily unavailable." : null,
    referralRewardsResult.error && isOptionalCustomerTableMissing(referralRewardsResult.error) ? "Referral rewards are temporarily unavailable." : null,
    loyaltyRewardsResult.error && isOptionalCustomerTableMissing(loyaltyRewardsResult.error) ? "Loyalty rewards are temporarily unavailable." : null,
    testimonialsResult.error && isOptionalCustomerTableMissing(testimonialsResult.error) ? "Customer reviews are temporarily unavailable." : null,
    walletOverview.error && isWalletSchemaMissing(walletOverview.error) ? "Customer wallet is temporarily unavailable." : null
  ].filter(Boolean);

  const response = NextResponse.json({
    profile: access.profile,
    quoteRequests: (quotesResult.data ?? []) as QuoteRequestRecord[],
    shipments: ((shipmentsResult.data ?? []) as ShipmentRecord[]).map(sanitizeCustomerShipment),
    addresses: addressesResult.error ? [] : addressesResult.data ?? [],
    supportTickets: ticketsResult.error ? [] : ticketsResult.data ?? [],
    notifications: notificationsResult.error ? [] : notificationsResult.data ?? [],
    referralRewards: referralRewardsResult.error ? [] : referralRewardsResult.data ?? [],
    loyaltyRewards: loyaltyRewardsResult.error ? [] : loyaltyRewardsResult.data ?? [],
    testimonials: testimonialsResult.error ? [] : testimonialsResult.data ?? [],
    wallet: walletOverview.error ? null : walletOverview.wallet,
    walletTransactions: walletOverview.error ? [] : walletOverview.transactions,
    warnings
  });
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  response.headers.set("Vary", "Authorization, Cookie");
  return response;
}
