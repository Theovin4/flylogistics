import { NextResponse } from "next/server";
import { z } from "zod";
import { getGroq } from "@/lib/groq";
import { isDriverSchemaMismatch } from "@/lib/driver-data";
import { fetchShipmentByTracking } from "@/lib/shipment-data";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { enforceRateLimit, parseJson } from "@/server/api";
import { writeAuditLog } from "@/server/audit";
import { logShipmentWorkflowError, requestContext } from "@/server/monitoring";
import { estimateShipmentEta, haversineKm, statePoint } from "@/server/operations-intelligence";
import { writeOperationalEvent } from "@/server/operational-events";
import { requireCloudFeature } from "@/server/tenancy";

export const dynamic = "force-dynamic";

const dispatchSchema = z.object({
  trackingId: z.string().trim().min(3)
});

type DispatchShipment = {
  id: number | string;
  tracking_id: string;
  status?: string | null;
  urgency?: string | null;
  driver_id?: number | string | null;
  current_lat?: number | null;
  current_lng?: number | null;
  pickup_address?: string | null;
  delivery_address?: string | null;
  package_type?: string | null;
  pickup_state?: string | null;
  destination_state?: string | null;
  delivery_category?: string | null;
  vehicle_type?: string | null;
};

type DispatchDriver = {
  id: number | string;
  name: string;
  status?: string | null;
  phone?: string | null;
  photo_url?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  approval_status?: string | null;
  rating?: number | string | null;
  last_seen_at?: string | null;
};

type DriverCandidate = DispatchDriver & {
  workload: number;
  completedDeliveries: number;
  failedDeliveries: number;
  acceptanceRate: number;
  successRate: number;
  performanceScore: number;
  distanceKm: number | null;
  score: number;
  signals: string[];
};

type AiDispatchPayload = {
  recommendedDriverId?: string | number;
  confidence?: number;
  reason?: string;
};

function normalizeStatus(value: string | null | undefined, fallback = "AVAILABLE") {
  return (value?.trim() || fallback).toUpperCase();
}

function isActiveShipment(status: string | null | undefined) {
  return !["DELIVERED", "CANCELLED", "EXCEPTION"].includes(normalizeStatus(status, "BOOKED"));
}

function isFailedShipment(status: string | null | undefined) {
  return ["CANCELLED", "EXCEPTION", "FAILED"].includes(normalizeStatus(status, "BOOKED"));
}

function isDispatchAvailable(driver: DispatchDriver) {
  const status = normalizeStatus(driver.status, "AVAILABLE");
  return driver.approval_status === "approved" && ["AVAILABLE", "ONLINE", "IDLE", "READY"].includes(status);
}

function statusScore(status: string | null | undefined) {
  const normalized = normalizeStatus(status);
  if (["AVAILABLE", "ONLINE", "IDLE", "READY"].includes(normalized)) return 44;
  if (["IN_TRANSIT", "BUSY", "ASSIGNED"].includes(normalized)) return 18;
  if (["OFFLINE", "INACTIVE", "SUSPENDED"].includes(normalized)) return -80;
  return 26;
}

function urgencyBoost(urgency: string | null | undefined) {
  const normalized = normalizeStatus(urgency, "STANDARD");
  if (normalized === "CRITICAL") return 16;
  if (normalized === "PRIORITY") return 10;
  return 5;
}

function roundDistance(value: number | null) {
  return value === null ? null : Math.round(value * 10) / 10;
}

function scoreDistance(distanceKm: number | null) {
  if (distanceKm === null) return 8;
  if (distanceKm <= 5) return 26;
  if (distanceKm <= 15) return 20;
  if (distanceKm <= 40) return 12;
  if (distanceKm <= 80) return 5;
  return -4;
}

function workloadScore(workload: number) {
  if (workload <= 0) return 24;
  if (workload === 1) return 16;
  if (workload === 2) return 8;
  return Math.max(-18, 4 - workload * 5);
}

function driverPerformanceScore(candidate: { rating?: number | string | null; completedDeliveries: number; failedDeliveries: number; acceptanceRate: number }) {
  const rating = Number(candidate.rating ?? 4.8);
  const ratingScore = Number.isFinite(rating) ? Math.min(20, Math.max(0, rating * 4)) : 16;
  const deliveryTotal = candidate.completedDeliveries + candidate.failedDeliveries;
  const successRate = deliveryTotal > 0 ? candidate.completedDeliveries / deliveryTotal : 1;
  return Math.round(ratingScore + successRate * 18 + (candidate.acceptanceRate / 100) * 12);
}

