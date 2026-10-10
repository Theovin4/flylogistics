import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { enforceRateLimit } from "@/server/api";
import { requireCompanyRole } from "@/server/tenancy";

export const dynamic = "force-dynamic";

function periodStart(period: string) {
  const days = period === "90d" ? 90 : period === "7d" ? 7 : 30;
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

function amount(value: unknown) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

export async function GET(request: Request) {
  const limited = await enforceRateLimit(request, "cloud-analytics", { limit: 60, windowSeconds: 60 });
  if (limited) return limited;
  const access = await requireCompanyRole(request, ["owner", "admin", "dispatcher"]);
  if (!access.profile || !access.tenant || access.error) return NextResponse.json({ error: access.error }, { status: access.status });
  const supabase = getSupabaseAdmin();
  if (!supabase || !access.tenant.companyId) return NextResponse.json({ error: "Analytics are temporarily unavailable." }, { status: 503 });

  const period = new URL(request.url).searchParams.get("period") ?? "30d";
  const since = periodStart(period);
  const companyId = access.tenant.companyId;
  const [shipments, customers, drivers, quotes] = await Promise.all([
    supabase.from("shipments")
      .select("id,status,tracking_id,customer_email,destination_state,delivery_address,driver_id,payment_amount,quoted_price,created_at,updated_at")
      .eq("company_id", companyId).gte("created_at", since).order("created_at", { ascending: true }).limit(5000),
    supabase.from("cloud_customers").select("id,created_at,last_shipment_at").eq("company_id", companyId).gte("created_at", since).limit(5000),
    supabase.from("drivers").select("id,name,status,approval_status").eq("company_id", companyId).limit(1000),
    supabase.from("quote_requests").select("id,status,payment_status,created_at").eq("company_id", companyId).gte("created_at", since).limit(5000)
  ]);
  const error = shipments.error ?? customers.error ?? drivers.error ?? quotes.error;
  if (error) return NextResponse.json({ error: "Unable to load tenant analytics.", details: error.message }, { status: 500 });

  const shipmentRows = shipments.data ?? [];
  const statusDistribution: Record<string, number> = {};
  const destinationCounts: Record<string, number> = {};
  const driverCounts: Record<string, number> = {};
  const dayTrend: Record<string, number> = {};
  let delivered = 0;
  let failed = 0;
  let revenue = 0;
  for (const row of shipmentRows) {
    const status = String(row.status ?? "PENDING").toUpperCase();
    statusDistribution[status] = (statusDistribution[status] ?? 0) + 1;
    if (status === "DELIVERED") delivered += 1;
    if (["FAILED", "CANCELLED", "EXCEPTION"].includes(status)) failed += 1;
    revenue += amount(row.payment_amount ?? row.quoted_price);
    const destination = String(row.destination_state ?? row.delivery_address ?? "Not set").trim();
    destinationCounts[destination] = (destinationCounts[destination] ?? 0) + 1;
    if (row.driver_id !== null) driverCounts[String(row.driver_id)] = (driverCounts[String(row.driver_id)] ?? 0) + 1;
    const day = String(row.created_at ?? "").slice(0, 10);
    if (day) dayTrend[day] = (dayTrend[day] ?? 0) + 1;
  }
  const driverName = new Map((drivers.data ?? []).map((driver) => [String(driver.id), driver.name]));
  const acceptedQuotes = (quotes.data ?? []).filter((quote) => ["ACCEPTED", "PAID", "CONVERTED", "CONVERTED_TO_SHIPMENT"].includes(String(quote.status ?? "").toUpperCase())).length;

  return NextResponse.json({
    period,
    metrics: {
      shipments: shipmentRows.length,
      delivered,
      failed,
      active: shipmentRows.length - delivered - failed,
      successRate: shipmentRows.length ? Math.round((delivered / shipmentRows.length) * 1000) / 10 : 0,
      revenue,
      newCustomers: customers.data?.length ?? 0,
      activeDrivers: (drivers.data ?? []).filter((driver) => !["offline", "suspended", "rejected"].includes(String(driver.status ?? "").toLowerCase())).length,
      quoteConversion: quotes.data?.length ? Math.round((acceptedQuotes / quotes.data.length) * 1000) / 10 : 0
    },
    statusDistribution: Object.entries(statusDistribution).map(([label, value]) => ({ label, value })),
    shipmentTrend: Object.entries(dayTrend).map(([date, value]) => ({ date, value })),
    topDestinations: Object.entries(destinationCounts).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([label, value]) => ({ label, value })),
    driverWorkload: Object.entries(driverCounts).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([id, value]) => ({ id, label: driverName.get(id) ?? "Assigned driver", value }))
  });
}
