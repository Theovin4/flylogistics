import {
  inferStateCodeFromAddress,
  nigerianStates,
  normalizeStateCode,
  stateName,
  type NigerianStateCode
} from "@/lib/pricing";

type Point = {
  lat: number;
  lng: number;
};

export type ShipmentEtaInput = {
  pickupState?: string | null;
  destinationState?: string | null;
  pickupAddress?: string | null;
  deliveryAddress?: string | null;
  deliveryCategory?: string | null;
  urgency?: string | null;
  vehicleType?: string | null;
  currentLat?: number | null;
  currentLng?: number | null;
};

export type ShipmentEtaEstimate = {
  etaHours: number;
  etaLabel: string;
  distanceKm: number;
  confidence: number;
  trafficAssumption: "light" | "moderate" | "heavy";
  deliveryType: string;
  routeSummary: string;
  pickupStateCode: NigerianStateCode;
  destinationStateCode: NigerianStateCode;
  pickupStateName: string;
  destinationStateName: string;
  vehicleType: string;
};

const stateCentres: Record<NigerianStateCode, Point> = {
  AB: { lat: 5.532, lng: 7.486 },
  AD: { lat: 9.326, lng: 12.398 },
  AK: { lat: 5.036, lng: 7.912 },
  AN: { lat: 6.22, lng: 6.937 },
  BA: { lat: 10.315, lng: 9.844 },
  BY: { lat: 4.771, lng: 6.069 },
  BE: { lat: 7.336, lng: 8.741 },
  BO: { lat: 11.884, lng: 13.151 },
  CR: { lat: 5.96, lng: 8.326 },
  DE: { lat: 5.704, lng: 5.933 },
  EB: { lat: 6.324, lng: 8.113 },
  ED: { lat: 6.335, lng: 5.603 },
  EK: { lat: 7.72, lng: 5.311 },
  EN: { lat: 6.459, lng: 7.546 },
  FC: { lat: 9.076, lng: 7.399 },
  GO: { lat: 10.29, lng: 11.167 },
  IM: { lat: 5.485, lng: 7.035 },
  JI: { lat: 12.228, lng: 9.561 },
  KD: { lat: 10.51, lng: 7.416 },
  KN: { lat: 12.002, lng: 8.592 },
  KT: { lat: 12.99, lng: 7.601 },
  KE: { lat: 12.45, lng: 4.199 },
  KO: { lat: 7.802, lng: 6.734 },
  KW: { lat: 8.966, lng: 4.388 },
  LA: { lat: 6.524, lng: 3.379 },
  NA: { lat: 8.499, lng: 8.199 },
  NI: { lat: 9.93, lng: 5.598 },
  OG: { lat: 7.147, lng: 3.361 },
  ON: { lat: 7.257, lng: 5.205 },
  OS: { lat: 7.562, lng: 4.52 },
  OY: { lat: 7.377, lng: 3.947 },
  PL: { lat: 9.896, lng: 8.858 },
  RI: { lat: 4.815, lng: 7.05 },
  SO: { lat: 13.005, lng: 5.247 },
  TA: { lat: 8.893, lng: 11.367 },
  YO: { lat: 11.747, lng: 11.966 },
  ZA: { lat: 12.17, lng: 6.664 }
};

const vehicleSpeeds: Record<string, number> = {
  bike: 34,
  car: 46,
  van: 42,
  truck: 54,
  "dispatch bike": 34,
  "express car": 46,
  "cargo van": 42,
  "freight truck": 54
};

