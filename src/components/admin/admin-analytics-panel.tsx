"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import {
  AlertTriangle,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  CreditCard,
  PackageCheck,
  RefreshCw,
  Route,
  ShieldCheck,
  TrendingUp,
  Truck,
  Users
} from "lucide-react";
import { getSupabaseBrowser } from "@/lib/supabase";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { DashboardSectionHeader, DashboardStatCard } from "@/components/dashboard/dashboard-primitives";

type ChartPoint = {
  name?: string;
  label?: string;
  date?: string;
  value: number;
  revenue?: number;
  created?: number;
  delivered?: number;
  failed?: number;
  completed?: number;
  successRate?: number;
  performanceScore?: number;
};

type AdminAnalytics = {
  metrics: {
    totalShipments: number;
    pendingShipments: number;
    inTransitShipments: number;
    deliveredShipments: number;
    totalQuoteRequests: number;
    paidShipments: number;
    unpaidShipments: number;
    activeDrivers: number;
    shipmentEvents: number;
    revenue: number;
    walletFunding: number;
    shipmentPayments: number;
    merchantPayments: number;
    paymentRevenueTotal: number;
    internalAdminShipments: number;
    internalAdminRevenue: number;
    internalAdminDriverPayout: number;
    internalAdminCarrierCost: number;
    internalAdminProfit: number;
    totalDeliveries: number;
    failedDeliveries: number;
    deliverySuccessRate: number;
    etaAccuracy: number;
    totalCustomers: number;
    newCustomers: number;
  };
  charts: {
    shipmentsByStatus: ChartPoint[];
    quoteRequestsOverTime: ChartPoint[];
    paymentsByStatus: ChartPoint[];
    driverWorkload: ChartPoint[];
    busiestRoutes: ChartPoint[];
    operationalTrends: ChartPoint[];
    driverPerformance: ChartPoint[];
    customerGrowth: ChartPoint[];
  };
  filters?: {
    period: string;
    startDate: string | null;
    endDate: string | null;
    status: string;
    paymentStatus: string;
    deliveryCategory: string;
  };
  generatedAt: string;
};

const chartColors = ["#f97316", "#fb923c", "#22c55e", "#eab308", "#38bdf8", "#a78bfa", "#f43f5e", "#94a3b8"];
const analyticsPeriodOptions = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "last7", label: "Last 7 days" },
  { value: "last30", label: "Last 30 days" },
  { value: "month", label: "This month" },
  { value: "previous_month", label: "Previous month" },
  { value: "year", label: "This year" },
  { value: "all", label: "All time" },
  { value: "custom", label: "Custom" }
];
const analyticsStatusOptions = ["all", "PENDING", "PENDING_PICKUP", "CONFIRMED", "DRIVER_ASSIGNED", "PICKED_UP", "IN_TRANSIT", "ARRIVED", "DELIVERED", "CANCELLED"];
const analyticsPaymentOptions = ["all", "PAID", "UNPAID", "PENDING", "FAILED", "CANCELLED"];
const analyticsDeliveryTypeOptions = [
  { value: "all", label: "All delivery types" },
  { value: "local_nigeria", label: "Local Nigeria" },
  { value: "international_import", label: "International import" },
  { value: "international_export", label: "International export" }
];

function inputDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function todayInputDate() {
  return inputDate(new Date());
}

function formatLabel(value: string | undefined) {
  return (value ?? "Unknown").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function EmptyChart({ label }: { label: string }) {
  return (
    <div className="grid h-64 place-items-center rounded-md border bg-background/40 text-center text-sm text-muted-foreground">
      {label}
    </div>
  );
}

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value?: number; name?: string }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border bg-background/95 px-3 py-2 text-xs shadow-xl">
      <div className="font-semibold">{formatLabel(label)}</div>
      <div className="mt-1 text-muted-foreground">{payload[0].name ?? "Count"}: {payload[0].value ?? 0}</div>
    </div>
  );
}

