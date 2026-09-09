import { cleanEnv } from "@/lib/env";
import type { QuoteRequestRecord, ShipmentRecord } from "@/lib/shipments";

const defaultWhatsAppNumber = "2347061072929";
const defaultAppUrl = "https://flylogistics.com.ng";

type WhatsAppUrlInput = {
  phone?: string | null;
  message: string;
};

type QuoteMessageInput = Partial<Pick<
  QuoteRequestRecord,
  "request_id" | "customer_name" | "pickup_country" | "destination_country" | "pickup_address" | "delivery_address" | "delivery_category" | "package_type" | "weight_kg" | "urgency" | "estimated_price" | "estimated_eta_hours" | "quoted_price" | "quoted_eta_hours" | "quoted_eta_label" | "payment_amount"
>> & {
  customerName?: string;
  pickupCountry?: string;
  destinationCountry?: string;
  pickupAddress?: string;
  deliveryAddress?: string;
  deliveryCategory?: string;
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

type PaymentMessageInput = {
  request_id?: string | null;
  tracking_id?: string | null;
  customer_name?: string | null;
  payment_amount?: string | number | null;
  payment_reference?: string | null;
  payment_provider?: string | null;
};

function appUrl() {
  return (cleanEnv(process.env.NEXT_PUBLIC_APP_URL) ?? defaultAppUrl).replace(/\/$/, "");
}

export function normalizeWhatsAppPhone(phone?: string | null) {
  const source = String(phone ?? cleanEnv(process.env.NEXT_PUBLIC_WHATSAPP_NUMBER) ?? defaultWhatsAppNumber).trim();
  const digits = source.replace(/[^\d]/g, "");
  if (!digits) return defaultWhatsAppNumber;
  if (source.startsWith("+")) return digits;
  if (digits.startsWith("00") && digits.length > 4) return digits.slice(2);
  if (digits.startsWith("234")) return digits;
  if (digits.length === 11 && digits.startsWith("0")) return `234${digits.slice(1)}`;
  if (digits.length === 10 && /^[789]/.test(digits)) return `234${digits}`;
  return digits;
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
      line("Delivery type", input.deliveryCategory ?? input.delivery_category),
      line("Origin country", input.pickupCountry ?? input.pickup_country),
      line("Destination country", input.destinationCountry ?? input.destination_country),
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
  quoteApproved(input: QuoteMessageInput) {
    const amount = input.quoted_price ?? input.payment_amount ?? input.estimated_price;
    const eta = input.quoted_eta_label ?? (input.quoted_eta_hours ? `${input.quoted_eta_hours}h` : null) ?? (input.estimated_eta_hours ? `${input.estimated_eta_hours}h` : null);
    return compact([
      `Hello ${input.customer_name ?? input.customerName ?? "there"}, Fly Logistics has sent your delivery quote.`,
      line("Request reference", input.request_id),
      line("Price", amount ? `NGN ${Number(amount).toLocaleString("en-NG")}` : null),
      line("ETA", eta),
      line("Pickup", input.pickupAddress ?? input.pickup_address),
      line("Delivery", input.deliveryAddress ?? input.delivery_address),
      "Please accept the quote in your customer account and complete payment so operations can confirm dispatch."
    ]);
  },
  quoteRejected(input: QuoteMessageInput) {
    return compact([
      `Hello ${input.customer_name ?? input.customerName ?? "there"}, Fly Logistics has reviewed your booking request.`,
      line("Request reference", input.request_id),
      "We could not approve this request as submitted. Please contact operations so we can help with an alternative plan."
    ]);
  },
  quoteAccepted(input: QuoteMessageInput) {
    const amount = input.quoted_price ?? input.payment_amount ?? input.estimated_price;
    return compact([
      `Hello ${input.customer_name ?? input.customerName ?? "there"}, Fly Logistics has recorded your quote acceptance.`,
      line("Request reference", input.request_id),
      line("Amount", amount ? `NGN ${Number(amount).toLocaleString("en-NG")}` : null),
      "Please complete payment from your customer account so operations can prepare pickup."
    ]);
  },
  walletFunded(input: { customer_name?: string | null; amount?: string | number | null; currency?: string | null; reference?: string | null }) {
    return compact([
      `Hello ${input.customer_name ?? "there"}, your Fly Logistics wallet has been funded successfully.`,
      line("Amount", input.amount ? `${input.currency ?? "NGN"} ${Number(input.amount).toLocaleString("en-NG")}` : null),
      line("Reference", input.reference),
      "You can now pay for bookings from your customer dashboard."
    ]);
  },
  quoteConverted(shipment: ShipmentRecord) {
    return compact([
      `Hello ${shipment.customer_name ?? "there"}, your Fly Logistics booking is now a shipment.`,
      line("Tracking ID", shipment.tracking_id),
      line("Status", formatStatus(shipment.status)),
      line("ETA", shipment.eta ?? "pending"),
      `Track here: ${shipmentTrackingUrl(shipment.tracking_id)}`
    ]);
  },
  shipmentConfirmed(shipment: ShipmentRecord) {
    return compact([
      `Hello ${shipment.customer_name ?? "there"}, your Fly Logistics shipment is confirmed.`,
      line("Tracking ID", shipment.tracking_id),
      line("Package", shipment.package_type),
      line("Pickup", shipment.pickup_address),
      line("Delivery", shipment.delivery_address),
      line("ETA", shipment.eta ?? "pending"),
      `Track here: ${shipmentTrackingUrl(shipment.tracking_id)}`
    ]);
  },
  shipmentAccepted(shipment: ShipmentRecord) {
    return compact([
      `Hello ${shipment.customer_name ?? "there"}, Fly Logistics has accepted your shipment request.`,
      line("Tracking ID", shipment.tracking_id),
      line("Package", shipment.package_type),
      line("Pickup", shipment.pickup_address),
      line("Delivery", shipment.delivery_address),
      line("ETA", shipment.eta ?? "pending"),
      `Track here: ${shipmentTrackingUrl(shipment.tracking_id)}`
    ]);
  },
  driverAssigned(shipment: ShipmentRecord) {
    return compact([
      `Hello ${shipment.customer_name ?? "there"}, a Fly Logistics driver has been assigned.`,
      line("Tracking ID", shipment.tracking_id),
      line("Driver", shipment.assigned_driver?.name),
      line("Driver status", shipment.assigned_driver?.status),
      line("ETA", shipment.eta ?? "pending"),
      `Track here: ${shipmentTrackingUrl(shipment.tracking_id)}`
    ]);
  },
  shipmentPickedUp(shipment: ShipmentRecord) {
    return compact([
      `Fly Logistics pickup confirmation for ${shipment.tracking_id}.`,
      "Your package has been picked up and is now in our delivery workflow.",
      line("Driver", shipment.assigned_driver?.name),
      line("ETA", shipment.eta ?? "pending"),
      `Track here: ${shipmentTrackingUrl(shipment.tracking_id)}`
    ]);
  },
  inTransitUpdate(shipment: ShipmentRecord) {
    return compact([
      `Fly Logistics in-transit update for ${shipment.tracking_id}.`,
      "Your shipment is moving through the Fly Logistics network.",
      line("ETA", shipment.eta ?? "pending"),
      line("Driver", shipment.assigned_driver?.name),
      `Live tracking: ${shipmentTrackingUrl(shipment.tracking_id)}`
    ]);
  },
  approachingDestination(shipment: ShipmentRecord) {
    return compact([
      `Fly Logistics update for ${shipment.tracking_id}.`,
      "Your shipment is approaching the destination area.",
      line("ETA", shipment.eta ?? "pending"),
      line("Driver", shipment.assigned_driver?.name),
      `Live tracking: ${shipmentTrackingUrl(shipment.tracking_id)}`
    ]);
  },
  deliveredConfirmation(shipment: ShipmentRecord) {
    return compact([
      `Fly Logistics delivered confirmation for ${shipment.tracking_id}.`,
      "Your shipment has been marked delivered.",
      shipment.proof_image_url ? "Delivery completion has been securely recorded by Fly Logistics operations." : "Delivery completion will be confirmed by Fly Logistics operations.",
      `Shipment record: ${shipmentTrackingUrl(shipment.tracking_id)}`
    ]);
  },
  failedDelivery(shipment: ShipmentRecord) {
    return compact([
      `Fly Logistics delivery update for ${shipment.tracking_id}.`,
      "This delivery needs attention from our operations team.",
      line("Status", formatStatus(shipment.status)),
      line("ETA", shipment.eta ?? "pending"),
      "A Fly Logistics coordinator will follow up with the next step.",
      `Shipment record: ${shipmentTrackingUrl(shipment.tracking_id)}`
    ]);
  },
  paymentConfirmation(input: PaymentMessageInput) {
    return compact([
      `Hello ${input.customer_name ?? "there"}, Fly Logistics has confirmed your payment.`,
      line("Request reference", input.request_id),
      line("Tracking ID", input.tracking_id),
      line("Amount", input.payment_amount),
      line("Payment reference", input.payment_reference),
      input.payment_provider ? line("Payment method", "Secure checkout") : null,
      input.tracking_id ? `Track here: ${shipmentTrackingUrl(input.tracking_id)}` : "Operations will continue preparing your booking."
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
      `Fly Logistics delivery completion update for ${shipment.tracking_id}.`,
      shipment.proof_image_url ? "Delivery proof has been securely recorded by operations." : "Delivery completion is being reviewed.",
      `Shipment record: ${shipmentTrackingUrl(shipment.tracking_id)}`
    ]);
  }
} as const;
