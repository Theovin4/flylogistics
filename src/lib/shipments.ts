import { shipmentTypeFromDeliveryCategory } from "@/lib/pricing";
import { normalizeTransportationType } from "@/lib/driver-data";

export const shipmentStatuses = [
  "PENDING",
  "PENDING_PICKUP",
  "CONFIRMED",
  "DRIVER_ASSIGNED",
  "PICKED_UP",
  "IN_TRANSIT",
  "ARRIVED",
  "DELIVERED",
  "CANCELLED",
  "QUOTE_REQUESTED",
  "BOOKED",
  "ASSIGNED",
  "OUT_FOR_DELIVERY",
  "EXCEPTION"
] as const;

export type ShipmentStatus = (typeof shipmentStatuses)[number];

export const coreShipmentLifecycle = [
  "PENDING",
  "CONFIRMED",
  "DRIVER_ASSIGNED",
  "PICKED_UP",
  "IN_TRANSIT",
  "ARRIVED",
  "DELIVERED",
  "CANCELLED"
] as const;

export type CoreShipmentStatus = (typeof coreShipmentLifecycle)[number];

export const quoteReviewStatuses = ["PENDING_REVIEW", "QUOTED", "ACCEPTED", "DECLINED", "EXPIRED", "PAID", "CONVERTED_TO_SHIPMENT"] as const;

const statusAliases: Record<string, CoreShipmentStatus> = {
  PENDING_PICKUP: "PENDING",
  QUOTE_REQUESTED: "PENDING",
  BOOKED: "CONFIRMED",
  ASSIGNED: "DRIVER_ASSIGNED",
  OUT_FOR_DELIVERY: "ARRIVED",
  EXCEPTION: "PENDING"
};

const lifecycleRank: Record<CoreShipmentStatus, number> = {
  PENDING: 0,
  CONFIRMED: 1,
  DRIVER_ASSIGNED: 2,
  PICKED_UP: 3,
  IN_TRANSIT: 4,
  ARRIVED: 5,
  DELIVERED: 6,
  CANCELLED: 99
};

export function normalizeShipmentStatus(status: string | null | undefined): CoreShipmentStatus {
  const normalized = String(status ?? "PENDING").trim().toUpperCase();
  if (normalized in lifecycleRank) return normalized as CoreShipmentStatus;
  return statusAliases[normalized] ?? "PENDING";
}

