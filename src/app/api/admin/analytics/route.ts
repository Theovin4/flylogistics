import { NextResponse } from "next/server";
import { requireRole } from "@/lib/request-auth";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { enforceRateLimit } from "@/server/api";
import { analyticsSnapshotKey, readAnalyticsSnapshot, writeAnalyticsSnapshot } from "@/server/analytics-cache";
import { logApiError, logWarn, requestContext } from "@/server/monitoring";
import { estimateShipmentEta } from "@/server/operations-intelligence";
import { timedOperation } from "@/server/performance";
import { getTenantContextForProfile } from "@/server/tenancy";

export const dynamic = "force-dynamic";

type ShipmentAnalyticsRow = {
  id: number | string;
  tracking_id?: string | null;
  status?: string | null;
  payment_status?: string | null;
  payment_provider?: string | null;
  payment_reference?: string | null;
  payment_amount?: number | string | null;
  quoted_price?: number | string | null;
  driver_id?: number | string | null;
  driver_payout_amount?: number | string | null;
  carrier_provider?: string | null;
  carrier_cost_amount?: number | string | null;
  carrier_rate_amount?: number | string | null;
  pickup_state?: string | null;
  destination_state?: string | null;
  pickup_address?: string | null;
  delivery_address?: string | null;
  delivery_category?: string | null;
  urgency?: string | null;
  vehicle_type?: string | null;
  timeline?: Array<{ label?: string; occurred_at?: string | null }> | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type QuoteAnalyticsRow = {
  id: number | string;
  status?: string | null;
  payment_status?: string | null;
  created_at?: string | null;
};

type DriverAnalyticsRow = {
  id: number | string;
  name?: string | null;
  status?: string | null;
  rating?: number | string | null;
};

type ShipmentEventAnalyticsRow = {
  id?: number | string;
  created_at?: string | null;
};

type WalletTransactionAnalyticsRow = {
  id?: number | string;
  transaction_type?: string | null;
  amount?: number | string | null;
  status?: string | null;
  payment_provider?: string | null;
  metadata?: Record<string, unknown> | null;
  created_at?: string | null;
};

type CustomerAnalyticsRow = {
  id?: string;
  user_id?: string;
  created_at?: string | null;
};

const analyticsPeriods = new Set(["today", "yesterday", "last7", "last30", "month", "previous_month", "year", "custom", "all"]);

function normalizeStatus(value: string | null | undefined, fallback = "UNKNOWN") {
  return (value?.trim() || fallback).toUpperCase();
}

function isPendingShipment(status: string | null | undefined) {
  return ["PENDING", "CONFIRMED", "DRIVER_ASSIGNED", "QUOTE_REQUESTED", "BOOKED", "ASSIGNED"].includes(normalizeStatus(status));
}

function isInTransitShipment(status: string | null | undefined) {
  return ["PICKED_UP", "IN_TRANSIT", "ARRIVED", "OUT_FOR_DELIVERY", "AT_HUB"].includes(normalizeStatus(status));
}

function isDeliveredShipment(status: string | null | undefined) {
  return normalizeStatus(status) === "DELIVERED";
}

function isActiveShipment(status: string | null | undefined) {
  return isPendingShipment(status) || isInTransitShipment(status);
}

function isFailedShipment(status: string | null | undefined) {
  return ["CANCELLED", "EXCEPTION", "FAILED"].includes(normalizeStatus(status));
}

function isActiveDriver(status: string | null | undefined) {
  const normalized = normalizeStatus(status, "AVAILABLE");
  return !["OFFLINE", "INACTIVE", "SUSPENDED"].includes(normalized);
}

function isInternalProvider(provider: string | null | undefined) {
  const normalized = String(provider ?? "internal_fly_logistics").trim().toLowerCase();
  return !normalized || ["internal_fly_logistics", "fly", "internal", "fly_logistics"].includes(normalized);
}

function isAdminCreatedShipment(shipment: ShipmentAnalyticsRow) {
  return (
    normalizeStatus(shipment.payment_provider, "") === "ADMIN" ||
    String(shipment.payment_reference ?? "").startsWith("FLY-ADMIN-SHIPMENT-")
  );
}

function increment(map: Map<string, number>, key: string, amount = 1) {
  map.set(key, (map.get(key) ?? 0) + amount);
}

function mapToChart(map: Map<string, number>) {
  return Array.from(map.entries())
    .map(([name, value]) => ({ name: name.replaceAll("_", " "), value }))
    .sort((a, b) => b.value - a.value);
}

function dayKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function parseDate(value: string | null) {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? new Date(timestamp) : null;
}

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function endOfDay(date: Date) {
  const next = startOfDay(date);
  next.setDate(next.getDate() + 1);
  return next;
}

function monthStart(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function nextMonthStart(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 1);
}

function analyticsRange(request: Request) {
  const url = new URL(request.url);
  const rawPeriod = url.searchParams.get("period") ?? "today";
  const period = analyticsPeriods.has(rawPeriod) ? rawPeriod : "today";
  const today = new Date();
  const customStart = parseDate(url.searchParams.get("startDate"));
  const customEnd = parseDate(url.searchParams.get("endDate"));

  if (period === "all") return { period, start: null, end: null };
  if (period === "custom" && customStart) {
    return {
      period,
      start: startOfDay(customStart),
      end: customEnd ? endOfDay(customEnd) : endOfDay(customStart)
    };
  }
  if (period === "yesterday") {
    const date = new Date(today);
    date.setDate(today.getDate() - 1);
    return { period, start: startOfDay(date), end: endOfDay(date) };
  }
  if (period === "last7") {
    const start = startOfDay(today);
    start.setDate(start.getDate() - 6);
    return { period, start, end: endOfDay(today) };
  }
  if (period === "last30") {
    const start = startOfDay(today);
    start.setDate(start.getDate() - 29);
    return { period, start, end: endOfDay(today) };
  }
  if (period === "month") return { period, start: monthStart(today), end: nextMonthStart(today) };
  if (period === "previous_month") {
    const previous = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    return { period, start: monthStart(previous), end: nextMonthStart(previous) };
  }
  if (period === "year") return { period, start: new Date(today.getFullYear(), 0, 1), end: new Date(today.getFullYear() + 1, 0, 1) };
  return { period: "today", start: startOfDay(today), end: endOfDay(today) };
}

function applyCreatedRange<T extends { created_at?: string | null }>(query: T[], start: Date | null, end: Date | null) {
  if (!start && !end) return query;
  const startTime = start?.getTime() ?? Number.NEGATIVE_INFINITY;
  const endTime = end?.getTime() ?? Number.POSITIVE_INFINITY;
  return query.filter((item) => {
    if (!item.created_at) return false;
    const timestamp = new Date(item.created_at).getTime();
    return Number.isFinite(timestamp) && timestamp >= startTime && timestamp < endTime;
  });
}

function trendBuckets(start: Date | null, end: Date | null) {
  const days = new Map<string, number>();
  const today = new Date();
  const rangeStart = start ? startOfDay(start) : (() => {
    const fallback = startOfDay(today);
    fallback.setDate(fallback.getDate() - 13);
    return fallback;
  })();
  const rangeEnd = end ? startOfDay(end) : endOfDay(today);
  const maxDays = 45;
  const totalDays = Math.max(1, Math.ceil((rangeEnd.getTime() - rangeStart.getTime()) / 86_400_000));
  const bucketCount = Math.min(totalDays, maxDays);
  const step = Math.max(1, Math.ceil(totalDays / bucketCount));
  const cursor = new Date(rangeStart);

  while (cursor < rangeEnd && days.size < maxDays) {
    days.set(dayKey(cursor), 0);
    cursor.setDate(cursor.getDate() + step);
  }

  if (days.size === 0) days.set(dayKey(today), 0);
  return { days, step };
}

function bucketKeyFor(date: Date, buckets: Map<string, number>) {
  let selected = Array.from(buckets.keys())[0] ?? dayKey(date);
  for (const key of buckets.keys()) {
    if (key <= dayKey(date)) selected = key;
  }
  return selected;
}

function quoteRequestsOverTime(quotes: QuoteAnalyticsRow[], start: Date | null, end: Date | null) {
  const { days } = trendBuckets(start, end);

  for (const quote of quotes) {
    if (!quote.created_at) continue;
    const key = bucketKeyFor(new Date(quote.created_at), days);
    if (days.has(key)) increment(days, key);
  }

  return Array.from(days.entries()).map(([date, value]) => ({
    date,
    label: new Date(`${date}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    value
  }));
}

function customersOverTime(customers: CustomerAnalyticsRow[], start: Date | null, end: Date | null) {
  const { days } = trendBuckets(start, end);
  for (const customer of customers) {
    if (!customer.created_at) continue;
    const key = bucketKeyFor(new Date(customer.created_at), days);
    if (days.has(key)) increment(days, key);
  }
  return Array.from(days.entries()).map(([date, value]) => ({
    date,
    label: new Date(`${date}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    value
  }));
}

function driverWorkload(shipments: ShipmentAnalyticsRow[], drivers: DriverAnalyticsRow[]) {
  const driverNames = new Map(drivers.map((driver) => [String(driver.id), driver.name || `Driver ${driver.id}`]));
  const workload = new Map<string, number>();

  for (const shipment of shipments) {
    if (isDeliveredShipment(shipment.status) || normalizeStatus(shipment.status) === "CANCELLED") continue;
    const driverId = shipment.driver_id ? String(shipment.driver_id) : "unassigned";
    increment(workload, driverNames.get(driverId) ?? "Unassigned");
  }

  return mapToChart(workload).slice(0, 8);
}

function numberValue(value: number | string | null | undefined) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function shipmentRevenue(shipment: ShipmentAnalyticsRow) {
  return numberValue(shipment.payment_amount ?? shipment.quoted_price);
}

function shipmentCarrierCost(shipment: ShipmentAnalyticsRow) {
  return numberValue(shipment.carrier_cost_amount ?? shipment.carrier_rate_amount);
}

function routeLabel(shipment: ShipmentAnalyticsRow) {
  const eta = estimateShipmentEta({
    pickupState: shipment.pickup_state,
    destinationState: shipment.destination_state,
    pickupAddress: shipment.pickup_address,
    deliveryAddress: shipment.delivery_address,
    deliveryCategory: shipment.delivery_category,
    urgency: shipment.urgency,
    vehicleType: shipment.vehicle_type
  });
  return `${eta.pickupStateName} -> ${eta.destinationStateName}`;
}

function routeDemand(shipments: ShipmentAnalyticsRow[]) {
  const routes = new Map<string, { name: string; value: number; revenue: number }>();
  for (const shipment of shipments) {
    const label = routeLabel(shipment);
    const current = routes.get(label) ?? { name: label, value: 0, revenue: 0 };
    current.value += 1;
    if (normalizeStatus(shipment.payment_status, "UNPAID") === "PAID") {
      current.revenue += numberValue(shipment.payment_amount ?? shipment.quoted_price);
    }
    routes.set(label, current);
  }
  return Array.from(routes.values()).sort((a, b) => b.value - a.value).slice(0, 8);
}

function operationalTrends(shipments: ShipmentAnalyticsRow[], start: Date | null, end: Date | null) {
  const buckets = trendBuckets(start, end).days;
  const days = new Map<string, { date: string; label: string; created: number; delivered: number; failed: number }>();
  for (const key of buckets.keys()) {
    days.set(key, {
      date: key,
      label: new Date(`${key}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      created: 0,
      delivered: 0,
      failed: 0
    });
  }

  for (const shipment of shipments) {
    if (!shipment.created_at) continue;
    const key = bucketKeyFor(new Date(shipment.created_at), buckets);
    const bucket = days.get(key);
    if (!bucket) continue;
    bucket.created += 1;
    if (isDeliveredShipment(shipment.status)) bucket.delivered += 1;
    if (isFailedShipment(shipment.status)) bucket.failed += 1;
  }

  return Array.from(days.values());
}

function timelineDate(shipment: ShipmentAnalyticsRow, needle: string) {
  const event = shipment.timeline?.find((item) => item.label?.toLowerCase().includes(needle));
  return event?.occurred_at ? new Date(event.occurred_at) : null;
}

function etaAccuracy(shipments: ShipmentAnalyticsRow[]) {
  const delivered = shipments.filter((shipment) => isDeliveredShipment(shipment.status));
  if (delivered.length === 0) return 0;

  let measurable = 0;
  let accurate = 0;
  for (const shipment of delivered) {
    const pickup = timelineDate(shipment, "picked up") ?? timelineDate(shipment, "driver accepted") ?? (shipment.created_at ? new Date(shipment.created_at) : null);
    const deliveredAt = timelineDate(shipment, "delivered") ?? (shipment.updated_at ? new Date(shipment.updated_at) : null);
    if (!pickup || !deliveredAt) continue;
    const actualHours = Math.max(0, (deliveredAt.getTime() - pickup.getTime()) / 36e5);
    const estimate = estimateShipmentEta({
      pickupState: shipment.pickup_state,
      destinationState: shipment.destination_state,
      pickupAddress: shipment.pickup_address,
      deliveryAddress: shipment.delivery_address,
      deliveryCategory: shipment.delivery_category,
      urgency: shipment.urgency,
      vehicleType: shipment.vehicle_type
    });
    measurable += 1;
    if (actualHours <= estimate.etaHours * 1.15) accurate += 1;
  }

  return measurable > 0 ? Math.round((accurate / measurable) * 100) : 90;
}

function driverPerformance(shipments: ShipmentAnalyticsRow[], drivers: DriverAnalyticsRow[]) {
  return drivers.map((driver) => {
    const assigned = shipments.filter((shipment) => String(shipment.driver_id ?? "") === String(driver.id));
    const active = assigned.filter((shipment) => isActiveShipment(shipment.status)).length;
    const completed = assigned.filter((shipment) => isDeliveredShipment(shipment.status)).length;
    const failed = assigned.filter((shipment) => isFailedShipment(shipment.status)).length;
    const closed = completed + failed;
    const successRate = closed > 0 ? Math.round((completed / closed) * 100) : 100;
    const rating = numberValue(driver.rating) || 4.8;
    const performanceScore = Math.round(successRate * 0.72 + (Math.min(5, rating) / 5) * 28);
    return {
      name: driver.name || `Driver ${driver.id}`,
      value: active,
      completed,
      failed,
      successRate,
      performanceScore
    };
  }).sort((a, b) => b.value - a.value || b.performanceScore - a.performanceScore).slice(0, 8);
}

export async function GET(request: Request) {
  const limited = await enforceRateLimit(request, "admin-analytics", { limit: 60, windowSeconds: 60 });
  if (limited) return limited;

  const access = await requireRole(request, ["admin"]);
  if (!access.profile) return NextResponse.json({ error: access.error }, { status: access.status });
  if (access.error) return NextResponse.json({ error: access.error }, { status: access.status });

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Analytics are temporarily unavailable." }, { status: 503 });
  const tenant = await getTenantContextForProfile(supabase, access.profile);
  const range = analyticsRange(request);
  const url = new URL(request.url);
  const statusFilter = normalizeStatus(url.searchParams.get("status"), "ALL");
  const paymentFilter = normalizeStatus(url.searchParams.get("paymentStatus"), "ALL");
  const deliveryCategoryFilter = url.searchParams.get("deliveryCategory")?.trim() ?? "all";
  const snapshotKey = analyticsSnapshotKey({
    deliveryCategory: deliveryCategoryFilter,
    endDate: range.end?.toISOString() ?? null,
    paymentStatus: paymentFilter,
    period: range.period,
    startDate: range.start?.toISOString() ?? null,
    status: statusFilter
  });

  const cachedSnapshot = await readAnalyticsSnapshot(supabase, {
    snapshotKey,
    companyId: tenant.schemaReady ? tenant.companyId : null
  });
  if (cachedSnapshot?.payload) {
    return NextResponse.json(
      {
        ...(cachedSnapshot.payload as Record<string, unknown>),
        cache: {
          source: "snapshot",
          generatedAt: cachedSnapshot.generatedAt,
          expiresAt: cachedSnapshot.expiresAt
        }
      },
      { headers: { "Cache-Control": "private, max-age=30" } }
    );
  }

  let shipmentsQuery = supabase.from("shipments").select("*").order("created_at", { ascending: false }).limit(2000);
  let quotesQuery = supabase.from("quote_requests").select("*").order("created_at", { ascending: false }).limit(2000);
  let driversQuery = supabase.from("drivers").select("*").order("id", { ascending: true }).limit(500);
  let shipmentEventsQuery = supabase.from("shipment_events").select("id,created_at").order("created_at", { ascending: false }).limit(500);
  let walletTransactionsQuery = supabase.from("wallet_transactions").select("id,transaction_type,amount,status,payment_provider,metadata,created_at").order("created_at", { ascending: false }).limit(500);
  const customersQuery = tenant.schemaReady && tenant.companyId
    ? supabase.from("company_members").select("user_id,created_at").eq("company_id", tenant.companyId).eq("role", "customer").order("created_at", { ascending: false }).limit(5000)
    : supabase.from("user_profiles").select("id,created_at").eq("role", "customer").order("created_at", { ascending: false }).limit(5000);

  if (tenant.schemaReady && tenant.companyId) {
    shipmentsQuery = shipmentsQuery.eq("company_id", tenant.companyId);
    quotesQuery = quotesQuery.eq("company_id", tenant.companyId);
    driversQuery = driversQuery.eq("company_id", tenant.companyId);
    shipmentEventsQuery = shipmentEventsQuery.eq("company_id", tenant.companyId);
    walletTransactionsQuery = walletTransactionsQuery.eq("company_id", tenant.companyId);
  }

  const [shipmentsResult, quotesResult, driversResult, shipmentEventsResult, walletTransactionsResult, customersResult] = await timedOperation(
    "admin.analytics.database",
    () =>
      Promise.all([
        shipmentsQuery,
        quotesQuery,
        driversQuery,
        shipmentEventsQuery,
        walletTransactionsQuery,
        customersQuery
      ]),
    requestContext(request, { companyId: tenant.companyId, period: range.period }),
    1200
  );

  if (shipmentsResult.error) {
    logApiError(shipmentsResult.error, "Unable to load shipment analytics.", requestContext(request));
    return NextResponse.json({ error: "Unable to load shipment analytics." }, { status: 500 });
  }

  if (quotesResult.error) {
    logApiError(quotesResult.error, "Unable to load quote analytics.", requestContext(request));
    return NextResponse.json({ error: "Unable to load quote analytics." }, { status: 500 });
  }

  if (driversResult.error) {
    logApiError(driversResult.error, "Unable to load driver analytics.", requestContext(request));
    return NextResponse.json({ error: "Unable to load driver analytics." }, { status: 500 });
  }

  if (shipmentEventsResult.error) {
    logWarn("Shipment events analytics unavailable.", requestContext(request, { reason: shipmentEventsResult.error.message }));
  }

  if (walletTransactionsResult.error && walletTransactionsResult.error.code !== "42P01") {
    logWarn("Wallet payment analytics unavailable.", requestContext(request, { reason: walletTransactionsResult.error.message }));
  }
  if (customersResult.error) {
    logWarn("Customer growth analytics unavailable.", requestContext(request, { reason: customersResult.error.message }));
  }

  let shipments = applyCreatedRange((shipmentsResult.data ?? []) as ShipmentAnalyticsRow[], range.start, range.end);
  let quotes = applyCreatedRange((quotesResult.data ?? []) as QuoteAnalyticsRow[], range.start, range.end);
  const drivers = (driversResult.data ?? []) as DriverAnalyticsRow[];
  const shipmentEvents = applyCreatedRange((shipmentEventsResult.error ? [] : shipmentEventsResult.data ?? []) as ShipmentEventAnalyticsRow[], range.start, range.end);
  const walletTransactions = applyCreatedRange((walletTransactionsResult.error ? [] : walletTransactionsResult.data ?? []) as WalletTransactionAnalyticsRow[], range.start, range.end);
  const allCustomers = (customersResult.error ? [] : customersResult.data ?? []) as CustomerAnalyticsRow[];
  const newCustomers = applyCreatedRange(allCustomers, range.start, range.end);

  if (statusFilter !== "ALL") {
    shipments = shipments.filter((shipment) => normalizeStatus(shipment.status) === statusFilter);
    quotes = quotes.filter((quote) => normalizeStatus(quote.status) === statusFilter);
  }
  if (paymentFilter !== "ALL") {
    shipments = shipments.filter((shipment) => normalizeStatus(shipment.payment_status, "UNPAID") === paymentFilter);
    quotes = quotes.filter((quote) => normalizeStatus(quote.payment_status, "UNPAID") === paymentFilter);
  }
  if (deliveryCategoryFilter !== "all") {
    shipments = shipments.filter((shipment) => String(shipment.delivery_category ?? "") === deliveryCategoryFilter);
  }
  const shipmentsByStatus = new Map<string, number>();
  const paymentsByStatus = new Map<string, number>();
  const paidRevenue = shipments
    .filter((shipment) => normalizeStatus(shipment.payment_status, "UNPAID") === "PAID")
    .reduce((sum, shipment) => sum + shipmentRevenue(shipment), 0);
  const walletFunding = walletTransactions
    .filter((item) => normalizeStatus(item.transaction_type) === "CREDIT" && ["COMPLETED", "PAID"].includes(normalizeStatus(item.status)))
    .reduce((sum, item) => sum + numberValue(item.amount), 0);
  const walletShipmentPayments = walletTransactions
    .filter((item) => normalizeStatus(item.transaction_type) === "DEBIT" && normalizeStatus(item.status) === "COMPLETED")
    .reduce((sum, item) => sum + numberValue(item.amount), 0);
  const merchantPayments = shipments
    .filter((shipment) => normalizeStatus(shipment.payment_status, "UNPAID") === "PAID" && normalizeStatus(shipment.payment_provider, "") !== "WALLET")
    .reduce((sum, shipment) => sum + shipmentRevenue(shipment), 0);
  const internalAdminShipments = shipments.filter((shipment) => isInternalProvider(shipment.carrier_provider) && isAdminCreatedShipment(shipment));
  const internalAdminRevenue = internalAdminShipments
    .filter((shipment) => normalizeStatus(shipment.payment_status, "UNPAID") === "PAID")
    .reduce((sum, shipment) => sum + shipmentRevenue(shipment), 0);
  const internalAdminDriverPayout = internalAdminShipments.reduce((sum, shipment) => sum + numberValue(shipment.driver_payout_amount), 0);
  const internalAdminCarrierCost = internalAdminShipments.reduce((sum, shipment) => sum + shipmentCarrierCost(shipment), 0);
  const deliveredShipments = shipments.filter((shipment) => isDeliveredShipment(shipment.status)).length;
  const failedShipments = shipments.filter((shipment) => isFailedShipment(shipment.status)).length;
  const closedShipments = deliveredShipments + failedShipments;

  for (const shipment of shipments) {
    increment(shipmentsByStatus, normalizeStatus(shipment.status));
    increment(paymentsByStatus, normalizeStatus(shipment.payment_status, "UNPAID"));
  }

  const metrics = {
    totalShipments: shipments.length,
    pendingShipments: shipments.filter((shipment) => isPendingShipment(shipment.status)).length,
    inTransitShipments: shipments.filter((shipment) => isInTransitShipment(shipment.status)).length,
    deliveredShipments,
    totalQuoteRequests: quotes.length,
    paidShipments: shipments.filter((shipment) => normalizeStatus(shipment.payment_status, "UNPAID") === "PAID").length,
    unpaidShipments: shipments.filter((shipment) => normalizeStatus(shipment.payment_status, "UNPAID") !== "PAID").length,
    activeDrivers: drivers.filter((driver) => isActiveDriver(driver.status)).length,
    shipmentEvents: shipmentEvents.length,
    revenue: Math.round(paidRevenue),
    walletFunding: Math.round(walletFunding),
    shipmentPayments: Math.round(paidRevenue + walletShipmentPayments),
    merchantPayments: Math.round(merchantPayments),
    paymentRevenueTotal: Math.round(paidRevenue + walletFunding),
    internalAdminShipments: internalAdminShipments.length,
    internalAdminRevenue: Math.round(internalAdminRevenue),
    internalAdminDriverPayout: Math.round(internalAdminDriverPayout),
    internalAdminCarrierCost: Math.round(internalAdminCarrierCost),
    internalAdminProfit: Math.round(internalAdminRevenue - internalAdminDriverPayout - internalAdminCarrierCost),
    totalDeliveries: deliveredShipments,
    failedDeliveries: failedShipments,
    deliverySuccessRate: closedShipments > 0 ? Math.round((deliveredShipments / closedShipments) * 100) : 100,
    etaAccuracy: etaAccuracy(shipments),
    totalCustomers: allCustomers.length,
    newCustomers: newCustomers.length
  };

  const responsePayload = {
    metrics,
    charts: {
      shipmentsByStatus: mapToChart(shipmentsByStatus),
      quoteRequestsOverTime: quoteRequestsOverTime(quotes, range.start, range.end),
      paymentsByStatus: mapToChart(paymentsByStatus),
      driverWorkload: driverWorkload(shipments, drivers),
      busiestRoutes: routeDemand(shipments),
      operationalTrends: operationalTrends(shipments, range.start, range.end),
      driverPerformance: driverPerformance(shipments, drivers),
      customerGrowth: customersOverTime(newCustomers, range.start, range.end)
    },
    filters: {
      period: range.period,
      startDate: range.start?.toISOString() ?? null,
      endDate: range.end?.toISOString() ?? null,
      status: statusFilter,
      paymentStatus: paymentFilter,
      deliveryCategory: deliveryCategoryFilter
    },
    generatedAt: new Date().toISOString()
  };

  await writeAnalyticsSnapshot(supabase, {
    snapshotKey,
    companyId: tenant.schemaReady ? tenant.companyId : null,
    payload: responsePayload,
    ttlSeconds: range.period === "today" ? 60 : 180
  });

  return NextResponse.json(responsePayload, { headers: { "Cache-Control": "private, max-age=30" } });
}
