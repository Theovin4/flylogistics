import { NextResponse } from "next/server";
import { z } from "zod";
import { getGroq } from "@/lib/groq";
import { normalizeShipment, type ShipmentRecord } from "@/lib/shipments";
import { getSupabaseAdmin } from "@/lib/supabase-server";

const chatSchema = z.object({
  message: z.string().trim().min(1).max(2000)
});

function findTrackingId(message: string) {
  return message.match(/\bFLY-\d{4}-[A-Z0-9]{5,}\b/i)?.[0]?.toUpperCase() ?? null;
}

async function getShipmentContext(trackingId: string) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("shipments")
    .select("*, assigned_driver:drivers(id,name,status,phone,photo_url,latitude,longitude)")
    .eq("tracking_id", trackingId)
    .maybeSingle();

  if (error || !data) {
    if (error) console.error(error);
    return null;
  }

  return normalizeShipment(data as ShipmentRecord);
}

export async function POST(req: Request) {
  try {
    const parsed = chatSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Please enter a logistics question." }, { status: 400 });
    }

    const groq = getGroq();
    if (!groq) {
      return NextResponse.json(
        { error: "Groq is not configured. Add GROQ_API_KEY to your environment variables." },
        { status: 503 }
      );
    }

    const trackingId = findTrackingId(parsed.data.message);
    const shipmentContext = trackingId ? await getShipmentContext(trackingId) : null;

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
      reply: response.choices[0]?.message?.content ?? "I could not generate a response. Please try again.",
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 }
    );
  }
}
