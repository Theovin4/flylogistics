import OpenAI from "openai";
import { NextResponse } from "next/server";
import { rateLimit } from "@/server/rate-limit";

function getOpenAI() {
  if (!process.env.OPENAI_API_KEY) return null;
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for") ?? "local";
  const limit = await rateLimit(`ai:${ip}`);
  if (!limit.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });

  const { message } = await request.json();
  const client = getOpenAI();
  if (!client) {
    return NextResponse.json({
      reply:
        "OpenAI is not configured yet. Add OPENAI_API_KEY to enable live AI shipment recommendations, exception summaries, and routing guidance."
    });
  }

  const completion = await client.chat.completions.create({
    model: "gpt-4.1-mini",
    messages: [
      { role: "system", content: "You are Fly Logistics' AI logistics assistant. Be concise, operational, and safety-aware." },
      { role: "user", content: String(message ?? "") }
    ]
  });

  return NextResponse.json({ reply: completion.choices[0]?.message.content ?? "No recommendation available." });
}
