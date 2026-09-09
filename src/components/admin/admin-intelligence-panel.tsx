"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  Bot,
  BrainCircuit,
  Clock3,
  Fuel,
  Headphones,
  Loader2,
  RefreshCw,
  Route,
  Send,
  ShieldAlert,
  Sparkles,
  TrendingUp,
  Truck
} from "lucide-react";
import { getSupabaseBrowser } from "@/lib/supabase";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

type IntelligenceReport = {
  generatedAt: string;
  assistantBrief: string;
  metrics: {
    activeShipments: number;
    delayedShipments: number;
    overloadedDrivers: number;
    highRiskAlerts: number;
    codExposure: number;
    revenueAtRisk: number;
    openSupportTickets: number;
    averageEtaConfidence: number;
  };
  insights: Array<{ title: string; detail: string; severity: "info" | "warning" | "critical" }>;
  delayedShipments: Array<{ trackingId: string; status: string; route: string; ageHours: number; etaHours: number; driverId?: string | null }>;
  overloadedDrivers: Array<{ driverId: string; name: string; activeShipments: number; performanceScore: number }>;
  routeProfitability: Array<{ route: string; shipments: number; revenue: number; estimatedProfit: number; marginPercent: number; delayed: number; failed: number }>;
  routeOptimization: {
    clusters: Array<{ cluster: string; shipmentCount: number; urgencyMix: Array<{ label: string; value: number }>; recommendation: string }>;
    multiStopRecommendations: Array<{ route: string; shipmentIds: string[]; recommendedVehicle: string; fuelSavingPercent: number; note: string }>;
  };
  etaPredictions: Array<{ trackingId: string; route: string; currentStatus: string; predictedEtaHours: number; confidence: number; riskLevel: "low" | "medium" | "high"; reason: string }>;
  riskAlerts: Array<{ id: string; severity: "low" | "medium" | "high" | "critical"; category: string; title: string; message: string; entityId?: string }>;
  driverIntelligence: Array<{ driverId: string; name: string; activeShipments: number; completed: number; failed: number; acceptanceRate: number; deliverySuccessRate: number; efficiencyScore: number; reliability: string; signals: string[] }>;
  forecasting: {
    next7DayShipments: number;
    next30DayShipments: number;
    next7DayRevenue: number;
    next30DayRevenue: number;
    demandChangePercent: number;
    capacityStatus: "healthy" | "tight" | "overloaded";
    confidence: number;
    notes: string[];
  };
  fraudIntelligence: {
    riskScore: number;
    riskLevel: "low" | "medium" | "high" | "critical";
    signals: Array<{ id: string; severity: "low" | "medium" | "high" | "critical"; title: string; message: string; scoreImpact: number; entityId?: string }>;
    watchlist: Array<{ label: string; value: number; detail: string }>;
  };
  demandIntelligence: {
    topRoutes: Array<{ route: string; currentDemand: number; forecast7Day: number; trend: "up" | "flat" | "down" }>;
    stateDemand: Array<{ state: string; currentDemand: number; forecast7Day: number }>;
    capacityWarnings: Array<{ label: string; detail: string; severity: "info" | "warning" | "critical" }>;
  };
  actionPlan: Array<{ title: string; detail: string; owner: string; urgency: "low" | "medium" | "high" | "critical"; nextStep: string }>;
  forecastScenarios: Array<{ label: string; shipments7Day: number; revenue7Day: number; capacityStatus: "healthy" | "tight" | "overloaded"; note: string }>;
  fraudControls: Array<{ label: string; status: "healthy" | "watch" | "action"; detail: string }>;
  supportIntelligence: { open: number; urgent: number; stale: number; averageAgeHours: number; recommendation: string };
  driverPerformanceBands: Array<{ label: string; count: number; detail: string }>;
  revenueIntelligence: {
    profitableRoutes: Array<{ route: string; shipments: number; revenue: number; estimatedProfit: number; marginPercent: number }>;
    highDemandStates: Array<{ label: string; value: number }>;
    bottlenecks: Array<{ label: string; value: number; detail: string }>;
    growthInsights: string[];
  };
};

const moneyFormatter = new Intl.NumberFormat("en-NG", {
  currency: "NGN",
  maximumFractionDigits: 0,
  style: "currency"
});

function money(value: number) {
  return moneyFormatter.format(value ?? 0);
}