function shipmentReferencePoint(shipment: DispatchShipment) {
  if (shipment.current_lat !== null && shipment.current_lat !== undefined && shipment.current_lng !== null && shipment.current_lng !== undefined) {
    return { lat: shipment.current_lat, lng: shipment.current_lng, source: "shipment live position" };
  }
  const inferred = estimateShipmentEta({
    pickupState: shipment.pickup_state,
    destinationState: shipment.destination_state,
    pickupAddress: shipment.pickup_address,
    deliveryAddress: shipment.delivery_address,
    deliveryCategory: shipment.delivery_category,
    urgency: shipment.urgency,
    vehicleType: shipment.vehicle_type
  });
  const pickupPoint = statePoint(shipment.pickup_state) ?? statePoint(inferred.pickupStateCode);
  if (pickupPoint) return { ...pickupPoint, source: "pickup state centre" };
  return null;
}

function buildCandidateDrivers(
  shipment: DispatchShipment,
  drivers: DispatchDriver[],
  activeShipments: DispatchShipment[]
) {
  const workload = new Map<string, number>();
  const completed = new Map<string, number>();
  const failed = new Map<string, number>();
  const accepted = new Map<string, number>();
  const rejected = new Map<string, number>();
  for (const activeShipment of activeShipments) {
    if (!activeShipment.driver_id) continue;
    const driverId = String(activeShipment.driver_id);
    if (isActiveShipment(activeShipment.status)) workload.set(driverId, (workload.get(driverId) ?? 0) + 1);
    if (normalizeStatus(activeShipment.status) === "DELIVERED") completed.set(driverId, (completed.get(driverId) ?? 0) + 1);
    if (isFailedShipment(activeShipment.status)) failed.set(driverId, (failed.get(driverId) ?? 0) + 1);
    if (normalizeStatus(activeShipment.status) === "DRIVER_ASSIGNED" || normalizeStatus(activeShipment.status) === "PICKED_UP" || normalizeStatus(activeShipment.status) === "IN_TRANSIT" || normalizeStatus(activeShipment.status) === "ARRIVED" || normalizeStatus(activeShipment.status) === "DELIVERED") {
      accepted.set(driverId, (accepted.get(driverId) ?? 0) + 1);
    }
    if (isFailedShipment(activeShipment.status)) rejected.set(driverId, (rejected.get(driverId) ?? 0) + 1);
  }

  const point = shipmentReferencePoint(shipment);
  const preferredDrivers = drivers.filter(isDispatchAvailable);
  const candidatePool = preferredDrivers.length ? preferredDrivers : drivers;

  return candidatePool
    .map((driver) => {
      const driverWorkload = workload.get(String(driver.id)) ?? 0;
      const completedDeliveries = completed.get(String(driver.id)) ?? 0;
      const failedDeliveries = failed.get(String(driver.id)) ?? 0;
      const acceptedAssignments = accepted.get(String(driver.id)) ?? 0;
      const rejectedAssignments = rejected.get(String(driver.id)) ?? 0;
      const assignmentTotal = acceptedAssignments + rejectedAssignments;
      const acceptanceRate = assignmentTotal > 0 ? Math.round((acceptedAssignments / assignmentTotal) * 100) : 100;
      const deliveryTotal = completedDeliveries + failedDeliveries;
      const successRate = deliveryTotal > 0 ? Math.round((completedDeliveries / deliveryTotal) * 100) : 100;
      const distanceKm =
        point &&
        driver.latitude !== null &&
        driver.latitude !== undefined &&
        driver.longitude !== null &&
        driver.longitude !== undefined
          ? roundDistance(haversineKm(point.lat, point.lng, driver.latitude, driver.longitude))
          : null;
      const performanceScore = driverPerformanceScore({ ...driver, completedDeliveries, failedDeliveries, acceptanceRate });
      const score =
        statusScore(driver.status) +
        workloadScore(driverWorkload) +
        scoreDistance(distanceKm) +
        urgencyBoost(shipment.urgency) +
        Math.round(performanceScore / 4);
      const signals = [
        `${normalizeStatus(driver.status).toLowerCase().replaceAll("_", " ")} status`,
        `${driverWorkload} active shipment${driverWorkload === 1 ? "" : "s"}`,
        distanceKm === null ? "location distance unavailable" : `${distanceKm} km from ${point?.source ?? "shipment"}`,
        `${acceptanceRate}% assignment acceptance`,
        `${successRate}% delivery success`,
        `${normalizeStatus(shipment.urgency, "STANDARD").toLowerCase()} urgency`
      ];

      return {
        ...driver,
        workload: driverWorkload,
        completedDeliveries,
        failedDeliveries,
        acceptanceRate,
        successRate,
        performanceScore,
        distanceKm,
        score,
        signals
      };
    })
    .sort((a, b) => b.score - a.score);
}