export function shipmentStatusLabel(status: string | null | undefined) {
  const raw = String(status ?? "PENDING").trim().toUpperCase();
  if (raw === "PENDING_PICKUP") return "Pending Pickup";
  const normalized = normalizeShipmentStatus(status);
  return normalized.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function isShipmentAtLeast(status: string | null | undefined, target: CoreShipmentStatus) {
  const current = normalizeShipmentStatus(status);
  if (current === "CANCELLED") return target === "CANCELLED";
  return lifecycleRank[current] >= lifecycleRank[target] && target !== "CANCELLED";
}

export function isPaymentCleared(status: string | null | undefined) {
  return String(status ?? "UNPAID").toUpperCase() === "PAID";
}

export function shipmentCustomerMessage(status: string | null | undefined) {
  if (String(status ?? "").trim().toUpperCase() === "PENDING_PICKUP") {
    return "Payment is confirmed. Fly Logistics is arranging pickup and will update this tracking page once collection starts.";
  }

  switch (normalizeShipmentStatus(status)) {
    case "PENDING":
      return "Your booking has been received and is being prepared by Fly Logistics operations.";
    case "CONFIRMED":
      return "Your shipment is confirmed and being prepared for pickup.";
    case "DRIVER_ASSIGNED":
      return "Pickup has been scheduled and your shipment is being prepared for collection.";
    case "PICKED_UP":
      return "Your package has been picked up and is now in the Fly Logistics delivery network.";
    case "IN_TRANSIT":
      return "Your shipment is moving through the Fly Logistics network. We will keep this page updated.";
    case "ARRIVED":
      return "Your shipment has arrived near the delivery point and final delivery is being arranged.";
    case "DELIVERED":
      return "Your shipment has been delivered successfully. Thank you for shipping with Fly Logistics.";
    case "CANCELLED":
      return "This shipment has been cancelled. Contact support if you need help.";
    default:
      return "Your shipment is being reviewed by Fly Logistics operations.";
  }
}

export type ShipmentChecklistItem = {
  key: string;
  label: string;
  complete: boolean;
  detail: string;
};

export type DriverSummary = {
  id: number | string;
  name: string;
  status?: string | null;
  phone?: string | null;
  photo_url?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  current_latitude?: number | null;
  current_longitude?: number | null;
  is_online?: boolean | null;
  last_location_at?: string | null;
  approval_status?: string | null;
  account_user_id?: string | null;
  online_since?: string | null;
  offline_since?: string | null;
  last_seen_at?: string | null;
  rating?: number | string | null;
  kyc_status?: string | null;
  vehicle_type?: string | null;
  vehicle_plate_number?: string | null;
  vehicle_model?: string | null;
};

export type ShipmentTimelineEvent = {
  label: string;
  location?: string;
  completed: boolean;
  occurred_at?: string;
  title?: string;
  description?: string;
};

export type ShipmentRecord = {
  id: number | string;
  tracking_id: string;
  status: ShipmentStatus | string;
  pickup_address: string;
  delivery_address: string;
  pickup_state?: string | null;
  destination_state?: string | null;
  pickup_country?: string | null;
  destination_country?: string | null;
  delivery_category?: string | null;
  shipment_type?: string | null;
  freight_mode?: string | null;
  quote_currency?: string | null;
  freight_classification?: string | null;
  commercial_invoice?: Record<string, unknown> | null;
  international_tracking_mode?: string | null;
  customs_information?: string | null;
  package_value?: number | string | null;
  duties_taxes_amount?: number | string | null;
  export_import_documents?: string | null;
  package_type: string;
  customer_name?: string | null;
  customer_email?: string | null;
  customer_phone?: string | null;
  pickup_phone?: string | null;
  delivery_phone?: string | null;
  urgency?: string | null;
  weight_kg?: number | null;
  quoted_price?: number | null;
  eta?: string | null;
  eta_hours?: number | string | null;
  eta_confidence?: number | string | null;
  route_distance_km?: number | string | null;
  traffic_assumption?: string | null;
  delivery_type?: string | null;
  vehicle_type?: string | null;
  current_lat?: number | null;
  current_lng?: number | null;
  proof_image_url?: string | null;
  delivery_otp?: string | null;
  delivery_otp_verified_at?: string | null;
  recipient_name?: string | null;
  recipient_signature_url?: string | null;
  proof_lat?: number | null;
  proof_lng?: number | null;
  proof_uploaded_at?: string | null;
  package_image_url?: string | null;
  business_account_id?: number | string | null;
  business_reference?: string | null;
  merchant_batch_id?: string | null;
  standard_price?: number | string | null;
  discountable_amount?: number | string | null;
  discount_rate?: number | string | null;
  discount_amount?: number | string | null;
  final_price?: number | string | null;
  pricing_rule_version?: string | null;
  cod_amount?: number | string | null;
  cod_status?: string | null;
  cod_collected_at?: string | null;
  cod_remitted_at?: string | null;
  cod_remittance_reference?: string | null;
  warehouse_id?: number | string | null;
  payment_status?: string | null;
  payment_reference?: string | null;
  payment_amount?: number | string | null;
  payment_provider?: string | null;
  carrier?: string | null;
  carrier_provider?: string | null;
  carrier_shipment_id?: string | null;
  carrier_tracking_id?: string | null;
  carrier_order_id?: string | null;
  carrier_order_no?: string | null;
  carrier_waybill_no?: string | null;
  carrier_label_url?: string | null;
  carrier_rate_amount?: number | string | null;
  carrier_cost_amount?: number | string | null;
  carrier_profit_amount?: number | string | null;
  carrier_margin_percent?: number | string | null;
  carrier_status?: string | null;
  carrier_payload?: Record<string, unknown> | null;
  carrier_response?: Record<string, unknown> | null;
  carrier_error?: string | null;
  carrier_raw_response?: Record<string, unknown> | null;
  carrier_synced_at?: string | null;
  external_tracking_enabled?: boolean | null;
  driver_payout_amount?: number | string | null;
  driver_payout_status?: string | null;
  driver_payout_notes?: string | null;
  driver_payout_updated_at?: string | null;
  cancellation_refund_status?: string | null;
  cancellation_refund_due_at?: string | null;
  cancellation_refunded_at?: string | null;
  cancellation_refund_reference?: string | null;
  cancellation_refund_amount?: number | string | null;
  backdated_at?: string | null;
  backdate_reason?: string | null;
  internal_notes?: string | null;
  customer_status_message?: string | null;
  driver_id?: number | string | null;
  assigned_driver?: DriverSummary | null;
  timeline?: ShipmentTimelineEvent[] | null;
  created_at?: string;
  updated_at?: string;
};

const publicUnsafeCarrierNamePattern = /\b(fez|sendbox|easyship|carrier|waybill|external|third[-\s]?party|delivery\s+partner|fulfilment\s+partner|fulfillment\s+partner|provider)\b/i;
const publicUnsafeCarrierReferencePattern = /\b(?!FLY-)[A-Z0-9]{10,}\b/;

function containsPublicUnsafeTrackingText(text: string) {
  return publicUnsafeCarrierNamePattern.test(text) || publicUnsafeCarrierReferencePattern.test(text);
}

export function isPrivateShipmentTimelineEvent(event: Pick<ShipmentTimelineEvent, "label" | "title" | "description">) {
  const text = `${event.label ?? ""} ${event.title ?? ""} ${event.description ?? ""}`;
  return /proof\s+of\s+delivery|delivery\s+proof|proof\s+uploaded/i.test(text);
}

export function sortShipmentTimelineLatestFirst(timeline: ShipmentTimelineEvent[] | null | undefined) {
  const events = Array.isArray(timeline) ? [...timeline] : [];
  return events
    .map((event, index) => {
      const timestamp = event.occurred_at ? Date.parse(event.occurred_at) : Number.NaN;
      return { event, index, timestamp };
    })
    .sort((left, right) => {
      const leftHasTime = Number.isFinite(left.timestamp);
      const rightHasTime = Number.isFinite(right.timestamp);
      if (leftHasTime && rightHasTime && left.timestamp !== right.timestamp) return right.timestamp - left.timestamp;
      if (leftHasTime !== rightHasTime) return leftHasTime ? -1 : 1;
      return right.index - left.index;
    })
    .map(({ event }) => event);
}

const publicTimelineLimit = 7;

function publicTimelineLabel(event: ShipmentTimelineEvent) {
  const text = `${event.label ?? ""} ${event.title ?? ""} ${event.description ?? ""}`.toLowerCase();
  if (/delivered|delivery\s+complete/.test(text)) return "Delivery completed";
  if (/cancel/.test(text)) return "Shipment cancelled";
  if (/exception|failed|hold|operations\s+review/.test(text)) return "Shipment update";
  if (/arriv|out\s+for\s+delivery/.test(text)) return "Arrived near destination";
  if (/transit|dispatch|moving|linehaul|forward/.test(text)) return "Shipment in transit";
  if (/picked|collected|pickup\s+complete/.test(text)) return "Pickup completed";
  if (/partner|carrier|driver\s+assigned|assigned|pickup\s+being\s+arranged|pending\s+pick/.test(text)) return "Pickup scheduled";
  if (/payment/.test(text)) return "Payment confirmed";
  if (/confirm|review|quote\s+approved|booked|processed/.test(text)) return "Shipment confirmed";
  if (/created|pending/.test(text)) return "Shipment created";
  return "Shipment update";
}

/** Keeps public and customer tracking concise and free of internal fulfilment detail. */
export function publicShipmentTimeline(record: Pick<ShipmentRecord, "timeline" | "pickup_address" | "status">): ShipmentTimelineEvent[] {
  const source = record.timeline?.length
    ? record.timeline
    : [
        { label: "Shipment created", location: record.pickup_address, completed: true },
        { label: shipmentStatusLabel(record.status), completed: record.status === "DELIVERED" }
      ];
  const seen = new Set<string>();

  return sortShipmentTimelineLatestFirst(source)
    .filter((event) => !isPrivateShipmentTimelineEvent(event))
    .map((event) => ({
      label: publicTimelineLabel(event),
      location: "Fly Logistics network",
      completed: event.completed,
      occurred_at: event.occurred_at
    }))
    .filter((event) => {
      if (seen.has(event.label)) return false;
      seen.add(event.label);
      return true;
    })
    .slice(0, publicTimelineLimit);
}

export type QuoteRequestRecord = {
  id: number | string;
  request_id: string;
  customer_name: string;
  customer_email: string;
  customer_phone?: string | null;
  recipient_name?: string | null;
  pickup_phone?: string | null;
  delivery_phone?: string | null;
  pickup_state?: string | null;
  destination_state?: string | null;
  pickup_country?: string | null;
  destination_country?: string | null;
  pickup_address: string;
  delivery_address: string;
  shipment_type?: string | null;
  customs_information?: string | null;
  package_value?: number | string | null;
  duties_taxes_amount?: number | string | null;
  export_import_documents?: string | null;
  package_type: string;
  weight_kg: number;
  urgency: string;
  delivery_category?: string | null;
  freight_mode?: string | null;
  quote_currency?: string | null;
  freight_classification?: string | null;
  commercial_invoice?: Record<string, unknown> | null;
  international_tracking_mode?: string | null;
  business_account_id?: number | string | null;
  business_reference?: string | null;
  merchant_batch_id?: string | null;
  notes?: string | null;
  estimated_price: number;
  standard_price?: number | string | null;
  discountable_amount?: number | string | null;
  discount_rate?: number | string | null;
  discount_amount?: number | string | null;
  final_price?: number | string | null;
  pricing_rule_version?: string | null;
  estimated_eta_hours: number;
  quoted_price?: number | string | null;
  quoted_eta_hours?: number | string | null;
  quoted_eta_label?: string | null;
  quote_notes?: string | null;
  quote_valid_until?: string | null;
  quote_sent_at?: string | null;
  accepted_at?: string | null;
  declined_at?: string | null;
  paid_at?: string | null;
  converted_at?: string | null;
  quote_status_history?: Array<Record<string, unknown>> | null;
  pricing_breakdown?: Record<string, unknown> | null;
  vehicle_type?: string | null;
  delivery_type?: string | null;
  service_warnings?: string[] | null;
  payment_status?: string | null;
  payment_reference?: string | null;
  payment_amount?: number | string | null;
  payment_provider?: string | null;
  review_notes?: string | null;
  reviewed_at?: string | null;
  reviewed_by?: string | null;
  status: string;
  created_at?: string;
};

export function shipmentOperationsChecklist(record: ShipmentRecord): ShipmentChecklistItem[] {
  const status = normalizeShipmentStatus(record.status);
  const hasPaymentRequirement = Number(record.payment_amount ?? record.quoted_price ?? 0) > 0;
  const paymentOk = !hasPaymentRequirement || isPaymentCleared(record.payment_status);
  const driverAssigned = Boolean(record.driver_id ?? record.assigned_driver?.id);
  const proofUploaded = Boolean(record.proof_image_url);

  return [
    {
      key: "payment",
      label: "Payment cleared before confirmation",
      complete: paymentOk || status === "PENDING" || status === "CANCELLED",
      detail: paymentOk ? "Payment requirement satisfied." : "Keep shipment pending until payment is cleared."
    },
    {
      key: "driver",
      label: "Driver assigned",
      complete: driverAssigned || lifecycleRank[status] < lifecycleRank.DRIVER_ASSIGNED || status === "CANCELLED",
      detail: driverAssigned ? "Driver assignment is present." : "Assign a driver before pickup."
    },
    {
      key: "pickup",
      label: "Pickup confirmed",
      complete: isShipmentAtLeast(status, "PICKED_UP") || status === "CANCELLED",
      detail: isShipmentAtLeast(status, "PICKED_UP") ? "Pickup has been recorded." : "Mark picked up after collection."
    },
    {
      key: "movement",
      label: "Movement tracked",
      complete: isShipmentAtLeast(status, "IN_TRANSIT") || status === "CANCELLED",
      detail: isShipmentAtLeast(status, "IN_TRANSIT") ? "Shipment movement is visible." : "Update status when shipment leaves pickup."
    },
    {
      key: "proof",
      label: "Proof uploaded before delivered",
      complete: status !== "DELIVERED" || proofUploaded,
      detail: proofUploaded ? "Proof of delivery is attached." : "Upload proof before marking delivered."
    }
  ];
}

const secureIdAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function secureCode(length: number) {
  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => secureIdAlphabet[byte % secureIdAlphabet.length]).join("");
}

