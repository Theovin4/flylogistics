import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { enforceRateLimit } from "@/server/api";
import { requireCompanyRole } from "@/server/tenancy";

export const dynamic = "force-dynamic";

async function countRows(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  table: string,
  companyId: string,
  filters: Record<string, string> = {}
) {
  let query = supabase.from(table).select("id", { count: "exact", head: true }).eq("company_id", companyId);
  for (const [key, value] of Object.entries(filters)) query = query.eq(key, value);
  const { count, error } = await query;
  if (error) return { count: 0, error: error.message };
  return { count: count ?? 0, error: null };
}

function tableMissing(error: { code?: string; message?: string } | null | undefined) {
  const message = error?.message?.toLowerCase() ?? "";
  return error?.code === "42P01" || error?.code === "42703" || error?.code === "PGRST204" || message.includes("could not find");
}

function moneyValue(value: unknown) {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? amount : 0;
}

export async function GET(request: Request) {
  const limited = await enforceRateLimit(request, "cloud-overview", { limit: 80, windowSeconds: 60 });
  if (limited) return limited;

  const access = await requireCompanyRole(request, ["owner", "admin", "dispatcher"]);
  if (!access.profile || !access.tenant) return NextResponse.json({ error: access.error }, { status: access.status });
  if (access.error) return NextResponse.json({ error: access.error }, { status: access.status });

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Cloud workspace is temporarily unavailable." }, { status: 503 });
  if (!access.tenant.companyId) return NextResponse.json({ error: "Company workspace is not configured." }, { status: 409 });

  const companyId = access.tenant.companyId;
  const [
    shipments,
    activeShipments,
    deliveredShipments,
    quoteRequests,
    drivers,
    customers,
    recentShipments,
    recentQuotes,
    members,
    subscriptions
  ] = await Promise.all([
    countRows(supabase, "shipments", companyId),
    countRows(supabase, "shipments", companyId, { status: "IN_TRANSIT" }),
    countRows(supabase, "shipments", companyId, { status: "DELIVERED" }),
    countRows(supabase, "quote_requests", companyId),
    countRows(supabase, "drivers", companyId),
    supabase.from("company_members").select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("role", "customer"),
    supabase
      .from("shipments")
      .select("id,tracking_id,customer_name,pickup_address,delivery_address,status,carrier_provider,updated_at,created_at")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .limit(8),
    supabase
      .from("quote_requests")
      .select("id,request_id,customer_name,pickup_address,delivery_address,status,payment_status,payment_amount,created_at")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .limit(8),
    supabase
      .from("company_members")
      .select("id,user_id,role,created_at")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .limit(8),
    supabase
      .from("subscriptions")
      .select("id,plan,status,amount,currency,payment_reference,flutterwave_subscription_id,started_at,renewal_date,cancelled_at,created_at,updated_at")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .limit(20)
  ]);

  const subscriptionRows = tableMissing(subscriptions.error) ? [] : subscriptions.data ?? [];
  const activeSubscriptions = subscriptionRows.filter((row) => String(row.status ?? "").toLowerCase() === "active");
  const cancelledSubscriptions = subscriptionRows.filter((row) => ["cancelled", "expired"].includes(String(row.status ?? "").toLowerCase()));
  const revenueByPlan = subscriptionRows.reduce<Record<string, number>>((acc, row) => {
    const plan = String(row.plan ?? "starter");
    if (String(row.status ?? "").toLowerCase() === "active") acc[plan] = (acc[plan] ?? 0) + moneyValue(row.amount);
    return acc;
  }, {});

  return NextResponse.json({
    company: access.tenant.company,
    role: access.tenant.companyRole,
    metrics: {
      shipments: shipments.count,
      activeShipments: activeShipments.count,
      deliveredShipments: deliveredShipments.count,
      quoteRequests: quoteRequests.count,
      drivers: drivers.count,
      customers: customers.count ?? 0
    },
    recentShipments: recentShipments.error ? [] : recentShipments.data ?? [],
    recentQuotes: recentQuotes.error ? [] : recentQuotes.data ?? [],
    members: members.error ? [] : members.data ?? [],
    billingHistory: subscriptionRows,
    billingAnalytics: {
      monthlyRecurringRevenue: activeSubscriptions.reduce((sum, row) => sum + moneyValue(row.amount), 0),
      activeSubscriptions: activeSubscriptions.length,
      churnRate: subscriptionRows.length ? Math.round((cancelledSubscriptions.length / subscriptionRows.length) * 1000) / 10 : 0,
      revenueByPlan
    },
    warnings: [
      shipments.error,
      activeShipments.error,
      deliveredShipments.error,
      quoteRequests.error,
      drivers.error,
      customers.error?.message,
      recentShipments.error?.message,
      recentQuotes.error?.message,
      members.error?.message,
      tableMissing(subscriptions.error) ? "Run the Cloud subscriptions SQL to unlock recurring billing history." : subscriptions.error?.message
    ].filter(Boolean)
  });
}