function money(value: number | undefined) {
  return new Intl.NumberFormat("en-NG", { currency: "NGN", maximumFractionDigits: 0, style: "currency" }).format(value ?? 0);
}

export function AdminAnalyticsPanel() {
  const [analytics, setAnalytics] = useState<AdminAnalytics | null>(null);
  const [filters, setFilters] = useState({
    period: "today",
    startDate: todayInputDate(),
    endDate: todayInputDate(),
    status: "all",
    paymentStatus: "all",
    deliveryCategory: "all"
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const authHeaders = useCallback(async (): Promise<Record<string, string>> => {
    const supabase = getSupabaseBrowser();
    const { data } = supabase ? await supabase.auth.getSession() : { data: { session: null } };
    return data.session?.access_token ? { Authorization: `Bearer ${data.session.access_token}` } : {};
  }, []);

  const loadAnalytics = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const headers = new Headers();
      const auth = await authHeaders();
      Object.entries(auth).forEach(([key, value]) => headers.set(key, value));
      const params = new URLSearchParams({
        period: filters.period,
        status: filters.status,
        paymentStatus: filters.paymentStatus,
        deliveryCategory: filters.deliveryCategory
      });
      if (filters.period === "custom") {
        params.set("startDate", filters.startDate);
        params.set("endDate", filters.endDate);
      }
      const response = await fetch(`/api/admin/analytics?${params.toString()}`, { headers });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to load admin analytics.");
      setAnalytics(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load admin analytics.");
    } finally {
      setLoading(false);
    }
  }, [authHeaders, filters]);

  useEffect(() => {
    void loadAnalytics();
  }, [loadAnalytics]);

  const metricGroups = useMemo(() => {
    const metrics = analytics?.metrics;
    const activeDeliveries = Math.max(
      0,
      (metrics?.totalShipments ?? 0) - (metrics?.deliveredShipments ?? 0) - (metrics?.failedDeliveries ?? 0)
    );
    const deliveredLabel = filters.period === "today" ? "Delivered today" : "Delivered in view";

    return {
      top: [
        { label: "Total shipments", value: metrics?.totalShipments ?? 0, icon: PackageCheck, tone: "default" as const },
        { label: "Active deliveries", value: activeDeliveries, icon: Truck, tone: "default" as const },
        { label: deliveredLabel, value: metrics?.deliveredShipments ?? 0, icon: CheckCircle2, tone: "success" as const },
        { label: "Revenue", value: money(metrics?.revenue ?? 0), icon: CircleDollarSign, tone: "success" as const }
      ],
      secondary: [
        { label: "Pending assignments", value: metrics?.pendingShipments ?? 0, icon: Clock3, tone: "warning" as const, helper: "Needs dispatch attention" },
        { label: "Delayed shipments", value: metrics?.failedDeliveries ?? 0, icon: AlertTriangle, tone: "warning" as const, helper: "Exceptions in this view" },
        { label: "Failed carrier syncs", value: "Review", icon: Route, tone: "danger" as const, helper: "Open Integrations for details" },
        { label: "New quote requests", value: metrics?.totalQuoteRequests ?? 0, icon: CreditCard, tone: "default" as const, helper: "Quote demand in view" },
        { label: "New customers", value: metrics?.newCustomers ?? 0, icon: Users, tone: "success" as const, helper: `${metrics?.totalCustomers ?? 0} total registered` }
      ]
    };
  }, [analytics, filters.period]);

  const generatedAt = analytics?.generatedAt ? new Date(analytics.generatedAt).toLocaleString() : null;

  return (
    <section className="grid gap-6">
      <DashboardSectionHeader
        eyebrow="Live analytics"
        title="Operations intelligence"
        description="Today is shown by default. Use filters when you need to inspect another operating window."
        action={
          <div className="flex flex-col gap-2 sm:items-end">
            <Button type="button" variant="outline" onClick={loadAnalytics} disabled={loading} className="w-full sm:w-auto">
              <RefreshCw className={loading ? "animate-spin" : ""} />
              Refresh analytics
            </Button>
            {generatedAt && <span className="text-xs text-muted-foreground">Updated {generatedAt}</span>}
          </div>
        }
      />

      {error && (
        <div className="flex gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertTriangle className="size-4 shrink-0" />
          {error}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metricGroups.top.map((metric) => (
          <DashboardStatCard
            key={metric.label}
            label={metric.label}
            value={loading ? <Skeleton className="h-8 w-24" /> : metric.value}
            icon={metric.icon}
            tone={metric.tone}
            compact
          />
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metricGroups.secondary.map((metric) => (
          <DashboardStatCard
            key={metric.label}
            label={metric.label}
            value={loading ? <Skeleton className="h-8 w-20" /> : metric.value}
            icon={metric.icon}
            tone={metric.tone}
            helper={metric.helper}
            compact
          />
        ))}
      </div>

      <Card className="glass">
        <CardHeader>
          <CardTitle className="text-lg">Internal admin shipment finance</CardTitle>
          <p className="text-sm text-muted-foreground">
            Revenue, rider payout, and profit for Fly Logistics internal shipments created from the admin dashboard in the selected period.
          </p>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: "Internal revenue", value: money(analytics?.metrics.internalAdminRevenue), icon: CircleDollarSign, tone: "success" as const },
            { label: "Rider payout", value: money(analytics?.metrics.internalAdminDriverPayout), icon: Truck, tone: "warning" as const },
            { label: "Internal profit", value: money(analytics?.metrics.internalAdminProfit), icon: TrendingUp, tone: (analytics?.metrics.internalAdminProfit ?? 0) >= 0 ? "success" as const : "danger" as const },
            { label: "Internal jobs", value: analytics?.metrics.internalAdminShipments ?? 0, icon: PackageCheck, tone: "default" as const }
          ].map((metric) => (
            <DashboardStatCard
              key={metric.label}
              label={metric.label}
              value={loading ? <Skeleton className="h-8 w-24" /> : metric.value}
              icon={metric.icon}
              tone={metric.tone}
              compact
            />
          ))}
        </CardContent>
      </Card>

      <Card className="glass">
        <CardHeader>
          <CardTitle className="text-lg">Analytics filters</CardTitle>
          <p className="text-sm text-muted-foreground">
            Overview defaults to today. Change the period only when you want to inspect another operating window.
          </p>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          <div className="grid gap-1">
            <span className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Period</span>
            <select
              value={filters.period}
              onChange={(event) => setFilters((current) => ({ ...current, period: event.target.value }))}
              className="h-10 rounded-md border bg-background/70 px-3 text-sm"
            >
              {analyticsPeriodOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>
          <div className="grid gap-1">
            <span className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Status</span>
            <select
              value={filters.status}
              onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}
              className="h-10 rounded-md border bg-background/70 px-3 text-sm"
            >
              {analyticsStatusOptions.map((status) => (
                <option key={status} value={status}>{status === "all" ? "All statuses" : formatLabel(status)}</option>
              ))}
            </select>
          </div>
          <div className="grid gap-1">
            <span className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Payment</span>
            <select
              value={filters.paymentStatus}
              onChange={(event) => setFilters((current) => ({ ...current, paymentStatus: event.target.value }))}
              className="h-10 rounded-md border bg-background/70 px-3 text-sm"
            >
              {analyticsPaymentOptions.map((status) => (
                <option key={status} value={status}>{status === "all" ? "All payments" : formatLabel(status)}</option>
              ))}
            </select>
          </div>
          <div className="grid gap-1">
            <span className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Delivery type</span>
            <select
              value={filters.deliveryCategory}
              onChange={(event) => setFilters((current) => ({ ...current, deliveryCategory: event.target.value }))}
              className="h-10 rounded-md border bg-background/70 px-3 text-sm"
            >
              {analyticsDeliveryTypeOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>
          <div className="grid gap-1">
            <span className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">From</span>
            <input
              type="date"
              value={filters.startDate}
              disabled={filters.period !== "custom"}
              onChange={(event) => setFilters((current) => ({ ...current, startDate: event.target.value }))}
              className="h-10 rounded-md border bg-background/70 px-3 text-sm disabled:opacity-50"
            />
          </div>
          <div className="grid gap-1">
            <span className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">To</span>
            <input
              type="date"
              value={filters.endDate}
              disabled={filters.period !== "custom"}
              onChange={(event) => setFilters((current) => ({ ...current, endDate: event.target.value }))}
              className="h-10 rounded-md border bg-background/70 px-3 text-sm disabled:opacity-50"
            />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="glass">
          <CardHeader>
            <CardTitle>Shipments by status</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-64 w-full" />
            ) : analytics?.charts.shipmentsByStatus.length ? (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={analytics.charts.shipmentsByStatus}>
                    <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="name" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={16} />
                    <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
                    <Tooltip content={<ChartTooltip />} />
                    <Bar dataKey="value" radius={[6, 6, 0, 0]} fill="#f97316" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <EmptyChart label="No shipment data yet." />
            )}
          </CardContent>
        </Card>

        <Card className="glass">
          <CardHeader>
            <CardTitle>Quote requests over time</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-64 w-full" />
            ) : analytics?.charts.quoteRequestsOverTime.length ? (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={analytics.charts.quoteRequestsOverTime}>
                    <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="label" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={16} />
                    <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
                    <Tooltip content={<ChartTooltip />} />
                    <Area type="monotone" dataKey="value" stroke="#f97316" fill="#f97316" fillOpacity={0.22} strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <EmptyChart label="No quote request trend yet." />
            )}
          </CardContent>
        </Card>

        <Card className="glass">
          <CardHeader>
            <CardTitle>Payments by status</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-64 w-full" />
            ) : analytics?.charts.paymentsByStatus.length ? (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Tooltip content={<ChartTooltip />} />
                    <Pie
                      data={analytics.charts.paymentsByStatus}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={58}
                      outerRadius={92}
                      paddingAngle={4}
                    >
                      {analytics.charts.paymentsByStatus.map((entry, index) => (
                        <Cell key={entry.name ?? index} fill={chartColors[index % chartColors.length]} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <EmptyChart label="No payment data yet." />
            )}
            {!loading && analytics?.charts.paymentsByStatus.length ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {analytics.charts.paymentsByStatus.map((item, index) => (
                  <span key={item.name} className="inline-flex items-center gap-2 rounded-md border bg-background/40 px-2 py-1 text-xs">
                    <span className="size-2 rounded-full" style={{ backgroundColor: chartColors[index % chartColors.length] }} />
                    {formatLabel(item.name)}: {item.value}
                  </span>
                ))}
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card className="glass">
          <CardHeader>
            <CardTitle>Customer growth</CardTitle>
            <p className="text-sm text-muted-foreground">
              {analytics?.metrics.newCustomers ?? 0} joined in this period · {analytics?.metrics.totalCustomers ?? 0} registered customers
            </p>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-64 w-full" />
            ) : analytics?.charts.customerGrowth.length ? (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={analytics.charts.customerGrowth}>
                    <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="label" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={16} />
                    <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
                    <Tooltip content={<ChartTooltip />} />
                    <Area type="monotone" dataKey="value" stroke="#22c55e" fill="#22c55e" fillOpacity={0.2} strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <EmptyChart label="No customer registrations in this period." />
            )}
          </CardContent>
        </Card>

        <Card className="glass">
          <CardHeader>
            <CardTitle>Driver workload</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-64 w-full" />
            ) : analytics?.charts.driverWorkload.length ? (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={analytics.charts.driverWorkload} layout="vertical" margin={{ left: 8, right: 8 }}>
                    <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
                    <YAxis type="category" dataKey="name" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} tickLine={false} axisLine={false} width={82} />
                    <Tooltip content={<ChartTooltip />} />
                    <Bar dataKey="value" radius={[0, 6, 6, 0]} fill="#f97316" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <EmptyChart label="No active driver workload yet." />
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {[
          { label: "Revenue captured", value: money(analytics?.metrics.revenue), icon: CircleDollarSign, tone: "text-emerald-500" },
          { label: "Total deliveries", value: analytics?.metrics.totalDeliveries ?? 0, icon: PackageCheck, tone: "text-primary" },
          { label: "Success rate", value: `${analytics?.metrics.deliverySuccessRate ?? 100}%`, icon: ShieldCheck, tone: "text-emerald-500" },
          { label: "ETA accuracy", value: `${analytics?.metrics.etaAccuracy ?? 0}%`, icon: TrendingUp, tone: "text-sky-500" },
          { label: "Failed deliveries", value: analytics?.metrics.failedDeliveries ?? 0, icon: AlertTriangle, tone: "text-destructive" }
        ].map((metric) => (
          <Card key={metric.label} className="glass">
            <CardHeader className="flex-row items-center justify-between pb-3">
              <CardTitle className="text-sm text-muted-foreground">{metric.label}</CardTitle>
              <metric.icon className={`size-5 ${metric.tone}`} />
            </CardHeader>
            <CardContent>
              {loading ? <Skeleton className="h-8 w-24" /> : <div className="font-mono text-2xl font-black">{metric.value}</div>}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="glass xl:col-span-2">
          <CardHeader>
            <CardTitle>Operational trends</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-64 w-full" />
            ) : analytics?.charts.operationalTrends.length ? (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={analytics.charts.operationalTrends}>
                    <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="label" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={16} />
                    <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
                    <Tooltip content={<ChartTooltip />} />
                    <Area type="monotone" dataKey="created" name="Created" stroke="#f97316" fill="#f97316" fillOpacity={0.18} strokeWidth={2} />
                    <Area type="monotone" dataKey="delivered" name="Delivered" stroke="#22c55e" fill="#22c55e" fillOpacity={0.12} strokeWidth={2} />
                    <Area type="monotone" dataKey="failed" name="Failed" stroke="#ef4444" fill="#ef4444" fillOpacity={0.08} strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <EmptyChart label="No operational trend yet." />
            )}
          </CardContent>
        </Card>

        <Card className="glass">
          <CardHeader>
            <CardTitle>Busiest routes</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            {loading ? (
              <Skeleton className="h-64 w-full" />
            ) : analytics?.charts.busiestRoutes.length ? (
              analytics.charts.busiestRoutes.map((route) => (
                <div key={route.name} className="rounded-md border bg-background/45 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="min-w-0 truncate text-sm font-semibold">{route.name}</span>
                    <Badge>{route.value} jobs</Badge>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">Paid revenue: {money(route.revenue)}</p>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">No route demand yet.</p>
            )}
          </CardContent>
        </Card>

        <Card className="glass xl:col-span-3">
          <CardHeader>
            <CardTitle>Driver performance signals</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-64 w-full" />
            ) : analytics?.charts.driverPerformance.length ? (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={analytics.charts.driverPerformance}>
                    <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="name" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={16} />
                    <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
                    <Tooltip content={<ChartTooltip />} />
                    <Bar dataKey="value" name="Active" radius={[6, 6, 0, 0]} fill="#f97316" />
                    <Bar dataKey="completed" name="Completed" radius={[6, 6, 0, 0]} fill="#22c55e" />
                    <Bar dataKey="performanceScore" name="Performance" radius={[6, 6, 0, 0]} fill="#38bdf8" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <EmptyChart label="No driver performance data yet." />
            )}
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