export function makeTrackingId() {
  return `FLY-${new Date().getFullYear()}-${secureCode(8)}`;
}

export function makeRequestId() {
  return `REQ-${secureCode(9)}`;
}

export function estimateQuote(weightKg: number, urgency: string) {
  const urgencyMultiplier = urgency === "critical" ? 2.1 : urgency === "priority" ? 1.45 : 1;
  const base = 4200;
  const amount = Math.round((base + weightKg * 180) * urgencyMultiplier);
  const estimatedEtaHours = urgency === "critical" ? 8 : urgency === "priority" ? 18 : 36;
  return { amount, estimatedEtaHours };
}

export const demoShipment: ShipmentRecord = {
  id: "demo",
  tracking_id: "FLY-2026-88912",
  status: "IN_TRANSIT",
  pickup_address: "Ikeja Industrial Estate, Lagos",
  delivery_address: "Central Business District, Abuja",
  package_type: "Priority electronics shipment",
  customer_name: "Demo Customer",
  urgency: "priority",
  weight_kg: 24,
  quoted_price: 12500,
  eta: "4h 20m",
  current_lat: 9.0765,
  current_lng: 7.3986,
  assigned_driver: {
    id: "FLY-224",
    name: "Amara Okafor",
    status: "In transit",
    latitude: 9.0765,
    longitude: 7.3986
  },
  timeline: [
    { label: "Quote approved", location: "Lagos", completed: true },
    { label: "Package picked up", location: "Ikeja", completed: true },
    { label: "Linehaul in progress", location: "Lokoja corridor", completed: true },
    { label: "Out for delivery", location: "Abuja", completed: false }
  ]
};