function round(value: number, precision = 1) {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

function normalizeCode(state?: string | null, address?: string | null, fallback: NigerianStateCode = "LA") {
  return (normalizeStateCode(state) ?? inferStateCodeFromAddress(address) ?? fallback) as NigerianStateCode;
}

function stateZone(code: NigerianStateCode) {
  return nigerianStates.find((state) => state.code === code)?.zone ?? "South West";
}

function urgencyFactor(urgency?: string | null) {
  const normalized = String(urgency ?? "standard").toLowerCase();
  if (normalized === "critical") return 0.68;
  if (normalized === "priority") return 0.84;
  return 1;
}

function trafficAssumption(urgency?: string | null): ShipmentEtaEstimate["trafficAssumption"] {
  const hour = new Date().getHours();
  const normalized = String(urgency ?? "standard").toLowerCase();
  if (normalized === "critical") return "moderate";
  if ((hour >= 7 && hour <= 10) || (hour >= 16 && hour <= 20)) return "heavy";
  return "light";
}

function trafficFactor(traffic: ShipmentEtaEstimate["trafficAssumption"]) {
  if (traffic === "heavy") return 1.32;
  if (traffic === "moderate") return 1.14;
  return 1;
}

function vehicleSpeed(vehicleType?: string | null) {
  const normalized = String(vehicleType ?? "").toLowerCase();
  return vehicleSpeeds[normalized] ?? (normalized.includes("bike") ? 34 : normalized.includes("truck") ? 54 : normalized.includes("van") ? 42 : 46);
}

function deliveryType(deliveryCategory?: string | null, sameState = false) {
  const category = String(deliveryCategory ?? "standard_package").toLowerCase();
  if (category === "international_import") return "International import to Nigeria";
  if (category === "international_export") return "International export from Nigeria";
  if (category === "food_snacks") return sameState ? "Same-day food/snacks delivery" : "Food/snacks route not recommended";
  if (!sameState) return "ETA-based interstate delivery";
  if (category === "standard_package") return "Next-day same-state delivery";
  if (category === "bulk_freight") return "Scheduled freight delivery";
  return "Priority local delivery";
}

export function haversineKm(fromLat: number, fromLng: number, toLat: number, toLng: number) {
  const radiusKm = 6371;
  const dLat = ((toLat - fromLat) * Math.PI) / 180;
  const dLng = ((toLng - fromLng) * Math.PI) / 180;
  const lat1 = (fromLat * Math.PI) / 180;
  const lat2 = (toLat * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLng / 2) * Math.sin(dLng / 2) * Math.cos(lat1) * Math.cos(lat2);
  return radiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function statePoint(code?: string | null) {
  const normalized = normalizeStateCode(code);
  return normalized ? stateCentres[normalized] : null;
}

export function estimateRouteDistanceKm(pickupState: NigerianStateCode, destinationState: NigerianStateCode) {
  if (pickupState === destinationState) return 35;
  const direct = haversineKm(
    stateCentres[pickupState].lat,
    stateCentres[pickupState].lng,
    stateCentres[destinationState].lat,
    stateCentres[destinationState].lng
  );
  const sameRegion = stateZone(pickupState) === stateZone(destinationState);
  return Math.max(sameRegion ? 120 : 260, round(direct * 1.28, 0));
}

export function etaLabel(hours: number) {
  if (hours < 1) return `${Math.max(15, Math.round(hours * 60))} min`;
  if (hours <= 24) return `${Math.round(hours)}h`;
  const days = Math.ceil(hours / 24);
  return `${days} day${days === 1 ? "" : "s"}`;
}

export function estimateShipmentEta(input: ShipmentEtaInput): ShipmentEtaEstimate {
  const pickupStateCode = normalizeCode(input.pickupState, input.pickupAddress);
  const destinationStateCode = normalizeCode(input.destinationState, input.deliveryAddress, pickupStateCode);
  const sameState = pickupStateCode === destinationStateCode;
  const traffic = trafficAssumption(input.urgency);
  const vehicle = input.vehicleType || (sameState ? "Dispatch bike" : "Cargo van");
  const distanceKm = estimateRouteDistanceKm(pickupStateCode, destinationStateCode);
  const baseDriveHours = distanceKm / vehicleSpeed(vehicle);
  const category = String(input.deliveryCategory ?? "standard_package").toLowerCase();
  if (category === "international_import" || category === "international_export") {
    const etaHours = category === "international_import"
      ? input.urgency === "critical" ? 120 : input.urgency === "priority" ? 144 : 168
      : input.urgency === "critical" ? 96 : input.urgency === "priority" ? 120 : 144;
    return {
      etaHours,
      etaLabel: etaLabel(etaHours),
      distanceKm: 0,
      confidence: 76,
      trafficAssumption: "moderate",
      deliveryType: deliveryType(category, false),
      routeSummary: category === "international_import" ? "International import route into Nigeria." : "International export route from Nigeria.",
      pickupStateCode,
      destinationStateCode,
      pickupStateName: stateName(pickupStateCode),
      destinationStateName: stateName(destinationStateCode),
      vehicleType: "International freight partner"
    };
  }
  const minimumHours =
    category === "food_snacks"
      ? sameState ? 3 : 0
      : sameState
        ? category === "standard_package" ? 18 : 8
        : 32;
  const handlingHours = sameState ? 1.5 : category === "bulk_freight" ? 10 : 6;
  const etaHours = Math.max(1, round(Math.max(baseDriveHours + handlingHours, minimumHours) * trafficFactor(traffic) * urgencyFactor(input.urgency), 0));
  const confidence = sameState ? 92 : stateZone(pickupStateCode) === stateZone(destinationStateCode) ? 88 : 82;
  const pickupStateName = stateName(pickupStateCode);
  const destinationStateName = stateName(destinationStateCode);

  return {
    etaHours,
    etaLabel: etaLabel(etaHours),
    distanceKm,
    confidence,
    trafficAssumption: traffic,
    deliveryType: deliveryType(input.deliveryCategory, sameState),
    routeSummary: `${pickupStateName} to ${destinationStateName}, about ${distanceKm} km with ${traffic} traffic assumptions.`,
    pickupStateCode,
    destinationStateCode,
    pickupStateName,
    destinationStateName,
    vehicleType: vehicle
  };
}
