import { NextResponse } from "next/server";
import { z } from "zod";
import { getGroq } from "@/lib/groq";
import { fetchNormalizedShipment } from "@/lib/shipment-data";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { enforceRateLimit, parseJson } from "@/server/api";
import { logApiError, requestContext } from "@/server/monitoring";

const chatSchema = z.object({
  message: z.string().trim().min(1).max(2000)
});

function findTrackingId(message: string) {
  return message.match(/\bFLY-\d{4}-[A-Z0-9]{5,}\b/i)?.[0]?.toUpperCase() ?? null;
}

async function getShipmentContext(trackingId: string) {
  const { shipment, error } = await fetchNormalizedShipment(getSupabaseAdmin(), trackingId, { includeProof: false });
  if (error && typeof error !== "string") logApiError(error, "Unable to load shipment context for chat.", { trackingId });
  return shipment;
}

function supportSuggestion(message: string) {
  const normalized = message.toLowerCase();
  if (normalized.includes("delay") || normalized.includes("late")) {
    return "If your shipment is delayed, I can explain the current status with a tracking ID and suggest the next best action, including customer care escalation for urgent deliveries.";
  }
  if (normalized.includes("refund") || normalized.includes("dispute")) {
    return "For refund or dispute help, share your tracking ID or quote request reference. Fly Logistics customer care can review payment status, delivery attempts, and resolution options.";
  }
  if (normalized.includes("cod") || normalized.includes("cash on delivery")) {
    return "For cash-on-delivery questions, Fly Logistics can confirm shipment status, collection status, and customer care next steps. Please share your tracking ID.";
  }
  if (normalized.includes("price") || normalized.includes("quote") || normalized.includes("cost")) {
    return "For a delivery price, share pickup state, destination state, package type, estimated weight, and urgency. You can also use the quote page for an instant estimate.";
  }
  return null;
}

function fallbackReply(trackingId: string | null, shipmentContext: Awaited<ReturnType<typeof getShipmentContext>>, message = "") {
  if (shipmentContext) {
    const delayText = shipmentContext.status === "DELIVERED"
      ? "Delivery is complete and proof is securely reviewed by operations."
      : "If there is a delay, Fly Logistics operations will keep the timeline updated.";
    return `Tracking ${shipmentContext.trackingId} is currently ${shipmentContext.status.replaceAll("_", " ")}. Pickup: ${shipmentContext.pickupAddress}. Delivery: ${shipmentContext.deliveryAddress}. ETA: ${shipmentContext.eta}. Assigned driver: ${shipmentContext.assignedDriver?.name ?? "not assigned yet"}. ${delayText}`;
  }

  if (trackingId) {
    return `I could not find shipment ${trackingId} yet. Please confirm the tracking ID or contact Fly Logistics support so we can check the shipment record.`;
  }

  const suggestion = supportSuggestion(message);
  if (suggestion) return suggestion;

  return "I can help with shipment tracking, quote requests, pickup planning, delivery urgency, and package requirements. Please share a tracking ID or shipment details.";
}

export async function POST(req: Request) {
  let trackingId: string | null = null;
  let shipmentContext: Awaited<ReturnType<typeof getShipmentContext>> = null;

  try {
    const limited = await enforceRateLimit(req, "chat", { limit: 24, windowSeconds: 60 });
    if (limited) return limited;

    const parsed = await parseJson(req, chatSchema, "Please enter a logistics question.");
    if (parsed.response) return parsed.response;

    const groq = getGroq();
    trackingId = findTrackingId(parsed.data.message);
    shipmentContext = trackingId ? await getShipmentContext(trackingId) : null;

    if (!groq) {
      return NextResponse.json({ reply: fallbackReply(trackingId, shipmentContext, parsed.data.message), mode: "fallback" });
    }

    try {
      const response = await groq.chat.completions.create({
        messages: [
          {
            role: "system",
            content: `You are Fly Logistics AI, the official assistant for Fly Logistics.

Answer like a helpful logistics company representative.

Rules:
- Keep replies short and clear.
- Ask for pickup location, delivery location, package type, and urgency when needed.
- Do not mention DHL, FedEx, UPS, or other competitors unless the user asks.
- Focus on Fly Logistics services.
- If tracking is requested without a tracking ID, ask for tracking ID.
- If shipment context is provided below, answer from it and mention status, ETA, route, driver, and next step.
- For delays, explain likely operational reason from status and ETA; avoid blame.
- For support, suggest clear next steps: tracking lookup, quote request, WhatsApp/customer care, or support ticket.
- Delivery proof media is private and reviewed by operations; do not share proof image URLs.

Shipment context:
${shipmentContext ? JSON.stringify(shipmentContext) : trackingId ? `No shipment found for ${trackingId}.` : "No tracking ID provided."}`,
          },
          {
            role: "user",
            content: parsed.data.message,
          },
        ],
        model: "llama-3.3-70b-versatile",
      });

      return NextResponse.json({
        reply: response.choices[0]?.message?.content ?? fallbackReply(trackingId, shipmentContext, parsed.data.message),
      });
    } catch (error) {
      logApiError(error, "Groq chat failed; returning fallback reply.", requestContext(req, { trackingId }));
      return NextResponse.json({ reply: fallbackReply(trackingId, shipmentContext, parsed.data.message), mode: "fallback" });
    }
  } catch (error) {
    logApiError(error, "Chat route failed; returning fallback reply.", requestContext(req, { trackingId }));

    return NextResponse.json({ reply: fallbackReply(trackingId, shipmentContext), mode: "fallback" });
  }
}