function fallbackReason(candidate: DriverCandidate, shipment: DispatchShipment) {
  const distance = candidate.distanceKm === null ? "location is not available" : `${candidate.distanceKm} km from the shipment position`;
  return `${candidate.name} is recommended for ${shipment.tracking_id} because they are ${normalizeStatus(candidate.status).toLowerCase().replaceAll("_", " ")}, have ${candidate.workload} active shipment${candidate.workload === 1 ? "" : "s"}, are ${distance}, and show ${candidate.successRate}% delivery success with ${candidate.acceptanceRate}% assignment acceptance. This fits the shipment urgency of ${normalizeStatus(shipment.urgency, "STANDARD").toLowerCase()}.`;
}

function parseAiJson(value: string | null | undefined) {
  if (!value) return null;
  const match = value.match(/\{[\s\S]*\}/);
  if (!match) return null;

  try {
    return JSON.parse(match[0]) as AiDispatchPayload;
  } catch {
    return null;
  }
}

async function aiRecommendation(shipment: DispatchShipment, candidates: DriverCandidate[]) {
  const groq = getGroq();
  if (!groq || candidates.length === 0) return null;

  const completion = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [
      {
        role: "system",
        content:
          "You are Fly Logistics AI Dispatch. Choose the best driver for a shipment using driver status, distance/location, workload, and shipment urgency. Return only JSON with recommendedDriverId, confidence from 0 to 100, and reason."
      },
      {
        role: "user",
        content: JSON.stringify({
          shipment: {
            trackingId: shipment.tracking_id,
            status: shipment.status,
            urgency: shipment.urgency,
            packageType: shipment.package_type,
            pickupAddress: shipment.pickup_address,
            deliveryAddress: shipment.delivery_address,
            pickupState: shipment.pickup_state,
            destinationState: shipment.destination_state,
            currentLat: shipment.current_lat,
            currentLng: shipment.current_lng
          },
          candidates: candidates.slice(0, 8).map((candidate) => ({
            id: candidate.id,
            name: candidate.name,
            status: candidate.status,
            workload: candidate.workload,
            distanceKm: candidate.distanceKm,
            acceptanceRate: candidate.acceptanceRate,
            successRate: candidate.successRate,
            performanceScore: candidate.performanceScore,
            heuristicScore: candidate.score,
            signals: candidate.signals
          }))
        })
      }
    ],
    temperature: 0.2
  });

  return parseAiJson(completion.choices[0]?.message?.content);
}

