import { normalizeShipmentStatus, type ShipmentStatus, type ShipmentTimelineEvent } from "@/lib/shipments";

const carrierNamePattern = /\b(fez|sendbox|easyship|carrier|waybill|external|third[-\s]?party)\b/i;
const carrierReferencePattern = /\b(?!FLY-)[A-Z0-9]{10,}\b/;

function containsCarrierText(value: string) {
  return carrierNamePattern.test(value) || carrierReferencePattern.test(value);
}

function normalizeStatusText(value?: string | null) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

export function sanitizeTrackingCopyForCustomers(value?: string | null, fallback = "Fly Logistics status update") {
  const text = String(value ?? "").trim();
  if (!text) return text;
  return containsCarrierText(text) ? fallback : text;
}

export function mapCarrierStatusToFlyStatus(status?: string | null): ShipmentStatus | null {
  const normalized = normalizeStatusText(status);
  if (!normalized) return null;

  if (normalized.includes("cancel")) return "CANCELLED";
  if (normalized.includes("deliver") || normalized.includes("complete")) return "DELIVERED";
  if (normalized.includes("out_for_delivery") || normalized.includes("arriv")) return "ARRIVED";
  if (
    normalized.includes("transit") ||
    normalized.includes("en_route") ||
    normalized.includes("enroute") ||
    normalized.includes("dispatch") ||
    normalized.includes("moving") ||
    normalized.includes("linehaul") ||
    normalized.includes("hub") ||
    normalized.includes("forward")
  ) return "IN_TRANSIT";
  if (
    normalized.includes("picked") ||
    normalized.includes("pick_up_complete") ||
    normalized.includes("pickup_complete") ||
    normalized.includes("collected")
  ) return "PICKED_UP";
  if (normalized.includes("assign")) return "DRIVER_ASSIGNED";
  if (
    (normalized.includes("pending") && normalized.includes("pick")) ||
    (normalized.includes("await") && normalized.includes("pick")) ||
    (normalized.includes("ready") && normalized.includes("pick"))
  ) return "PENDING_PICKUP";
  if (
    normalized.includes("created") ||
    normalized.includes("create") ||
    normalized.includes("confirmed") ||
    normalized.includes("confirm") ||
    normalized.includes("book") ||
    normalized.includes("processed") ||
    normalized.includes("synced")
  ) return "CONFIRMED";
  if (normalized.includes("exception") || normalized.includes("hold") || normalized.includes("failed")) return "EXCEPTION";

  return null;
}

export function flyTrackingCopy(status?: string | null, carrierStatus?: string | null) {
  const statusText = String(status ?? "").trim();
  if (!statusText) {
    return {
      label: "Fly Logistics status update",
      description: sanitizeTrackingCopyForCustomers(carrierStatus, "Fly Logistics has received a new tracking update."),
      message: "Fly Logistics has received a new tracking update for this shipment."
    };
  }

  const rawStatus = statusText.toUpperCase();
  const normalized = normalizeShipmentStatus(status);

  if (rawStatus === "PENDING_PICKUP") {
    return {
      label: "Pickup being arranged",
      description: "Payment is confirmed. Fly Logistics is arranging pickup and the next movement update will appear here.",
      message: "Payment is confirmed. Fly Logistics is arranging pickup and will update this tracking page once collection starts."
    };
  }

  if (rawStatus === "EXCEPTION") {
    return {
      label: "Operations review",
      description: "Fly Logistics operations is reviewing this shipment and will update the route as soon as it is cleared.",
      message: "This shipment is under Fly Logistics operations review. Support will update you as soon as the next step is confirmed."
    };
  }

  switch (normalized) {
    case "PENDING":
      return {
        label: "Booking received",
        description: "Fly Logistics has received the booking and is preparing the shipment record for dispatch.",
        message: "Your booking has been received and is being prepared by Fly Logistics operations."
      };
    case "CONFIRMED":
      return {
        label: "Shipment confirmed",
        description: "Your shipment has been confirmed and is being prepared for pickup.",
        message: "Your shipment is confirmed and being prepared for pickup."
      };
    case "DRIVER_ASSIGNED":
      return {
        label: "Delivery partner assigned",
        description: "A Fly Logistics delivery partner has been assigned and pickup coordination is underway.",
        message: "A Fly Logistics delivery partner has been assigned to your shipment."
      };
    case "PICKED_UP":
      return {
        label: "Pickup completed",
        description: "Your package has been collected and entered the Fly Logistics delivery network.",
        message: "Your package has been picked up and is now in the Fly Logistics delivery network."
      };
    case "IN_TRANSIT":
      return {
        label: "Shipment moving",
        description: "Your package is moving through the Fly Logistics network toward the destination.",
        message: "Your shipment is moving through the Fly Logistics network. We will keep this page updated."
      };
    case "ARRIVED":
      return {
        label: "Arrived near destination",
        description: "Your package has reached the destination area and final delivery is being arranged.",
        message: "Your shipment has arrived near the delivery point and final delivery is being arranged."
      };
    case "DELIVERED":
      return {
        label: "Delivery completed",
        description: "Delivery is complete and securely recorded by Fly Logistics operations.",
        message: "Your shipment has been delivered successfully. Thank you for shipping with Fly Logistics."
      };
    case "CANCELLED":
      return {
        label: "Shipment cancelled",
        description: "This shipment has been cancelled. Fly Logistics support can help with next steps.",
        message: "This shipment has been cancelled. Contact Fly Logistics support if you need help."
      };
    default:
      return {
        label: "Fly Logistics status update",
        description: sanitizeTrackingCopyForCustomers(carrierStatus, "Fly Logistics has received a new tracking update."),
        message: "Fly Logistics has received a new tracking update for this shipment."
      };
  }
}

export function customerTrackingMessageForCarrierStatus(status?: string | null, carrierStatus?: string | null) {
  return flyTrackingCopy(status, carrierStatus).message;
}

export function makeFlyTrackingTimelineEvent(
  status?: string | null,
  location?: string | null,
  carrierStatus?: string | null,
  occurredAt?: string | null
): ShipmentTimelineEvent & { title: string; description: string } {
  const copy = flyTrackingCopy(status, carrierStatus);
  return {
    label: copy.label,
    title: copy.label,
    description: copy.description,
    location: location?.trim() || "Fly Logistics network",
    completed: true,
    occurred_at: occurredAt ?? new Date().toISOString()
  };
}