export function normalizeShipment(record: ShipmentRecord, options: { includeProof?: boolean; publicTracking?: boolean } = {}) {
  const driver = record.assigned_driver;
  const includeProof = options.includeProof ?? true;
  const publicTracking = options.publicTracking ?? false;
  const driverLatitude = driver?.current_latitude ?? driver?.latitude;
  const driverLongitude = driver?.current_longitude ?? driver?.longitude;
  const senderName = record.customer_name ?? "Sender";
  const publicPickupLabel = senderName ? `Sender: ${senderName}` : "Sender details protected";
  const sanitizePublicLabel = (text?: string) => {
    if (!publicTracking) return text;
    if (!text) return text;
    return containsPublicUnsafeTrackingText(text) ? "Fly Logistics status update" : text;
  };
  const sanitizePublicLocation = (location?: string) => {
    if (!publicTracking) return location;
    if (!location) return location;
    if (containsPublicUnsafeTrackingText(location)) return "Fly Logistics network update";
    const pickupAddress = String(record.pickup_address ?? "").trim().toLowerCase();
    return pickupAddress && location.trim().toLowerCase() === pickupAddress ? "Pickup secured by Fly Logistics" : location;
  };
  const sanitizePublicText = (text?: string) => {
    if (!publicTracking) return text;
    if (!text) return text;
    return containsPublicUnsafeTrackingText(text) ? "Fly Logistics network status updated." : text;
  };
  const events = record.timeline?.length
    ? record.timeline
    : [
        { label: "Shipment created", location: record.pickup_address, completed: true },
        { label: String(record.status).replaceAll("_", " "), location: record.delivery_address, completed: record.status === "DELIVERED" }
      ];
  const sortedEvents = publicTracking ? publicShipmentTimeline(record) : sortShipmentTimelineLatestFirst(events);
  return {
    trackingId: record.tracking_id,
    status: record.status,
    eta: record.eta ?? "Pending ETA",
    confidence: Number(record.eta_confidence ?? 0) > 0 ? Number(record.eta_confidence) : record.status === "DELIVERED" ? 100 : record.status === "EXCEPTION" ? 62 : 94,
    etaConfidence: record.eta_confidence,
    etaHours: record.eta_hours,
    routeDistanceKm: record.route_distance_km,
    trafficAssumption: record.traffic_assumption,
    vehicleType: normalizeTransportationType(record.vehicle_type),
    pickupAddress: publicTracking ? publicPickupLabel : record.pickup_address,
    deliveryAddress: record.delivery_address,
    pickupState: record.pickup_state,
    destinationState: record.destination_state,
    deliveryCategory: record.delivery_category,
    shipmentType: record.shipment_type ?? shipmentTypeFromDeliveryCategory(record.delivery_category),
    freightMode: record.freight_mode,
    quoteCurrency: record.quote_currency,
    freightClassification: record.freight_classification,
    internationalTrackingMode: record.international_tracking_mode,
    commercialInvoice: record.commercial_invoice,
    pickupCountry: record.pickup_country,
    destinationCountry: record.destination_country,
    customsInformation: record.customs_information,
    packageValue: record.package_value,
    dutiesTaxesAmount: record.duties_taxes_amount,
    exportImportDocuments: record.export_import_documents,
    packageType: record.package_type,
    urgency: record.urgency ?? "standard",
    customerName: record.customer_name,
    recipientName: record.recipient_name,
    ...(publicTracking ? {} : {
      pickupPhone: record.pickup_phone,
      deliveryPhone: record.delivery_phone
    }),
    customerStatusMessage: record.customer_status_message ?? shipmentCustomerMessage(record.status),
    ...(includeProof ? { proofImageUrl: record.proof_image_url } : {}),
    packageImageUrl: record.package_image_url,
    operationsChecklist: publicTracking
      ? shipmentOperationsChecklist(record).filter((item) => item.key !== "proof")
      : shipmentOperationsChecklist(record),
    assignedDriver: driver
      ? {
          id: driver.id,
          name: driver.name,
          status: driver.status ?? "Assigned",
          ...(publicTracking ? {} : { phone: driver.phone }),
          photoUrl: driver.photo_url,
          vehicleType: normalizeTransportationType(driver.vehicle_type),
          isOnline: !String(driver.status ?? "offline").toLowerCase().includes("offline") || driver.is_online === true,
          lastLocationAt: driver.last_location_at
        }
      : null,
    vehicle: {
      id: driver?.id ? String(driver.id) : "Unassigned",
      lat: Number(record.current_lat ?? driverLatitude ?? 6.5244),
      lng: Number(record.current_lng ?? driverLongitude ?? 3.3792),
      speedKph: record.status === "IN_TRANSIT" ? 68 : 0,
      type: normalizeTransportationType(driver?.vehicle_type ?? record.vehicle_type)
    },
    events: sortedEvents.map((event) => {
      const safeEvent = {
        label: sanitizePublicLabel(event.label) ?? event.label,
        title: sanitizePublicLabel(event.title),
        location: sanitizePublicLocation(event.location),
        description: sanitizePublicText(event.description),
        completed: event.completed,
        occurred_at: event.occurred_at
      };

      return publicTracking ? safeEvent : { ...event, ...safeEvent };
    })
  };
}
