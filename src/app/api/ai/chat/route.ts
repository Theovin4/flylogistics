import OpenAI from "openai";
import { NextResponse } from "next/server";
import { z } from "zod";
import { enforceRateLimit, parseJson } from "@/server/api";
import { logApiError, requestContext } from "@/server/monitoring";

const chatSchema = z.object({
  message: z.string().trim().min(1).max(2000)
});

function getOpenAI() {
  if (!process.env.OPENAI_API_KEY) return null;
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

export async function POST(request: Request) {
  const limited = await enforceRateLimit(request, "ai-chat", { limit: 20, windowSeconds: 60 });
  if (limited) return limited;

  const parsed = await parseJson(request, chatSchema, "Please enter a logistics question.");
  if (parsed.response) return parsed.response;

  const client = getOpenAI();
  if (!client) {
    return NextResponse.json({
      reply:
        "Fly Logistics AI recommendations are temporarily unavailable. Our team can still help with tracking, quotes, and routing guidance."
    });
  }

  try {
    const completion = await client.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        { role: "system", content: "You are Fly Logistics' AI logistics assistant. Be concise, operational, and safety-aware." },
        { role: "user", content: parsed.data.message }
      ]
    });

    return NextResponse.json({ reply: completion.choices[0]?.message.content ?? "No recommendation available." });
  } catch (error) {
    logApiError(error, "OpenAI assistant request failed.", requestContext(request));
    return NextResponse.json({
      reply: "AI recommendations are temporarily unavailable. Fly Logistics support can still help with tracking, quotes, and dispatch questions."
    }, { status: 202 });
  }
}
