import { NextResponse } from "next/server";
import { z } from "zod";
import { getGroq } from "@/lib/groq";

const chatSchema = z.object({
  message: z.string().trim().min(1).max(2000)
});

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
- If tracking is requested, ask for tracking ID.`,
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