function severityClass(severity?: string) {
  if (severity === "critical" || severity === "high") return "border-destructive/40 bg-destructive/10 text-destructive";
  if (severity === "warning" || severity === "medium") return "border-primary/40 bg-primary/10 text-primary";
  return "border-emerald-500/40 bg-emerald-500/10 text-emerald-500";
}

function riskClass(risk?: string) {
  if (risk === "high") return "border-destructive/40 bg-destructive/10 text-destructive";
  if (risk === "medium") return "border-primary/40 bg-primary/10 text-primary";
  return "border-emerald-500/40 bg-emerald-500/10 text-emerald-500";
}

export function AdminIntelligencePanel() {
  const [report, setReport] = useState<IntelligenceReport | null>(null);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const authHeaders = useCallback(async () => {
    const supabase = getSupabaseBrowser();
    const { data } = supabase ? await supabase.auth.getSession() : { data: { session: null } };
    return data.session?.access_token ? { Authorization: `Bearer ${data.session.access_token}` } : {};
  }, []);

  const authorizedFetch = useCallback(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const headers = new Headers(init.headers);
    const auth = await authHeaders();
    Object.entries(auth).forEach(([key, value]) => headers.set(key, value));
    return fetch(input, { ...init, headers });
  }, [authHeaders]);

  const loadReport = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await authorizedFetch("/api/admin/intelligence");
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to load AI logistics intelligence.");
      setReport(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load AI logistics intelligence.");
    } finally {
      setLoading(false);
    }
  }, [authorizedFetch]);

  useEffect(() => {
    void loadReport();
  }, [loadReport]);

  async function askAssistant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!question.trim()) return;

    setAsking(true);
    setError(null);
    setAnswer(null);
    try {
      const response = await authorizedFetch("/api/admin/intelligence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to ask AI operations assistant.");
      setAnswer(data.answer);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to ask AI operations assistant.");
    } finally {
      setAsking(false);
    }
  }

  const generatedAt = report?.generatedAt ? new Date(report.generatedAt).toLocaleString() : null;

  return (
    <section className="mt-8 grid gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Badge className="border-primary/40 bg-primary/10 text-primary">AI intelligence</Badge>
          <h2 className="mt-3 text-2xl font-black tracking-normal sm:text-3xl">AI logistics intelligence center</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Predict delays, detect risk, cluster routes, score drivers, and surface revenue opportunities from live operations data.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:items-end">
          <Button type="button" variant="outline" onClick={loadReport} disabled={loading} className="w-full sm:w-auto">
            <RefreshCw className={loading ? "animate-spin" : ""} />
            Refresh intelligence
          </Button>
          {generatedAt && <span className="text-xs text-muted-foreground">Updated {generatedAt}</span>}
        </div>
      </div>

      {error && (
        <div className="flex gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          {error}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <Card className="glass">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bot className="size-5 text-primary" />
              AI operations assistant
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            {loading ? (
              <Skeleton className="h-24 w-full" />
            ) : (
              <div className="rounded-md border bg-background/45 p-4 text-sm leading-6 text-muted-foreground">
                {report?.assistantBrief ?? "No intelligence brief is available yet."}
              </div>
            )}
            <form className="grid gap-3 sm:grid-cols-[1fr_auto]" onSubmit={askAssistant}>
              <Input
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                placeholder="Ask about delays, COD risk, driver load, profitable routes..."
              />
              <Button type="submit" disabled={asking || !question.trim()}>
                {asking ? <Loader2 className="animate-spin" /> : <Send />}
                Ask
              </Button>
            </form>
            {answer && (
              <div className="rounded-md border border-primary/25 bg-primary/10 p-4 text-sm leading-6">
                {answer}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
          {[
            { label: "Active shipments", value: report?.metrics.activeShipments ?? 0, icon: Truck },
            { label: "Delayed shipments", value: report?.metrics.delayedShipments ?? 0, icon: Clock3 },
            { label: "High risk alerts", value: report?.metrics.highRiskAlerts ?? 0, icon: ShieldAlert },
            { label: "COD exposure", value: money(report?.metrics.codExposure ?? 0), icon: TrendingUp }
          ].map((metric) => (
            <Card key={metric.label} className="glass">
              <CardContent className="flex items-center justify-between gap-3 p-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{metric.label}</p>
                  {loading ? <Skeleton className="mt-2 h-7 w-24" /> : <p className="mt-2 font-mono text-2xl font-black">{metric.value}</p>}
                </div>
                <metric.icon className="size-5 text-primary" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <Card className="glass">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="size-5 text-primary" />
              AI action board
            </CardTitle>
            <p className="text-sm text-muted-foreground">Priority operating moves for dispatch, support, finance, operations, and growth.</p>
          </CardHeader>
          <CardContent className="grid gap-3">
            {loading ? <Skeleton className="h-56 w-full" /> : (report?.actionPlan ?? []).map((action) => (
              <div key={`${action.owner}-${action.title}`} className="rounded-md border bg-background/45 p-4 text-sm">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{action.title}</span>
                      <Badge className={severityClass(action.urgency)}>{action.urgency}</Badge>
                      <Badge>{action.owner.replaceAll("_", " ")}</Badge>
                    </div>
                    <p className="mt-2 leading-6 text-muted-foreground">{action.detail}</p>
                  </div>
                </div>
                <div className="mt-3 rounded-md border border-primary/25 bg-primary/10 p-3 text-muted-foreground">
                  <span className="font-semibold text-foreground">Next step: </span>{action.nextStep}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="glass">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Headphones className="size-5 text-primary" />
              Support SLA intelligence
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm">
            {loading ? <Skeleton className="h-56 w-full" /> : (
              <>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                  <div className="rounded-md border bg-background/45 p-3">
                    <span className="block text-xs uppercase tracking-[0.16em] text-muted-foreground">Open conversations</span>
                    <span className="mt-2 block text-2xl font-black">{report?.supportIntelligence.open ?? 0}</span>
                  </div>
                  <div className="rounded-md border bg-background/45 p-3">
                    <span className="block text-xs uppercase tracking-[0.16em] text-muted-foreground">Average age</span>
                    <span className="mt-2 block text-2xl font-black">{report?.supportIntelligence.averageAgeHours ?? 0}h</span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge className={severityClass((report?.supportIntelligence.urgent ?? 0) > 0 ? "high" : "info")}>{report?.supportIntelligence.urgent ?? 0} urgent</Badge>
                  <Badge className={severityClass((report?.supportIntelligence.stale ?? 0) > 0 ? "warning" : "info")}>{report?.supportIntelligence.stale ?? 0} stale</Badge>
                </div>
                <p className="rounded-md border bg-background/45 p-3 leading-6 text-muted-foreground">{report?.supportIntelligence.recommendation}</p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="glass">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="size-5 text-primary" />
              Demand forecast
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm">
            {loading ? <Skeleton className="h-44 w-full" /> : (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-md border bg-background/45 p-3">
                    <span className="block text-xs uppercase tracking-[0.16em] text-muted-foreground">Next 7 days</span>
                    <span className="mt-2 block text-2xl font-black">{report?.forecasting.next7DayShipments ?? 0}</span>
                    <span className="text-xs text-muted-foreground">{money(report?.forecasting.next7DayRevenue ?? 0)} projected</span>
                  </div>
                  <div className="rounded-md border bg-background/45 p-3">
                    <span className="block text-xs uppercase tracking-[0.16em] text-muted-foreground">Next 30 days</span>
                    <span className="mt-2 block text-2xl font-black">{report?.forecasting.next30DayShipments ?? 0}</span>
                    <span className="text-xs text-muted-foreground">{money(report?.forecasting.next30DayRevenue ?? 0)} projected</span>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className={riskClass(report?.forecasting.capacityStatus === "overloaded" ? "high" : report?.forecasting.capacityStatus === "tight" ? "medium" : "low")}>
                    {report?.forecasting.capacityStatus ?? "healthy"} capacity
                  </Badge>
                  <Badge>{report?.forecasting.confidence ?? 0}% confidence</Badge>
                  <Badge>{report?.forecasting.demandChangePercent ?? 0}% demand change</Badge>
                </div>
                {(report?.forecasting.notes ?? []).slice(0, 3).map((note) => (
                  <p key={note} className="rounded-md border bg-background/45 p-3 leading-6 text-muted-foreground">{note}</p>
                ))}
                <div className="grid gap-2">
                  {(report?.forecastScenarios ?? []).map((scenario) => (
                    <div key={scenario.label} className="rounded-md border bg-background/45 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-semibold">{scenario.label}</span>
                        <Badge className={riskClass(scenario.capacityStatus === "overloaded" ? "high" : scenario.capacityStatus === "tight" ? "medium" : "low")}>
                          {scenario.capacityStatus}
                        </Badge>
                      </div>
                      <p className="mt-1 text-muted-foreground">{scenario.shipments7Day} shipments - {money(scenario.revenue7Day)} projected</p>
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="glass">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldAlert className="size-5 text-primary" />
              Fraud risk score
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm">
            {loading ? <Skeleton className="h-44 w-full" /> : (
              <>
                <div className="rounded-md border bg-background/45 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Current score</span>
                    <Badge className={severityClass(report?.fraudIntelligence.riskLevel)}>{report?.fraudIntelligence.riskLevel ?? "low"}</Badge>
                  </div>
                  <div className="mt-3 text-4xl font-black">{report?.fraudIntelligence.riskScore ?? 0}<span className="text-lg text-muted-foreground">/100</span></div>
                </div>
                {(report?.fraudIntelligence.signals ?? []).slice(0, 3).map((signal) => (
                  <div key={signal.id} className="rounded-md border bg-background/45 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{signal.title}</span>
                      <Badge className={severityClass(signal.severity)}>{signal.severity}</Badge>
                    </div>
                    <p className="mt-1 leading-6 text-muted-foreground">{signal.message}</p>
                  </div>
                ))}
                {(report?.fraudIntelligence.signals ?? []).length === 0 && <p className="rounded-md border p-3 text-muted-foreground">No fraud or anomaly signal is currently above threshold.</p>}
                <div className="grid gap-2">
                  {(report?.fraudControls ?? []).map((control) => (
                    <div key={control.label} className="rounded-md border bg-background/45 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-semibold">{control.label}</span>
                        <Badge className={severityClass(control.status === "action" ? "high" : control.status === "watch" ? "warning" : "info")}>{control.status}</Badge>
                      </div>
                      <p className="mt-1 leading-6 text-muted-foreground">{control.detail}</p>
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="glass">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Route className="size-5 text-primary" />
              Demand lanes
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm">
            {loading ? <Skeleton className="h-44 w-full" /> : (
              <>
                {(report?.demandIntelligence.topRoutes ?? []).slice(0, 4).map((lane) => (
                  <div key={lane.route} className="rounded-md border bg-background/45 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-semibold">{lane.route}</span>
                      <Badge>{lane.trend}</Badge>
                    </div>
                    <p className="mt-1 text-muted-foreground">{lane.forecast7Day} forecast shipments in 7 days - {lane.currentDemand} current demand</p>
                  </div>
                ))}
                {(report?.demandIntelligence.capacityWarnings ?? []).slice(0, 2).map((warning) => (
                  <div key={warning.label} className="rounded-md border border-primary/30 bg-primary/10 p-3">
                    <div className="font-semibold">{warning.label}</div>
                    <p className="mt-1 leading-6 text-muted-foreground">{warning.detail}</p>
                  </div>
                ))}
                {(report?.demandIntelligence.topRoutes ?? []).length === 0 && <p className="rounded-md border p-3 text-muted-foreground">Demand lanes will appear as shipments are created.</p>}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="glass">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BrainCircuit className="size-5 text-primary" />
              Operational insights
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            {loading ? <Skeleton className="h-48 w-full" /> : report?.insights.map((insight) => (
              <div key={insight.title} className="rounded-md border bg-background/45 p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{insight.title}</span>
                  <Badge className={severityClass(insight.severity)}>{insight.severity}</Badge>
                </div>
                <p className="mt-2 leading-6 text-muted-foreground">{insight.detail}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="glass">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldAlert className="size-5 text-primary" />
              Fraud and risk detection
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            {loading ? <Skeleton className="h-48 w-full" /> : report?.riskAlerts.length ? report.riskAlerts.slice(0, 6).map((risk) => (
              <div key={risk.id} className="rounded-md border bg-background/45 p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{risk.title}</span>
                  <Badge className={severityClass(risk.severity)}>{risk.severity}</Badge>
                  <Badge>{risk.category}</Badge>
                </div>
                <p className="mt-2 leading-6 text-muted-foreground">{risk.message}</p>
              </div>
            )) : <p className="text-sm text-muted-foreground">No major fraud or risk signals right now.</p>}
          </CardContent>
        </Card>

        <Card className="glass">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Route className="size-5 text-primary" />
              Predictive ETA
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            {loading ? <Skeleton className="h-48 w-full" /> : report?.etaPredictions.length ? report.etaPredictions.slice(0, 6).map((prediction) => (
              <div key={prediction.trackingId} className="rounded-md border bg-background/45 p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono font-semibold">{prediction.trackingId}</span>
                  <Badge className={riskClass(prediction.riskLevel)}>{prediction.riskLevel} risk</Badge>
                  <Badge>{prediction.confidence}%</Badge>
                </div>
                <p className="mt-2 text-muted-foreground">{prediction.route} - {prediction.predictedEtaHours}h predicted ETA</p>
              </div>
            )) : <p className="text-sm text-muted-foreground">No active ETA predictions yet.</p>}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="glass">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Fuel className="size-5 text-primary" />
              Route optimization
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            {loading ? <Skeleton className="h-60 w-full" /> : report?.routeOptimization.multiStopRecommendations.length ? report.routeOptimization.multiStopRecommendations.map((item) => (
              <div key={item.route} className="rounded-md border bg-background/45 p-4 text-sm">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="font-semibold">{item.route}</div>
                    <p className="mt-1 text-muted-foreground">{item.note}</p>
                  </div>
                  <Badge className="border-emerald-500/40 bg-emerald-500/10 text-emerald-500">{item.fuelSavingPercent}% fuel opportunity</Badge>
                </div>
                <p className="mt-3 text-xs text-muted-foreground">{item.recommendedVehicle} - {item.shipmentIds.join(", ")}</p>
              </div>
            )) : <p className="text-sm text-muted-foreground">No multi-stop clustering opportunity yet.</p>}
          </CardContent>
        </Card>

        <Card className="glass">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Truck className="size-5 text-primary" />
              Driver intelligence
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            {loading ? <Skeleton className="h-60 w-full" /> : (
              <>
                <div className="grid gap-2 sm:grid-cols-2">
                  {(report?.driverPerformanceBands ?? []).map((band) => (
                    <div key={band.label} className="rounded-md border bg-background/45 p-3 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold">{band.label}</span>
                        <Badge>{band.count}</Badge>
                      </div>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">{band.detail}</p>
                    </div>
                  ))}
                </div>
                {report?.driverIntelligence.length ? report.driverIntelligence.slice(0, 6).map((driver) => (
                  <div key={driver.driverId} className="rounded-md border bg-background/45 p-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold">{driver.name}</span>
                      <Badge className={riskClass(driver.reliability === "risk" ? "high" : driver.reliability === "watch" ? "medium" : "low")}>{driver.reliability}</Badge>
                    </div>
                    <div className="mt-3 grid gap-2 sm:grid-cols-3">
                      <span className="rounded-md border bg-background/50 p-2">{driver.efficiencyScore}% efficiency</span>
                      <span className="rounded-md border bg-background/50 p-2">{driver.acceptanceRate}% acceptance</span>
                      <span className="rounded-md border bg-background/50 p-2">{driver.activeShipments} active</span>
                    </div>
                  </div>
                )) : <p className="text-sm text-muted-foreground">No driver intelligence available yet.</p>}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="glass">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="size-5 text-primary" />
            Revenue intelligence
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 lg:grid-cols-3">
          <div className="grid gap-3">
            <h3 className="text-sm font-semibold">Profitable routes</h3>
            {loading ? <Skeleton className="h-40 w-full" /> : report?.revenueIntelligence.profitableRoutes.slice(0, 5).map((route) => (
              <div key={route.route} className="rounded-md border bg-background/45 p-3 text-sm">
                <div className="font-semibold">{route.route}</div>
                <p className="mt-1 text-muted-foreground">{money(route.estimatedProfit)} estimated profit - {route.marginPercent}% margin</p>
              </div>
            ))}
          </div>
          <div className="grid gap-3">
            <h3 className="text-sm font-semibold">High-demand states</h3>
            {loading ? <Skeleton className="h-40 w-full" /> : report?.revenueIntelligence.highDemandStates.slice(0, 5).map((state) => (
              <div key={state.label} className="flex items-center justify-between rounded-md border bg-background/45 p-3 text-sm">
                <span>{state.label}</span>
                <Badge>{state.value}</Badge>
              </div>
            ))}
          </div>
          <div className="grid gap-3">
            <h3 className="text-sm font-semibold">Growth notes</h3>
            {loading ? <Skeleton className="h-40 w-full" /> : report?.revenueIntelligence.growthInsights.map((item) => (
              <p key={item} className="rounded-md border bg-background/45 p-3 text-sm leading-6 text-muted-foreground">{item}</p>
            ))}
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
