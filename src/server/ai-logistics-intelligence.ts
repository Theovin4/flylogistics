import { estimateShipmentEta } from "@/server/operations-intelligence";

export type IntelligenceShipmentRow = {
  id: number | string;
  tracking_id?: string | null;
  status?: string | null;
  payment_status?: string | null;
  payment_amount?: number | string | null;
  quoted_price?: number | string | null;
  driver_id?: number | string | null;
  customer_name?: string | null;
  customer_email?: string | null;
  pickup_state?: string | null;
  destination_state?: string | null;
  pickup_address?: string | null;
  delivery_address?: string | null;
  delivery_category?: string | null;
  urgency?: string | null;
  vehicle_type?: string | null;
  eta_hours?: number | string | null;
  eta_confidence?: number | string | null;
  route_distance_km?: number | string | null;
  cod_amount?: number | string | null;
  cod_status?: string | null;
  proof_image_url?: string | null;
  failed_reason?: string | null;
  current_lat?: number | null;
  current_lng?: number | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type IntelligenceDriverRow = {
  id: number | string;
  name?: string | null;
  status?: string | null;
  rating?: number | string | null;
  acceptance_rate?: number | string | null;
  delivery_success_rate?: number | string | null;
  performance_score?: number | string | null;
  completed_deliveries?: number | string | null;
  failed_deliveries?: number | string | null;
  accepted_assignments?: number | string | null;
  rejected_assignments?: number | string | null;
  latitude?: number | null;
  longitude?: number | null;
};

export type IntelligenceQuoteRow = {
  id: number | string;
  pickup_state?: string | null;
  destination_state?: string | null;
  estimated_price?: number | string | null;
  status?: string | null;
  created_at?: string | null;
};

export type IntelligenceSupportTicketRow = {
  id?: number | string;
  ticket_id?: string | null;
  status?: string | null;
  priority?: string | null;
  ticket_type?: string | null;
  tracking_id?: string | null;
  created_at?: string | null;
};

type ChartPoint = {
  label: string;
  value: number;
};

type RouteProfitability = {
  route: string;
  shipments: number;
  revenue: number;
  estimatedCost: number;
  estimatedProfit: number;
  marginPercent: number;
  delayed: number;
  failed: number;
};

type RiskAlert = {
  id: string;
  severity: "low" | "medium" | "high" | "critical";
  category: "cod" | "delivery" | "driver" | "customer" | "route" | "support";
  title: string;
  message: string;
  entityType?: string;
  entityId?: string;
};

type EtaPrediction = {
  trackingId: string;
  route: string;
  currentStatus: string;
  predictedEtaHours: number;
  confidence: number;
  riskLevel: "low" | "medium" | "high";
  reason: string;
};

type DriverIntelligence = {
  driverId: string;
  name: string;
  activeShipments: number;
  completed: number;
  failed: number;
  acceptanceRate: number;
  deliverySuccessRate: number;
  efficiencyScore: number;
  reliability: "excellent" | "stable" | "watch" | "risk";
  signals: string[];
};

type ForecastingIntelligence = {
  next7DayShipments: number;
  next30DayShipments: number;
  next7DayRevenue: number;
  next30DayRevenue: number;
  demandChangePercent: number;
  capacityStatus: "healthy" | "tight" | "overloaded";
  confidence: number;
  notes: string[];
};

type FraudSignal = {
  id: string;
  severity: "low" | "medium" | "high" | "critical";
  title: string;
  message: string;
  scoreImpact: number;
  entityType?: string;
  entityId?: string;
};

type FraudIntelligence = {
  riskScore: number;
  riskLevel: "low" | "medium" | "high" | "critical";
  signals: FraudSignal[];
  watchlist: Array<{ label: string; value: number; detail: string }>;
};

type DemandIntelligence = {
  topRoutes: Array<{ route: string; currentDemand: number; forecast7Day: number; trend: "up" | "flat" | "down" }>;
  stateDemand: Array<{ state: string; currentDemand: number; forecast7Day: number }>;
  capacityWarnings: Array<{ label: string; detail: string; severity: "info" | "warning" | "critical" }>;
};

type IntelligenceAction = {
  title: string;
  detail: string;
  owner: "dispatch" | "customer_care" | "finance" | "operations" | "growth";
  urgency: "low" | "medium" | "high" | "critical";
  nextStep: string;
};

export type LogisticsIntelligenceReport = {
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
  routeProfitability: RouteProfitability[];
  deliveryTrends: Array<{ date: string; label: string; created: number; delivered: number; failed: number }>;
  routeOptimization: {
    clusters: Array<{ cluster: string; shipmentCount: number; urgencyMix: ChartPoint[]; recommendation: string }>;
    multiStopRecommendations: Array<{ route: string; shipmentIds: string[]; recommendedVehicle: string; fuelSavingPercent: number; note: string }>;
  };
  etaPredictions: EtaPrediction[];
  riskAlerts: RiskAlert[];
  driverIntelligence: DriverIntelligence[];
  forecasting: ForecastingIntelligence;
  fraudIntelligence: FraudIntelligence;
  demandIntelligence: DemandIntelligence;
  actionPlan: IntelligenceAction[];
  forecastScenarios: Array<{ label: string; shipments7Day: number; revenue7Day: number; capacityStatus: ForecastingIntelligence["capacityStatus"]; note: string }>;
  fraudControls: Array<{ label: string; status: "healthy" | "watch" | "action"; detail: string }>;
  supportIntelligence: { open: number; urgent: number; stale: number; averageAgeHours: number; recommendation: string };
  driverPerformanceBands: Array<{ label: string; count: number; detail: string }>;
  revenueIntelligence: {
    profitableRoutes: RouteProfitability[];
    highDemandStates: ChartPoint[];
    bottlenecks: Array<{ label: string; value: number; detail: string }>;
    growthInsights: string[];
  };
};

function numberValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeStatus(value: unknown, fallback = "UNKNOWN") {
  return String(value ?? fallback).trim().toUpperCase();
}

function isActiveShipment(status: unknown) {
  return ["PENDING", "CONFIRMED", "DRIVER_ASSIGNED", "PICKED_UP", "IN_TRANSIT", "ARRIVED", "BOOKED", "ASSIGNED", "OUT_FOR_DELIVERY"].includes(normalizeStatus(status));
}

function isDelivered(status: unknown) {
  return normalizeStatus(status) === "DELIVERED";
}

function isFailed(status: unknown) {
  return ["CANCELLED", "FAILED", "EXCEPTION"].includes(normalizeStatus(status));
}

function dateValue(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function hoursSince(value?: string | null) {
  const date = dateValue(value);
  if (!date) return 0;
  return Math.max(0, Math.round((Date.now() - date.getTime()) / 36e5));
}

function dayKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function increment(map: Map<string, number>, key: string, amount = 1) {
  map.set(key, (map.get(key) ?? 0) + amount);
}

function groupCountToChart(map: Map<string, number>) {
  return Array.from(map.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
}

function routeEstimate(shipment: IntelligenceShipmentRow) {
  return estimateShipmentEta({
    pickupState: shipment.pickup_state,
    destinationState: shipment.destination_state,
    pickupAddress: shipment.pickup_address,
    deliveryAddress: shipment.delivery_address,
    deliveryCategory: shipment.delivery_category,
    urgency: shipment.urgency,
    vehicleType: shipment.vehicle_type,
    currentLat: shipment.current_lat,
    currentLng: shipment.current_lng
  });
}

function routeLabel(shipment: IntelligenceShipmentRow) {
  const estimate = routeEstimate(shipment);
  return `${estimate.pickupStateName} -> ${estimate.destinationStateName}`;
}

function trackingId(shipment: IntelligenceShipmentRow) {
  return shipment.tracking_id ?? `Shipment ${shipment.id}`;
}

function moneyValue(shipment: IntelligenceShipmentRow) {
  return numberValue(shipment.payment_amount ?? shipment.quoted_price);
}

function activeByDriver(shipments: IntelligenceShipmentRow[]) {
  const map = new Map<string, number>();
  for (const shipment of shipments) {
    if (!shipment.driver_id || !isActiveShipment(shipment.status)) continue;
    increment(map, String(shipment.driver_id));
  }
  return map;
}

function buildDeliveryTrends(shipments: IntelligenceShipmentRow[]) {
  const days = new Map<string, { date: string; label: string; created: number; delivered: number; failed: number }>();
  const today = new Date();
  for (let index = 13; index >= 0; index -= 1) {
    const date = new Date(today);
    date.setDate(today.getDate() - index);
    const key = dayKey(date);
    days.set(key, {
      date: key,
      label: new Date(`${key}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      created: 0,
      delivered: 0,
      failed: 0
    });
  }

  for (const shipment of shipments) {
    const created = dateValue(shipment.created_at);
    if (!created) continue;
    const bucket = days.get(dayKey(created));
    if (!bucket) continue;
    bucket.created += 1;
    if (isDelivered(shipment.status)) bucket.delivered += 1;
    if (isFailed(shipment.status)) bucket.failed += 1;
  }

  return Array.from(days.values());
}

function buildRouteProfitability(shipments: IntelligenceShipmentRow[]) {
  const routes = new Map<string, RouteProfitability>();

  for (const shipment of shipments) {
    const route = routeLabel(shipment);
    const estimate = routeEstimate(shipment);
    const current = routes.get(route) ?? {
      route,
      shipments: 0,
      revenue: 0,
      estimatedCost: 0,
      estimatedProfit: 0,
      marginPercent: 0,
      delayed: 0,
      failed: 0
    };
    const revenue = moneyValue(shipment);
    const distance = numberValue(shipment.route_distance_km) || estimate.distanceKm;
    const estimatedCost = Math.round(distance * 145 + (String(shipment.vehicle_type ?? "").toLowerCase().includes("truck") ? 8000 : 1800));
    current.shipments += 1;
    current.revenue += revenue;
    current.estimatedCost += estimatedCost;
    if (isFailed(shipment.status)) current.failed += 1;
    if (isActiveShipment(shipment.status) && hoursSince(shipment.created_at) > (numberValue(shipment.eta_hours) || estimate.etaHours) * 1.15) current.delayed += 1;
    routes.set(route, current);
  }

  return Array.from(routes.values())
    .map((route) => ({
      ...route,
      estimatedProfit: Math.round(route.revenue - route.estimatedCost),
      marginPercent: route.revenue > 0 ? Math.round(((route.revenue - route.estimatedCost) / route.revenue) * 100) : 0
    }))
    .sort((a, b) => b.estimatedProfit - a.estimatedProfit);
}

function buildDelayedShipments(shipments: IntelligenceShipmentRow[]) {
  return shipments
    .filter((shipment) => isActiveShipment(shipment.status))
    .map((shipment) => {
      const estimate = routeEstimate(shipment);
      const etaHours = numberValue(shipment.eta_hours) || estimate.etaHours;
      const ageHours = hoursSince(shipment.created_at);
      return {
        trackingId: trackingId(shipment),
        status: normalizeStatus(shipment.status),
        route: routeLabel(shipment),
        ageHours,
        etaHours,
        driverId: shipment.driver_id ? String(shipment.driver_id) : null
      };
    })
    .filter((shipment) => shipment.ageHours > Math.max(8, shipment.etaHours * 1.15))
    .sort((a, b) => b.ageHours - a.ageHours)
    .slice(0, 12);
}

function buildOverloadedDrivers(shipments: IntelligenceShipmentRow[], drivers: IntelligenceDriverRow[]) {
  const active = activeByDriver(shipments);
  return drivers
    .map((driver) => ({
      driverId: String(driver.id),
      name: driver.name ?? `Driver ${driver.id}`,
      activeShipments: active.get(String(driver.id)) ?? 0,
      performanceScore: numberValue(driver.performance_score) || 95
    }))
    .filter((driver) => driver.activeShipments >= 3 || driver.performanceScore < 70)
    .sort((a, b) => b.activeShipments - a.activeShipments || a.performanceScore - b.performanceScore)
    .slice(0, 10);
}

function buildRouteOptimization(shipments: IntelligenceShipmentRow[]) {
  const activeShipments = shipments.filter((shipment) => isActiveShipment(shipment.status));
  const clusterMap = new Map<string, IntelligenceShipmentRow[]>();
  for (const shipment of activeShipments) {
    const key = routeLabel(shipment);
    const current = clusterMap.get(key) ?? [];
    current.push(shipment);
    clusterMap.set(key, current);
  }

  const clusters = Array.from(clusterMap.entries())
    .map(([cluster, items]) => {
      const urgencyMix = new Map<string, number>();
      for (const item of items) increment(urgencyMix, normalizeStatus(item.urgency, "STANDARD"));
      return {
        cluster,
        shipmentCount: items.length,
        urgencyMix: groupCountToChart(urgencyMix),
        recommendation: items.length >= 3
          ? "Batch these shipments into a planned multi-stop route to reduce dead mileage."
          : "Keep as direct route unless driver capacity changes."
      };
    })
    .sort((a, b) => b.shipmentCount - a.shipmentCount)
    .slice(0, 8);

  const multiStopRecommendations = Array.from(clusterMap.entries())
    .filter(([, items]) => items.length >= 2)
    .map(([route, items]) => {
      const urgent = items.some((item) => normalizeStatus(item.urgency, "STANDARD") === "CRITICAL");
      return {
        route,
        shipmentIds: items.slice(0, 6).map(trackingId),
        recommendedVehicle: urgent ? "Express car or dedicated bike" : items.length >= 4 ? "Cargo van" : "Dispatch bike",
        fuelSavingPercent: Math.min(28, 8 + items.length * 4),
        note: urgent ? "Separate critical drops first, then cluster remaining stops." : "Cluster by nearest delivery area before dispatch."
      };
    })
    .sort((a, b) => b.fuelSavingPercent - a.fuelSavingPercent)
    .slice(0, 6);

  return { clusters, multiStopRecommendations };
}

function driverMap(drivers: IntelligenceDriverRow[]) {
  return new Map(drivers.map((driver) => [String(driver.id), driver]));
}

function buildEtaPredictions(shipments: IntelligenceShipmentRow[], drivers: IntelligenceDriverRow[]) {
  const driversById = driverMap(drivers);
  return shipments
    .filter((shipment) => isActiveShipment(shipment.status))
    .slice(0, 30)
    .map((shipment) => {
      const estimate = routeEstimate(shipment);
      const driver = shipment.driver_id ? driversById.get(String(shipment.driver_id)) : null;
      const performanceScore = numberValue(driver?.performance_score) || numberValue(driver?.delivery_success_rate) || 90;
      const driverFactor = performanceScore < 65 ? 1.28 : performanceScore < 80 ? 1.12 : performanceScore > 95 ? 0.92 : 1;
      const urgency = normalizeStatus(shipment.urgency, "STANDARD");
      const urgencyFactor = urgency === "CRITICAL" ? 0.82 : urgency === "PRIORITY" ? 0.92 : 1;
      const predictedEtaHours = Math.max(1, Math.round(estimate.etaHours * driverFactor * urgencyFactor));
      const ageHours = hoursSince(shipment.created_at);
      const riskLevel: EtaPrediction["riskLevel"] = ageHours > predictedEtaHours ? "high" : estimate.confidence < 86 ? "medium" : "low";
      return {
        trackingId: trackingId(shipment),
        route: routeLabel(shipment),
        currentStatus: normalizeStatus(shipment.status),
        predictedEtaHours,
        confidence: Math.max(55, Math.min(98, estimate.confidence + Math.round((performanceScore - 85) / 4))),
        riskLevel,
        reason: `${estimate.routeSummary} Driver performance factor ${Math.round(driverFactor * 100)}%.`
      };
    })
    .sort((a, b) => (a.riskLevel === "high" ? -1 : 1) - (b.riskLevel === "high" ? -1 : 1))
    .slice(0, 12);
}

function buildRiskAlerts(
  shipments: IntelligenceShipmentRow[],
  drivers: IntelligenceDriverRow[],
  supportTickets: IntelligenceSupportTicketRow[],
  delayedShipments: ReturnType<typeof buildDelayedShipments>
) {
  const alerts: RiskAlert[] = [];
  const failedByCustomer = new Map<string, number>();
  const failedByDriver = new Map<string, number>();

  for (const shipment of shipments) {
    const id = trackingId(shipment);
    const codAmount = numberValue(shipment.cod_amount);
    const codStatus = normalizeStatus(shipment.cod_status, "NOT_APPLICABLE");
    if (codAmount > 0 && isDelivered(shipment.status) && !["REMITTED", "NOT_APPLICABLE"].includes(codStatus)) {
      alerts.push({
        id: `cod-${id}`,
        severity: codAmount > 100000 ? "critical" : "high",
        category: "cod",
        title: "COD remittance risk",
        message: `${id} is delivered with COD still marked ${codStatus}.`,
        entityType: "shipment",
        entityId: id
      });
    }
    if (isDelivered(shipment.status) && !shipment.proof_image_url) {
      alerts.push({
        id: `proof-${id}`,
        severity: "medium",
        category: "delivery",
        title: "Delivered without proof image",
        message: `${id} is delivered but proof media is missing.`,
        entityType: "shipment",
        entityId: id
      });
    }
    if (isFailed(shipment.status)) {
      if (shipment.customer_email) increment(failedByCustomer, shipment.customer_email.toLowerCase());
      if (shipment.driver_id) increment(failedByDriver, String(shipment.driver_id));
    }
  }

  for (const [email, count] of failedByCustomer.entries()) {
    if (count >= 2) {
      alerts.push({
        id: `customer-fail-${email}`,
        severity: count >= 4 ? "high" : "medium",
        category: "customer",
        title: "Repeated failed deliveries",
        message: `${email} has ${count} failed or cancelled deliveries.`,
        entityType: "customer",
        entityId: email
      });
    }
  }

  const driversById = driverMap(drivers);
  for (const [driverId, count] of failedByDriver.entries()) {
    if (count >= 2) {
      alerts.push({
        id: `driver-fail-${driverId}`,
        severity: count >= 4 ? "high" : "medium",
        category: "driver",
        title: "Driver failure pattern",
        message: `${driversById.get(driverId)?.name ?? `Driver ${driverId}`} has ${count} failed or cancelled deliveries.`,
        entityType: "driver",
        entityId: driverId
      });
    }
  }

  for (const delayed of delayedShipments.slice(0, 5)) {
    alerts.push({
      id: `delay-${delayed.trackingId}`,
      severity: delayed.ageHours > delayed.etaHours * 2 ? "high" : "medium",
      category: "route",
      title: "Delayed shipment",
      message: `${delayed.trackingId} has been active for ${delayed.ageHours}h against ${delayed.etaHours}h ETA.`,
      entityType: "shipment",
      entityId: delayed.trackingId
    });
  }

  for (const ticket of supportTickets) {
    if (normalizeStatus(ticket.priority, "NORMAL") === "URGENT" && !["RESOLVED", "CLOSED"].includes(normalizeStatus(ticket.status, "OPEN"))) {
      alerts.push({
        id: `support-${ticket.ticket_id ?? ticket.id}`,
        severity: "medium",
        category: "support",
        title: "Urgent support case",
        message: `${ticket.ticket_id ?? "Support ticket"} needs customer care review.`,
        entityType: "support_ticket",
        entityId: ticket.ticket_id ?? String(ticket.id ?? "")
      });
    }
  }

  return alerts.sort((a, b) => severityRank(b.severity) - severityRank(a.severity)).slice(0, 20);
}

function severityRank(severity: RiskAlert["severity"]) {
  return { low: 1, medium: 2, high: 3, critical: 4 }[severity];
}

function buildDriverIntelligence(shipments: IntelligenceShipmentRow[], drivers: IntelligenceDriverRow[]) {
  const active = activeByDriver(shipments);
  return drivers
    .map((driver) => {
      const driverShipments = shipments.filter((shipment) => String(shipment.driver_id ?? "") === String(driver.id));
      const completed = driverShipments.filter((shipment) => isDelivered(shipment.status)).length || numberValue(driver.completed_deliveries);
      const failed = driverShipments.filter((shipment) => isFailed(shipment.status)).length || numberValue(driver.failed_deliveries);
      const closed = completed + failed;
      const deliverySuccessRate = closed > 0 ? Math.round((completed / closed) * 100) : numberValue(driver.delivery_success_rate) || 100;
      const accepted = numberValue(driver.accepted_assignments);
      const rejected = numberValue(driver.rejected_assignments);
      const acceptanceRate = accepted + rejected > 0 ? Math.round((accepted / (accepted + rejected)) * 100) : numberValue(driver.acceptance_rate) || 100;
      const rating = numberValue(driver.rating) || 4.8;
      const efficiencyScore = Math.round(deliverySuccessRate * 0.45 + acceptanceRate * 0.3 + Math.min(5, rating) * 5);
      const reliability: DriverIntelligence["reliability"] = efficiencyScore >= 92 ? "excellent" : efficiencyScore >= 80 ? "stable" : efficiencyScore >= 68 ? "watch" : "risk";
      return {
        driverId: String(driver.id),
        name: driver.name ?? `Driver ${driver.id}`,
        activeShipments: active.get(String(driver.id)) ?? 0,
        completed,
        failed,
        acceptanceRate,
        deliverySuccessRate,
        efficiencyScore,
        reliability,
        signals: [
          `${acceptanceRate}% acceptance`,
          `${deliverySuccessRate}% delivery success`,
          `${active.get(String(driver.id)) ?? 0} active deliveries`,
          `Rating ${rating.toFixed(1)}`
        ]
      };
    })
    .sort((a, b) => a.efficiencyScore - b.efficiencyScore)
    .slice(0, 12);
}

function buildRevenueIntelligence(shipments: IntelligenceShipmentRow[], routeProfitability: RouteProfitability[], delayedShipments: ReturnType<typeof buildDelayedShipments>) {
  const demand = new Map<string, number>();
  const failedRoutes = new Map<string, number>();
  for (const shipment of shipments) {
    const estimate = routeEstimate(shipment);
    increment(demand, estimate.destinationStateName);
    if (isFailed(shipment.status)) increment(failedRoutes, routeLabel(shipment));
  }

  const highDemandStates = groupCountToChart(demand).slice(0, 8);
  const bottlenecks = [
    ...delayedShipments.slice(0, 5).map((shipment) => ({
      label: shipment.route,
      value: shipment.ageHours,
      detail: `${shipment.trackingId} is beyond ETA by operations clock.`
    })),
    ...groupCountToChart(failedRoutes).slice(0, 5).map((route) => ({
      label: route.label,
      value: route.value,
      detail: `${route.value} failed or cancelled deliveries on this route.`
    }))
  ].slice(0, 8);

  const profitableRoutes = routeProfitability.filter((route) => route.estimatedProfit > 0).slice(0, 8);
  const growthInsights = [
    highDemandStates[0] ? `${highDemandStates[0].label} is the strongest demand destination in current records.` : "Demand will sharpen as more shipments are created.",
    profitableRoutes[0] ? `${profitableRoutes[0].route} is currently the strongest estimated-profit route.` : "Route profitability needs paid shipment data to become more precise.",
    bottlenecks[0] ? `Primary bottleneck: ${bottlenecks[0].label}.` : "No major operational bottleneck detected right now."
  ];

  return { profitableRoutes, highDemandStates, bottlenecks, growthInsights };
}

function averageEtaConfidence(shipments: IntelligenceShipmentRow[]) {
  const values = shipments.map((shipment) => numberValue(shipment.eta_confidence)).filter(Boolean);
  if (!values.length) return 0;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function daysAgo(days: number) {
  return Date.now() - days * 24 * 60 * 60 * 1000;
}

function isAfter(value: string | null | undefined, timestamp: number) {
  const date = dateValue(value);
  return Boolean(date && date.getTime() >= timestamp);
}

function buildForecastingIntelligence(
  shipments: IntelligenceShipmentRow[],
  quotes: IntelligenceQuoteRow[],
  drivers: IntelligenceDriverRow[]
): ForecastingIntelligence {
  const last7 = shipments.filter((shipment) => isAfter(shipment.created_at, daysAgo(7)));
  const prior7 = shipments.filter((shipment) => {
    const date = dateValue(shipment.created_at);
    return Boolean(date && date.getTime() >= daysAgo(14) && date.getTime() < daysAgo(7));
  });
  const recentQuotes = quotes.filter((quote) => isAfter(quote.created_at, daysAgo(7)));
  const paidRevenue7 = last7.reduce((sum, shipment) => sum + moneyValue(shipment), 0);
  const pendingQuoteDemand = recentQuotes.filter((quote) => !["DECLINED", "EXPIRED", "CONVERTED_TO_SHIPMENT"].includes(normalizeStatus(quote.status, "PENDING"))).length;
  const averageDailyShipments = Math.max(0.25, last7.length / 7);
  const demandChangePercent = prior7.length
    ? Math.round(((last7.length - prior7.length) / prior7.length) * 100)
    : last7.length > 0
      ? 100
      : 0;
  const demandFactor = demandChangePercent > 30 ? 1.18 : demandChangePercent < -20 ? 0.88 : 1;
  const next7DayShipments = Math.max(0, Math.round(averageDailyShipments * 7 * demandFactor + pendingQuoteDemand * 0.35));
  const next30DayShipments = Math.max(next7DayShipments, Math.round(next7DayShipments * 4.25));
  const averageShipmentRevenue = last7.length ? paidRevenue7 / last7.length : shipments.length ? shipments.reduce((sum, shipment) => sum + moneyValue(shipment), 0) / shipments.length : 0;
  const activeShipments = shipments.filter((shipment) => isActiveShipment(shipment.status)).length;
  const availableDrivers = Math.max(1, drivers.filter((driver) => ["ONLINE", "AVAILABLE", "ACTIVE", "APPROVED"].includes(normalizeStatus(driver.status, "ACTIVE"))).length || drivers.length || 1);
  const loadRatio = activeShipments / availableDrivers;
  const capacityStatus: ForecastingIntelligence["capacityStatus"] = loadRatio >= 4 ? "overloaded" : loadRatio >= 2.25 ? "tight" : "healthy";
  const confidence = Math.max(58, Math.min(94, 62 + Math.min(20, shipments.length / 10) + Math.min(12, quotes.length / 20) - (capacityStatus === "overloaded" ? 8 : 0)));

  return {
    next7DayShipments,
    next30DayShipments,
    next7DayRevenue: Math.round(next7DayShipments * averageShipmentRevenue),
    next30DayRevenue: Math.round(next30DayShipments * averageShipmentRevenue),
    demandChangePercent,
    capacityStatus,
    confidence: Math.round(confidence),
    notes: [
      `${last7.length} shipment${last7.length === 1 ? "" : "s"} were created in the last 7 days.`,
      `${pendingQuoteDemand} recent quote request${pendingQuoteDemand === 1 ? "" : "s"} can convert into paid shipment demand.`,
      `Current operating load is ${loadRatio.toFixed(1)} active shipment${activeShipments === 1 ? "" : "s"} per available driver.`
    ]
  };
}

function buildFraudIntelligence(shipments: IntelligenceShipmentRow[], riskAlerts: RiskAlert[]): FraudIntelligence {
  const signals: FraudSignal[] = [];
  const codOpen = shipments.filter((shipment) => numberValue(shipment.cod_amount) > 0 && !["REMITTED", "NOT_APPLICABLE"].includes(normalizeStatus(shipment.cod_status, "PENDING")));
  const highValueNoProof = shipments.filter((shipment) => isDelivered(shipment.status) && moneyValue(shipment) >= 50000 && !shipment.proof_image_url);
  const repeatedFailedCustomers = new Map<string, number>();

  for (const shipment of shipments) {
    if (isFailed(shipment.status) && shipment.customer_email) increment(repeatedFailedCustomers, shipment.customer_email.toLowerCase());
  }

  if (codOpen.length) {
    signals.push({
      id: "cod-open-exposure",
      severity: codOpen.length > 5 ? "critical" : "high",
      title: "Open COD exposure",
      message: `${codOpen.length} COD shipment${codOpen.length === 1 ? "" : "s"} need remittance review.`,
      scoreImpact: Math.min(28, codOpen.length * 5),
      entityType: "shipment"
    });
  }

  if (highValueNoProof.length) {
    signals.push({
      id: "high-value-proof-gap",
      severity: highValueNoProof.length > 3 ? "high" : "medium",
      title: "High-value proof gap",
      message: `${highValueNoProof.length} delivered high-value shipment${highValueNoProof.length === 1 ? "" : "s"} are missing proof media.`,
      scoreImpact: Math.min(20, highValueNoProof.length * 4),
      entityType: "shipment"
    });
  }

  for (const [email, count] of repeatedFailedCustomers.entries()) {
    if (count >= 2) {
      signals.push({
        id: `repeat-failure-${email}`,
        severity: count >= 4 ? "high" : "medium",
        title: "Repeated delivery failure pattern",
        message: `${email} has ${count} failed or cancelled deliveries.`,
        scoreImpact: Math.min(18, count * 4),
        entityType: "customer",
        entityId: email
      });
    }
  }

  for (const alert of riskAlerts.filter((item) => ["critical", "high"].includes(item.severity)).slice(0, 5)) {
    signals.push({
      id: `risk-alert-${alert.id}`,
      severity: alert.severity,
      title: alert.title,
      message: alert.message,
      scoreImpact: alert.severity === "critical" ? 14 : 9,
      entityType: alert.entityType,
      entityId: alert.entityId
    });
  }

  const riskScore = Math.min(100, signals.reduce((sum, signal) => sum + signal.scoreImpact, 0));
  const riskLevel: FraudIntelligence["riskLevel"] = riskScore >= 75 ? "critical" : riskScore >= 50 ? "high" : riskScore >= 25 ? "medium" : "low";
  return {
    riskScore,
    riskLevel,
    signals: signals.slice(0, 10),
    watchlist: [
      { label: "COD open", value: codOpen.length, detail: "COD shipments not marked remitted." },
      { label: "High-value proof gaps", value: highValueNoProof.length, detail: "Delivered high-value shipments without proof media." },
      { label: "Repeated failed customers", value: Array.from(repeatedFailedCustomers.values()).filter((count) => count >= 2).length, detail: "Customer accounts with repeated failed deliveries." }
    ]
  };
}

function buildDemandIntelligence(shipments: IntelligenceShipmentRow[], forecasting: ForecastingIntelligence, drivers: IntelligenceDriverRow[]): DemandIntelligence {
  const routeDemand = new Map<string, number>();
  const stateDemand = new Map<string, number>();
  const recent = shipments.filter((shipment) => isAfter(shipment.created_at, daysAgo(30)));
  for (const shipment of recent) {
    increment(routeDemand, routeLabel(shipment));
    increment(stateDemand, routeEstimate(shipment).destinationStateName);
  }

  const topRoutes = groupCountToChart(routeDemand).slice(0, 8).map((route) => ({
    route: route.label,
    currentDemand: route.value,
    forecast7Day: Math.max(1, Math.round((route.value / Math.max(1, recent.length)) * forecasting.next7DayShipments)),
    trend: forecasting.demandChangePercent > 15 ? "up" as const : forecasting.demandChangePercent < -15 ? "down" as const : "flat" as const
  }));

  const activeShipments = shipments.filter((shipment) => isActiveShipment(shipment.status)).length;
  const availableDrivers = drivers.filter((driver) => ["ONLINE", "AVAILABLE", "ACTIVE", "APPROVED"].includes(normalizeStatus(driver.status, "ACTIVE"))).length || drivers.length;
  const capacityWarnings: DemandIntelligence["capacityWarnings"] = [];
  if (forecasting.capacityStatus !== "healthy") {
    capacityWarnings.push({
      label: "Driver capacity",
      detail: `${activeShipments} active shipments are being balanced across ${Math.max(1, availableDrivers)} available driver records.`,
      severity: forecasting.capacityStatus === "overloaded" ? "critical" : "warning"
    });
  }
  if (topRoutes[0]?.forecast7Day >= 5) {
    capacityWarnings.push({
      label: "Route pressure",
      detail: `${topRoutes[0].route} is forecast to carry ${topRoutes[0].forecast7Day} shipments in the next 7 days.`,
      severity: "warning"
    });
  }

  return {
    topRoutes,
    stateDemand: groupCountToChart(stateDemand).slice(0, 8).map((state) => ({
      state: state.label,
      currentDemand: state.value,
      forecast7Day: Math.max(1, Math.round((state.value / Math.max(1, recent.length)) * forecasting.next7DayShipments))
    })),
    capacityWarnings
  };
}

function buildForecastScenarios(forecasting: ForecastingIntelligence): LogisticsIntelligenceReport["forecastScenarios"] {
  const conservativeShipments = Math.max(0, Math.round(forecasting.next7DayShipments * 0.82));
  const expectedShipments = forecasting.next7DayShipments;
  const stretchShipments = Math.max(expectedShipments, Math.round(forecasting.next7DayShipments * 1.22));
  const averageRevenue = forecasting.next7DayShipments ? forecasting.next7DayRevenue / forecasting.next7DayShipments : 0;

  return [
    {
      label: "Conservative",
      shipments7Day: conservativeShipments,
      revenue7Day: Math.round(conservativeShipments * averageRevenue),
      capacityStatus: forecasting.capacityStatus === "overloaded" ? "tight" : "healthy",
      note: "Use this if quote conversion or repeat demand slows down."
    },
    {
      label: "Expected",
      shipments7Day: expectedShipments,
      revenue7Day: forecasting.next7DayRevenue,
      capacityStatus: forecasting.capacityStatus,
      note: "Current operating forecast based on recent shipments, quote demand, and driver capacity."
    },
    {
      label: "Surge",
      shipments7Day: stretchShipments,
      revenue7Day: Math.round(stretchShipments * averageRevenue),
      capacityStatus: stretchShipments > expectedShipments * 1.15 && forecasting.capacityStatus !== "healthy" ? "overloaded" : "tight",
      note: "Use this if paid bookings increase or one high-demand lane spikes."
    }
  ];
}

function buildFraudControls(fraudIntelligence: FraudIntelligence): LogisticsIntelligenceReport["fraudControls"] {
  return [
    {
      label: "COD reconciliation",
      status: fraudIntelligence.watchlist.find((item) => item.label === "COD open")?.value ? "action" as const : "healthy" as const,
      detail: "Review open COD shipments and confirm remittance before payout reconciliation."
    },
    {
      label: "Proof validation",
      status: fraudIntelligence.watchlist.find((item) => item.label === "High-value proof gaps")?.value ? "action" as const : "healthy" as const,
      detail: "Flag delivered high-value shipments missing proof media for operations review."
    },
    {
      label: "Customer failure pattern",
      status: fraudIntelligence.watchlist.find((item) => item.label === "Repeated failed customers")?.value ? "watch" as const : "healthy" as const,
      detail: "Watch customers with repeated failed or cancelled deliveries before accepting high-risk orders."
    }
  ];
}

function buildSupportIntelligence(supportTickets: IntelligenceSupportTicketRow[]): LogisticsIntelligenceReport["supportIntelligence"] {
  const open = supportTickets.filter((ticket) => !["RESOLVED", "CLOSED", "REFUNDED"].includes(normalizeStatus(ticket.status, "OPEN")));
  const urgent = open.filter((ticket) => normalizeStatus(ticket.priority, "NORMAL") === "URGENT");
  const ages = open.map((ticket) => hoursSince(ticket.created_at)).filter((age) => age > 0);
  const stale = open.filter((ticket) => hoursSince(ticket.created_at) >= 2).length;
  const averageAgeHours = ages.length ? Math.round(ages.reduce((sum, age) => sum + age, 0) / ages.length) : 0;
  const recommendation = urgent.length
    ? "Move urgent conversations to the top of customer care and reply before new non-urgent tickets."
    : stale
      ? "Clear older open tickets first to protect support trust and delivery confidence."
      : "Support queue is healthy. Keep replies fast and close resolved conversations.";

  return { open: open.length, urgent: urgent.length, stale, averageAgeHours, recommendation };
}

function buildDriverPerformanceBands(driverIntelligence: DriverIntelligence[]): LogisticsIntelligenceReport["driverPerformanceBands"] {
  const excellent = driverIntelligence.filter((driver) => driver.reliability === "excellent").length;
  const stable = driverIntelligence.filter((driver) => driver.reliability === "stable").length;
  const watch = driverIntelligence.filter((driver) => driver.reliability === "watch").length;
  const risk = driverIntelligence.filter((driver) => driver.reliability === "risk").length;

  return [
    { label: "Excellent", count: excellent, detail: "Best candidates for urgent or high-value deliveries." },
    { label: "Stable", count: stable, detail: "Reliable daily capacity for standard active routes." },
    { label: "Watch", count: watch, detail: "Review acceptance, delays, or active workload before assigning." },
    { label: "Risk", count: risk, detail: "Avoid critical assignments until performance improves." }
  ];
}

function buildActionPlan(report: Pick<LogisticsIntelligenceReport, "metrics" | "delayedShipments" | "overloadedDrivers" | "fraudIntelligence" | "demandIntelligence" | "supportIntelligence" | "forecasting" | "revenueIntelligence">): IntelligenceAction[] {
  const actions: IntelligenceAction[] = [];
  const topDelay = report.delayedShipments[0];
  const topDriver = report.overloadedDrivers[0];
  const topRoute = report.demandIntelligence.topRoutes[0];

  if (topDelay) {
    actions.push({
      title: "Recover delayed shipment",
      detail: `${topDelay.trackingId} is ${topDelay.ageHours}h old against ${topDelay.etaHours}h ETA on ${topDelay.route}.`,
      owner: "dispatch",
      urgency: topDelay.ageHours > topDelay.etaHours * 2 ? "high" : "medium",
      nextStep: "Contact the assigned driver or carrier, update customer status, then refresh ETA."
    });
  }

  if (topDriver) {
    actions.push({
      title: "Rebalance driver workload",
      detail: `${topDriver.name} has ${topDriver.activeShipments} active shipments with ${topDriver.performanceScore}% performance score.`,
      owner: "dispatch",
      urgency: topDriver.activeShipments >= 4 ? "high" : "medium",
      nextStep: "Reassign the next non-urgent shipment to an available driver before adding more load."
    });
  }

  if (report.fraudIntelligence.riskScore >= 25) {
    actions.push({
      title: "Review fraud and COD controls",
      detail: `Risk score is ${report.fraudIntelligence.riskScore}/100 with ${report.fraudIntelligence.signals.length} active signal(s).`,
      owner: "finance",
      urgency: report.fraudIntelligence.riskLevel === "critical" || report.fraudIntelligence.riskLevel === "high" ? "critical" : "medium",
      nextStep: "Check COD exposure, high-value proof gaps, and repeated failed deliveries before approving payouts."
    });
  }

  if (report.supportIntelligence.urgent || report.supportIntelligence.stale) {
    actions.push({
      title: "Protect customer support SLA",
      detail: `${report.supportIntelligence.open} open ticket(s), ${report.supportIntelligence.urgent} urgent, ${report.supportIntelligence.stale} older than 2h.`,
      owner: "customer_care",
      urgency: report.supportIntelligence.urgent ? "high" : "medium",
      nextStep: "Reply to the oldest urgent ticket, then close resolved conversations from the support console."
    });
  }

  if (report.forecasting.capacityStatus !== "healthy") {
    actions.push({
      title: "Plan capacity before demand spike",
      detail: `${report.forecasting.next7DayShipments} shipments are forecast for the next 7 days with ${report.forecasting.capacityStatus} capacity.`,
      owner: "operations",
      urgency: report.forecasting.capacityStatus === "overloaded" ? "critical" : "medium",
      nextStep: "Confirm driver availability and prepare overflow carrier capacity before paid demand lands."
    });
  }

  if (topRoute) {
    actions.push({
      title: "Capture top demand lane",
      detail: `${topRoute.route} is forecast for ${topRoute.forecast7Day} shipment(s) in 7 days.`,
      owner: "growth",
      urgency: topRoute.forecast7Day >= 5 ? "medium" : "low",
      nextStep: "Promote this route in sales outreach and monitor price/margin performance."
    });
  }

  if (!actions.length) {
    actions.push({
      title: "Keep operations steady",
      detail: "No urgent AI action is required from the current operating signal.",
      owner: "operations",
      urgency: "low",
      nextStep: "Keep monitoring active shipments, support replies, and paid booking conversion."
    });
  }

  return actions.slice(0, 6);
}

function buildInsights(report: Pick<LogisticsIntelligenceReport, "metrics" | "routeOptimization" | "forecasting" | "fraudIntelligence">) {
  const insights: LogisticsIntelligenceReport["insights"] = [];
  if (report.metrics.delayedShipments > 0) {
    insights.push({
      title: "Delayed shipment pressure",
      detail: `${report.metrics.delayedShipments} active shipments are beyond their expected operating ETA.`,
      severity: report.metrics.delayedShipments > 5 ? "critical" : "warning"
    });
  }
  if (report.metrics.overloadedDrivers > 0) {
    insights.push({
      title: "Driver load imbalance",
      detail: `${report.metrics.overloadedDrivers} drivers are overloaded or showing weak performance signals.`,
      severity: "warning"
    });
  }
  if (report.metrics.codExposure > 0) {
    insights.push({
      title: "COD exposure",
      detail: `Open COD exposure is about NGN ${Math.round(report.metrics.codExposure).toLocaleString("en-NG")}.`,
      severity: report.metrics.codExposure > 250000 ? "critical" : "warning"
    });
  }
  if (report.routeOptimization.multiStopRecommendations.length > 0) {
    insights.push({
      title: "Route clustering opportunity",
      detail: `${report.routeOptimization.multiStopRecommendations.length} route clusters can reduce mileage with multi-stop planning.`,
      severity: "info"
    });
  }
  if (report.forecasting.capacityStatus !== "healthy") {
    insights.push({
      title: "Capacity forecast",
      detail: `The next 7 days are forecast at ${report.forecasting.next7DayShipments} shipments with ${report.forecasting.capacityStatus} capacity.`,
      severity: report.forecasting.capacityStatus === "overloaded" ? "critical" : "warning"
    });
  }
  if (report.fraudIntelligence.riskScore > 0) {
    insights.push({
      title: "Fraud and anomaly score",
      detail: `Current risk score is ${report.fraudIntelligence.riskScore}/100 from ${report.fraudIntelligence.signals.length} live signal${report.fraudIntelligence.signals.length === 1 ? "" : "s"}.`,
      severity: report.fraudIntelligence.riskLevel === "critical" || report.fraudIntelligence.riskLevel === "high" ? "critical" : "warning"
    });
  }
  if (!insights.length) {
    insights.push({
      title: "Operations stable",
      detail: "No major delay, COD, driver, or route risk pattern is currently visible.",
      severity: "info"
    });
  }
  return insights;
}

function buildAssistantBrief(report: Pick<LogisticsIntelligenceReport, "metrics" | "delayedShipments" | "overloadedDrivers" | "riskAlerts" | "revenueIntelligence" | "forecasting" | "fraudIntelligence">) {
  const firstDelay = report.delayedShipments[0];
  const firstDriver = report.overloadedDrivers[0];
  const firstRoute = report.revenueIntelligence.profitableRoutes[0];
  return [
    `${report.metrics.activeShipments} active shipments are being monitored with ${report.metrics.delayedShipments} delay signal${report.metrics.delayedShipments === 1 ? "" : "s"}.`,
    `Forecast: ${report.forecasting.next7DayShipments} shipments and NGN ${Math.round(report.forecasting.next7DayRevenue).toLocaleString("en-NG")} revenue are projected over the next 7 days.`,
    firstDelay ? `Priority watch: ${firstDelay.trackingId} on ${firstDelay.route}.` : "No priority delay watch is active.",
    firstDriver ? `Driver load watch: ${firstDriver.name} has ${firstDriver.activeShipments} active deliveries.` : "Driver workload is balanced.",
    firstRoute ? `Revenue signal: ${firstRoute.route} is the strongest estimated-profit lane.` : "Revenue intelligence will improve as paid shipment history grows.",
    report.riskAlerts.length ? `${report.riskAlerts.length} risk alert${report.riskAlerts.length === 1 ? "" : "s"} need review.` : "No major fraud or operational risk alert is open.",
    `Fraud and anomaly score is ${report.fraudIntelligence.riskScore}/100.`
  ].join(" ");
}

export function buildLogisticsIntelligenceReport(input: {
  shipments: IntelligenceShipmentRow[];
  drivers: IntelligenceDriverRow[];
  quotes: IntelligenceQuoteRow[];
  supportTickets: IntelligenceSupportTicketRow[];
}): LogisticsIntelligenceReport {
  const activeShipments = input.shipments.filter((shipment) => isActiveShipment(shipment.status));
  const delayedShipments = buildDelayedShipments(input.shipments);
  const overloadedDrivers = buildOverloadedDrivers(input.shipments, input.drivers);
  const routeProfitability = buildRouteProfitability(input.shipments);
  const deliveryTrends = buildDeliveryTrends(input.shipments);
  const routeOptimization = buildRouteOptimization(input.shipments);
  const etaPredictions = buildEtaPredictions(input.shipments, input.drivers);
  const driverIntelligence = buildDriverIntelligence(input.shipments, input.drivers);
  const riskAlerts = buildRiskAlerts(input.shipments, input.drivers, input.supportTickets, delayedShipments);
  const revenueIntelligence = buildRevenueIntelligence(input.shipments, routeProfitability, delayedShipments);
  const forecasting = buildForecastingIntelligence(input.shipments, input.quotes, input.drivers);
  const fraudIntelligence = buildFraudIntelligence(input.shipments, riskAlerts);
  const demandIntelligence = buildDemandIntelligence(input.shipments, forecasting, input.drivers);
  const forecastScenarios = buildForecastScenarios(forecasting);
  const fraudControls = buildFraudControls(fraudIntelligence);
  const supportIntelligence = buildSupportIntelligence(input.supportTickets);
  const driverPerformanceBands = buildDriverPerformanceBands(driverIntelligence);
  const codExposure = input.shipments
    .filter((shipment) => numberValue(shipment.cod_amount) > 0 && !["REMITTED", "NOT_APPLICABLE"].includes(normalizeStatus(shipment.cod_status, "PENDING")))
    .reduce((sum, shipment) => sum + numberValue(shipment.cod_amount), 0);
  const revenueAtRisk = delayedShipments.reduce((sum, delayed) => {
    const shipment = input.shipments.find((item) => trackingId(item) === delayed.trackingId);
    return sum + (shipment ? moneyValue(shipment) : 0);
  }, 0);

  const partial = {
    generatedAt: new Date().toISOString(),
    metrics: {
      activeShipments: activeShipments.length,
      delayedShipments: delayedShipments.length,
      overloadedDrivers: overloadedDrivers.length,
      highRiskAlerts: riskAlerts.filter((alert) => ["high", "critical"].includes(alert.severity)).length,
      codExposure,
      revenueAtRisk,
      openSupportTickets: input.supportTickets.filter((ticket) => !["RESOLVED", "CLOSED"].includes(normalizeStatus(ticket.status, "OPEN"))).length,
      averageEtaConfidence: averageEtaConfidence(input.shipments)
    },
    delayedShipments,
    overloadedDrivers,
    routeProfitability,
    deliveryTrends,
    routeOptimization,
    etaPredictions,
    riskAlerts,
    driverIntelligence,
    forecasting,
    fraudIntelligence,
    demandIntelligence,
    forecastScenarios,
    fraudControls,
    supportIntelligence,
    driverPerformanceBands,
    revenueIntelligence
  };

  const actionPlan = buildActionPlan(partial);
  const insights = buildInsights(partial);
  return {
    ...partial,
    insights,
    actionPlan,
    assistantBrief: buildAssistantBrief(partial)
  };
}

export function answerIntelligenceQuestion(question: string, report: LogisticsIntelligenceReport) {
  const normalized = question.toLowerCase();
  if (normalized.includes("delay") || normalized.includes("late")) {
    const delayed = report.delayedShipments.slice(0, 3);
    return delayed.length
      ? `Top delay watch: ${delayed.map((item) => `${item.trackingId} on ${item.route} (${item.ageHours}h active vs ${item.etaHours}h ETA)`).join("; ")}.`
      : "No delayed shipment is currently above the operations threshold.";
  }
  if (normalized.includes("cod") || normalized.includes("fraud") || normalized.includes("risk")) {
    const risks = report.fraudIntelligence.signals.slice(0, 3);
    return risks.length
      ? `Fraud and anomaly score is ${report.fraudIntelligence.riskScore}/100. Top signals: ${risks.map((risk) => `${risk.title}: ${risk.message}`).join(" ")}`
      : "No major COD, fraud, or anomaly risk is currently visible.";
  }
  if (normalized.includes("forecast") || normalized.includes("demand")) {
    const route = report.demandIntelligence.topRoutes[0];
    return [
      `Next 7 days forecast: ${report.forecasting.next7DayShipments} shipments and NGN ${Math.round(report.forecasting.next7DayRevenue).toLocaleString("en-NG")} projected revenue at ${report.forecasting.confidence}% confidence.`,
      route ? `Demand leader: ${route.route} with ${route.forecast7Day} forecast shipments.` : "No strong route demand leader yet.",
      `Capacity is ${report.forecasting.capacityStatus}.`
    ].join(" ");
  }
  if (normalized.includes("action") || normalized.includes("next") || normalized.includes("priority")) {
    const actions = report.actionPlan.slice(0, 3);
    return actions.length
      ? `Top AI actions: ${actions.map((action) => `${action.title} (${action.owner}, ${action.urgency}): ${action.nextStep}`).join(" ")}`
      : "No urgent AI action is required right now.";
  }
  if (normalized.includes("support") || normalized.includes("ticket")) {
    return `Support queue: ${report.supportIntelligence.open} open, ${report.supportIntelligence.urgent} urgent, ${report.supportIntelligence.stale} stale. ${report.supportIntelligence.recommendation}`;
  }
  if (normalized.includes("driver")) {
    const drivers = report.driverIntelligence.slice(0, 3);
    return drivers.length
      ? `Driver watch: ${drivers.map((driver) => `${driver.name} is ${driver.reliability} with ${driver.activeShipments} active jobs and ${driver.efficiencyScore}% efficiency`).join("; ")}.`
      : "No driver performance signals are available yet.";
  }
  if (normalized.includes("revenue") || normalized.includes("profit")) {
    const route = report.revenueIntelligence.profitableRoutes[0];
    return route
      ? `${route.route} is the strongest estimated-profit route with NGN ${Math.round(route.estimatedProfit).toLocaleString("en-NG")} estimated profit and ${route.marginPercent}% margin.`
      : "Revenue intelligence needs more paid shipment history before ranking routes confidently.";
  }
  return report.assistantBrief;
}
