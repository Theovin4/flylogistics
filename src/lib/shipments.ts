export const shipmentStatuses = [
  "QUOTE_REQUESTED",
  "BOOKED",
  "ASSIGNED",
  "PICKED_UP",
  "IN_TRANSIT",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "EXCEPTION",
  "CANCELLED"
] as const;

export type ShipmentStatus = (typeof shipmentStatuses)[number];

export type DriverSummary = {
  id: number | string;
  name: string;
  status?: string | null;
  phone?: string | null;
  photo_url?: string | null;
  latitude?: number | null;
  longitude?: number | null;
};

export type ShipmentTimelineEvent = {
  label: string;
  location?: string;
  completed: boolean;
  occurred_at?: string;
};

export type ShipmentRecord = {
  id: number | string;
  tracking_id: string;
  status: ShipmentStatus | string;
  pickup_address: string;
  delivery_address: string;
  package_type: string;
  customer_name?: string | null;
  customer_email?: string | null;
  customer_phone?: string | null;
  urgency?: string | null;
  weight_kg?: number | null;
  quoted_price?: number | null;
  eta?: string | null;
  current_lat?: number | null;
  current_lng?: number | null;
  proof_image_url?: string | null;
  package_image_url?: string | null;
  driver_id?: number | string | null;
  assigned_driver?: DriverSummary | null;
  timeline?: ShipmentTimelineEvent[] | null;
  created_at?: string;
  updated_at?: string;
};

export type QuoteRequestRecord = {
  id: number | string;
  request_id: string;
  customer_name: string;
  customer_email: string;
  customer_phone?: string | null;
  pickup_address: string;
  delivery_address: string;
  package_type: string;
  weight_kg: number;
  urgency: string;
  notes?: string | null;
  estimated_price: number;
  estimated_eta_hours: number;
  status: string;
  created_at?: string;
};

export function makeTrackingId() {
  return `FLY-${new Date().getFullYear()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

export function makeRequestId() {
  return `REQ-${Math.random().toString(36).slice(2, 9).toUpperCase()}`;
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

export function normalizeShipment(record: ShipmentRecord) {
  const driver = record.assigned_driver;
  return {
    trackingId: record.tracking_id,
    status: record.status,
    eta: record.eta ?? "Pending ETA",
    confidence: record.status === "DELIVERED" ? 100 : record.status === "EXCEPTION" ? 62 : 94,
    pickupAddress: record.pickup_address,
    deliveryAddress: record.delivery_address,
    packageType: record.package_type,
    urgency: record.urgency ?? "standard",
    customerName: record.customer_name,
    proofImageUrl: record.proof_image_url,
    packageImageUrl: record.package_image_url,
    assignedDriver: driver
      ? {
          id: driver.id,
          name: driver.name,
          status: driver.status ?? "Assigned",
          phone: driver.phone,
          photoUrl: driver.photo_url
        }
      : null,
    vehicle: {
      id: driver?.id ? String(driver.id) : "Unassigned",
      lat: Number(record.current_lat ?? driver?.latitude ?? 6.5244),
      lng: Number(record.current_lng ?? driver?.longitude ?? 3.3792),
      speedKph: record.status === "IN_TRANSIT" ? 68 : 0
    },
    events: record.timeline?.length
      ? record.timeline
      : [
          { label: "Shipment created", location: record.pickup_address, completed: true },
          { label: String(record.status).replaceAll("_", " "), location: record.delivery_address, completed: record.status === "DELIVERED" }
        ]
  };
}