export async function POST(request: Request) {
  const limited = await enforceRateLimit(request, "admin-dispatch-suggest", { limit: 30, windowSeconds: 60 });
  if (limited) return limited;

  const access = await requireCloudFeature(request, "ai_dispatch", ["owner", "admin", "dispatcher"]);
  if (!access.profile) return NextResponse.json({ error: access.error }, { status: access.status });
  if (access.error) return NextResponse.json({ error: access.error }, { status: access.status });

  const parsed = await parseJson(request, dispatchSchema, "Tracking ID is required for AI dispatch.");
  if (parsed.response) return parsed.response;

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Dispatch recommendations are temporarily unavailable." }, { status: 503 });

  const trackingId = parsed.data.trackingId.toUpperCase();
  const shipmentResult = await fetchShipmentByTracking(supabase, trackingId);
  if (shipmentResult.error) {
    logShipmentWorkflowError(shipmentResult.error, "Unable to load shipment for dispatch.", requestContext(request, { trackingId }));
    return NextResponse.json({ error: "Unable to load shipment for dispatch." }, { status: 500 });
  }
  if (!shipmentResult.data) {
    return NextResponse.json({ error: "Shipment not found." }, { status: 404 });
  }
  if (access.tenant?.schemaReady && access.tenant.companyId && (shipmentResult.data as { company_id?: string | null }).company_id !== access.tenant.companyId) {
    return NextResponse.json({ error: "Shipment not found." }, { status: 404 });
  }

  let driversQuery = supabase.from("drivers").select("id,name,status,phone,photo_url,latitude,longitude,approval_status,rating,last_seen_at").eq("approval_status", "approved");
  let activeShipmentsQuery = supabase.from("shipments").select("id,tracking_id,status,urgency,driver_id,current_lat,current_lng").neq("tracking_id", trackingId);
  if (access.tenant?.schemaReady && access.tenant.companyId) {
    driversQuery = driversQuery.eq("company_id", access.tenant.companyId);
    activeShipmentsQuery = activeShipmentsQuery.eq("company_id", access.tenant.companyId);
  }
  const [driversResultRaw, activeShipmentsResult] = await Promise.all([
    driversQuery.order("id", { ascending: true }),
    activeShipmentsQuery
  ]);

  let driversData = driversResultRaw.data as unknown[] | null;
  let driversError = driversResultRaw.error;
  if (isDriverSchemaMismatch(driversResultRaw.error)) {
    const fallbackDrivers = await supabase.from("drivers").select("id,name,status,phone,latitude,longitude").order("id", { ascending: true });
    driversData = fallbackDrivers.data as unknown[] | null;
    driversError = fallbackDrivers.error;
  }

  if (driversError) {
    logShipmentWorkflowError(driversError, "Unable to load drivers for dispatch.", requestContext(request, { trackingId }));
    return NextResponse.json({ error: "Unable to load drivers for dispatch." }, { status: 500 });
  }

  if (activeShipmentsResult.error) {
    logShipmentWorkflowError(activeShipmentsResult.error, "Unable to load driver workload for dispatch.", requestContext(request, { trackingId }));
    return NextResponse.json({ error: "Unable to load driver workload for dispatch." }, { status: 500 });
  }

  const shipment = shipmentResult.data as DispatchShipment;
  const drivers = (driversData ?? []) as DispatchDriver[];
  const activeShipments = (activeShipmentsResult.data ?? []) as DispatchShipment[];
  const candidates = buildCandidateDrivers(shipment, drivers, activeShipments);

  if (candidates.length === 0) {
    return NextResponse.json({ error: "No drivers are available for dispatch recommendation." }, { status: 404 });
  }

  let aiPayload: AiDispatchPayload | null = null;
  try {
    aiPayload = await aiRecommendation(shipment, candidates);
  } catch (error) {
    logShipmentWorkflowError(error, "AI dispatch recommendation failed; using heuristic fallback.", requestContext(request, { trackingId }));
  }

  const aiCandidate = aiPayload?.recommendedDriverId
    ? candidates.find((candidate) => String(candidate.id) === String(aiPayload?.recommendedDriverId))
    : null;
  const recommendedDriver = aiCandidate ?? candidates[0];
  const routeRecommendation = estimateShipmentEta({
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

  await writeAuditLog(supabase, {
    actor: access.profile,
    action: "dispatch.suggest_driver",
    entityType: "shipment",
    entityId: trackingId,
    metadata: { recommendedDriverId: recommendedDriver.id, routeRecommendation, mode: aiCandidate && aiPayload?.reason ? "groq" : "heuristic-fallback" },
    request
  });

  await writeOperationalEvent(supabase, {
    category: "dispatch",
    message: "AI dispatch recommendation generated.",
    entityType: "shipment",
    entityId: trackingId,
    metadata: { recommendedDriverId: recommendedDriver.id, routeRecommendation, mode: aiCandidate && aiPayload?.reason ? "groq" : "heuristic-fallback" },
    request
  });

  return NextResponse.json({
    trackingId,
    recommendedDriver,
    reason: aiPayload?.reason?.trim() || fallbackReason(recommendedDriver, shipment),
    confidence: Math.min(100, Math.max(1, Math.round(Number(aiPayload?.confidence ?? recommendedDriver.score)))),
    mode: aiCandidate && aiPayload?.reason ? "groq" : "heuristic-fallback",
    routeRecommendation,
    candidateDrivers: candidates.slice(0, 5)
  });
}
