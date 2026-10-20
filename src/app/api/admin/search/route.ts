import { NextResponse } from "next/server";
import { requireRole } from "@/lib/request-auth";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { apiError, enforceRateLimit, handleApiError } from "@/server/api";
import { getTenantContextForProfile } from "@/server/tenancy";

export const dynamic = "force-dynamic";

type SearchResult = {
  type: "shipment" | "customer" | "driver" | "quote" | "tenant";
  id: string;
  title: string;
  subtitle: string;
  href: string;
};

function cleanSearch(value: string) {
  return value.trim().replace(/[,()]/g, " ").replace(/\s+/g, " ").slice(0, 80);
}

export async function GET(request: Request) {
  const limited = await enforceRateLimit(request, "admin-global-search", { limit: 90, windowSeconds: 60 });
  if (limited) return limited;

  const access = await requireRole(request, ["admin", "customer_care", "moderator", "finance", "warehouse"]);
  if (!access.profile) return apiError(access.error ?? "Staff access is required.", { status: access.status });

  const term = cleanSearch(new URL(request.url).searchParams.get("q") ?? "");
  if (term.length < 2) return NextResponse.json({ results: [] });

  const supabase = getSupabaseAdmin();
  if (!supabase) return apiError("Admin search is temporarily unavailable.", { status: 503 });

  try {
    const tenant = await getTenantContextForProfile(supabase, access.profile);
    const role = access.profile.role;
    const canSeeCustomers = ["admin", "customer_care", "moderator", "finance"].includes(role);
    const canSeeDrivers = ["admin", "warehouse"].includes(role);
    const canSeeQuotes = ["admin", "customer_care"].includes(role);
    const canSeeTenants = role === "admin";

    let shipmentsQuery = supabase
      .from("shipments")
      .select("id,tracking_id,customer_name,recipient_name,status,pickup_state,destination_state")
      .or(`tracking_id.ilike.%${term}%,customer_name.ilike.%${term}%,recipient_name.ilike.%${term}%`)
      .order("updated_at", { ascending: false })
      .limit(8);
    if (tenant.schemaReady && tenant.companyId) shipmentsQuery = shipmentsQuery.eq("company_id", tenant.companyId);

    let driversQuery = supabase
      .from("drivers")
      .select("id,name,phone,status,vehicle_type")
      .or(`name.ilike.%${term}%,phone.ilike.%${term}%`)
      .order("updated_at", { ascending: false })
      .limit(6);
    if (tenant.schemaReady && tenant.companyId) driversQuery = driversQuery.eq("company_id", tenant.companyId);

    let quotesQuery = supabase
      .from("quote_requests")
      .select("id,request_id,customer_name,customer_email,status")
      .or(`request_id.ilike.%${term}%,customer_name.ilike.%${term}%,customer_email.ilike.%${term}%`)
      .order("created_at", { ascending: false })
      .limit(6);
    if (tenant.schemaReady && tenant.companyId) quotesQuery = quotesQuery.eq("company_id", tenant.companyId);

    let customersQuery = supabase
      .from("user_profiles")
      .select("id,full_name,email,phone,role")
      .eq("role", "customer")
      .or(`full_name.ilike.%${term}%,email.ilike.%${term}%,phone.ilike.%${term}%`)
      .limit(6);
    if (tenant.schemaReady && tenant.companyId) customersQuery = customersQuery.eq("company_id", tenant.companyId);

    const [shipments, customers, drivers, quotes, tenants] = await Promise.all([
      shipmentsQuery,
      canSeeCustomers ? customersQuery : Promise.resolve({ data: [], error: null }),
      canSeeDrivers ? driversQuery : Promise.resolve({ data: [], error: null }),
      canSeeQuotes ? quotesQuery : Promise.resolve({ data: [], error: null }),
      canSeeTenants
        ? supabase.from("companies").select("id,name,slug,status,subscription_status").or(`name.ilike.%${term}%,slug.ilike.%${term}%`).limit(6)
        : Promise.resolve({ data: [], error: null })
    ]);

    const firstError = [shipments.error, customers.error, drivers.error, quotes.error, tenants.error].find(Boolean);
    if (firstError) throw firstError;

    const results: SearchResult[] = [
      ...(shipments.data ?? []).map((shipment) => ({
        type: "shipment" as const,
        id: String(shipment.id),
        title: shipment.tracking_id || `Shipment ${shipment.id}`,
        subtitle: `${shipment.customer_name || "Customer"} · ${shipment.status || "Pending"} · ${shipment.pickup_state || "Origin"} to ${shipment.destination_state || "Destination"}`,
        href: `/admin/shipments?tracking=${encodeURIComponent(shipment.tracking_id || String(shipment.id))}`
      })),
      ...(customers.data ?? []).map((customer) => ({
        type: "customer" as const,
        id: String(customer.id),
        title: customer.full_name || customer.email || "Customer",
        subtitle: customer.email || customer.phone || "Customer account",
        href: `/admin/customers?user=${encodeURIComponent(String(customer.id))}`
      })),
      ...(drivers.data ?? []).map((driver) => ({
        type: "driver" as const,
        id: String(driver.id),
        title: driver.name || `Driver ${driver.id}`,
        subtitle: `${driver.vehicle_type || "Vehicle not set"} · ${driver.status || "Offline"}`,
        href: `/admin/drivers?driver=${encodeURIComponent(String(driver.id))}`
      })),
      ...(quotes.data ?? []).map((quote) => ({
        type: "quote" as const,
        id: String(quote.id),
        title: quote.request_id || `Quote ${quote.id}`,
        subtitle: `${quote.customer_name || quote.customer_email || "Customer"} · ${quote.status || "Pending review"}`,
        href: `/admin/quotes?request=${encodeURIComponent(quote.request_id || String(quote.id))}`
      })),
      ...(tenants.data ?? []).map((company) => ({
        type: "tenant" as const,
        id: String(company.id),
        title: company.name || company.slug,
        subtitle: `${company.slug} · ${company.status || "unknown"} · ${company.subscription_status || "pending"}`,
        href: `/admin/cloud?company=${encodeURIComponent(String(company.id))}`
      }))
    ];

    return NextResponse.json({ results: results.slice(0, 24) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return handleApiError(error, request, "Unable to search Fly Logistics operations.");
  }
}
