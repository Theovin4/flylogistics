import { cleanEnv } from "@/lib/env";
import type { QuoteRequestRecord, ShipmentRecord } from "@/lib/shipments";

const defaultWhatsAppNumber = "2348000000000";
const defaultAppUrl = "https://flylogistics.vercel.app";

type WhatsAppUrlInput = {
  phone?: string | null;
  message: string;
};

type QuoteMessageInput = Partial<Pick<
  QuoteRequestRecord,
  "request_id" | "customer_name" | "pickup_address" | "delivery_address" | "package_type" | "weight_kg" | "urgency" | "estimated_eta_hours"
>> & {
  customerName?: string;
  pickupAddress?: string;
  deliveryAddress?: string;
  packageType?: string;
  weightKg?: string | number;
};

type TrackingMessageInput = {
  trackingId?: string | null;
  status?: string | null;
  eta?: string | null;
  pickupAddress?: string | null;
  deliveryAddress?: string | null;
  assignedDriver?: { name?: string | null } | null;
};

function appUrl() {
  return (cleanEnv(process.env.NEXT_PUBLIC_APP_URL) ?? defaultAppUrl).replace(/\/$/, "");
}

export function normalizeWhatsAppPhone(phone?: string | null) {
  const digits = (phone ?? cleanEnv(process.env.NEXT_PUBLIC_WHATSAPP_NUMBER) ?? defaultWhatsAppNumber).replace(/[^\d]/g, "");
  return digits || defaultWhatsAppNumber;
}

export function shipmentTrackingUrl(trackingId?: string | null) {
  if (!trackingId) return `${appUrl()}/tracking`;
  return `${appUrl()}/tracking?trackingId=${encodeURIComponent(trackingId)}`;
}

export function buildWhatsAppUrl({ phone, message }: WhatsAppUrlInput) {
  return `https://wa.me/${normalizeWhatsAppPhone(phone)}?text=${encodeURIComponent(message)}`;
}

export function getWhatsAppUrl(message = whatsappMessages.generalSupport(), phone?: string | null) {
  return buildWhatsAppUrl({ phone, message });
}

function formatStatus(status?: string | null) {
  return String(status ?? "pending").replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function line(label: string, value?: string | number | null) {
  return value || value === 0 ? `${label}: ${value}` : null;
}

function compact(lines: Array<string | null | undefined>) {
  return lines.filter(Boolean).join("\n");
}

export const whatsappMessages = {
  generalSupport() {
    return "Hi Fly Logistics, I would like to chat with your team about a shipment.";
  },
  urgentDelivery() {
    return "Hi Fly Logistics, I need help with an urgent delivery request. Please connect me with the operations team.";
  },
  quoteRequest(input: QuoteMessageInput) {
    return compact([
      "Hi Fly Logistics, I would like a quote for a shipment.",
      line("Name", input.customerName ?? input.customer_name),
      line("Pickup", input.pickupAddress ?? input.pickup_address),
      line("Delivery", input.deliveryAddress ?? input.delivery_address),
      line("Package", input.packageType ?? input.package_type),
      line("Weight", input.weightKg ?? input.weight_kg),
      line("Urgency", input.urgency),
      "Please confirm availability and next steps."
    ]);
  },
  quoteReceived(input: QuoteMessageInput) {
    return compact([
      "Hi Fly Logistics, I submitted a booking request.",
      line("Request reference", input.request_id),
      line("Pickup", input.pickupAddress ?? input.pickup_address),
      line("Delivery", input.deliveryAddress ?? input.delivery_address),
      line("Package", input.packageType ?? input.package_type),
      line("Estimated ETA", input.estimated_eta_hours ? `${input.estimated_eta_hours}h` : null),
      "Please confirm the next step."
    ]);
  },
  trackingHelp(trackingId?: string | null) {
    return compact([
      "Hi Fly Logistics, I need help tracking a shipment.",
      line("Tracking ID", trackingId),
      trackingId ? `Tracking link: ${shipmentTrackingUrl(trackingId)}` : "Please help me find my tracking details."
    ]);
  },
  trackingStatus(input: TrackingMessageInput) {
    return compact([
      "Hi Fly Logistics, I need an update on this shipment.",
      line("Tracking ID", input.trackingId),
      line("Status", formatStatus(input.status)),
      line("ETA", input.eta),
      line("Pickup", input.pickupAddress),
      line("Delivery", input.deliveryAddress),
      line("Driver", input.assignedDriver?.name),
      input.trackingId ? `Tracking link: ${shipmentTrackingUrl(input.trackingId)}` : null
    ]);
  },
  notifyCustomer(shipment: ShipmentRecord) {
    return compact([
      `Hello ${shipment.customer_name ?? "there"}, this is Fly Logistics.`,
      `Your shipment ${shipment.tracking_id} is currently ${formatStatus(shipment.status)}.`,
      line("Pickup", shipment.pickup_address),
      line("Delivery", shipment.delivery_address),
      line("ETA", shipment.eta ?? "pending"),
      `Track here: ${shipmentTrackingUrl(shipment.tracking_id)}`
    ]);
  },
  sendTrackingId(shipment: ShipmentRecord) {
    return compact([
      `Hello ${shipment.customer_name ?? "there"}, your Fly Logistics tracking ID is ${shipment.tracking_id}.`,
      line("Package", shipment.package_type),
      line("Status", formatStatus(shipment.status)),
      `Track your shipment here: ${shipmentTrackingUrl(shipment.tracking_id)}`
    ]);
  },
  deliveryUpdate(shipment: ShipmentRecord) {
    return compact([
      `Fly Logistics delivery update for ${shipment.tracking_id}: ${formatStatus(shipment.status)}.`,
      line("ETA", shipment.eta ?? "pending"),
      line("Driver", shipment.assigned_driver?.name),
      line("Delivery address", shipment.delivery_address),
      `Live tracking: ${shipmentTrackingUrl(shipment.tracking_id)}`
    ]);
  },
  proofOfDelivery(shipment: ShipmentRecord) {
    return compact([
      `Fly Logistics proof of delivery update for ${shipment.tracking_id}.`,
      shipment.proof_image_url ? `Proof image: ${shipment.proof_image_url}` : "Proof of delivery is being reviewed.",
      `Shipment record: ${shipmentTrackingUrl(shipment.tracking_id)}`
    ]);
  }
} as const;
