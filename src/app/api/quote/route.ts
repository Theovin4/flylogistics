import { NextResponse } from "next/server";
import { z } from "zod";
import { createQuote } from "@/server/actions/shipments";
import { enforceRateLimit, handleApiError, parseJson } from "@/server/api";

const quoteSchema = z.object({
  origin: z.string().trim().min(2).max(180),
  destination: z.string().trim().min(2).max(180),
  weightKg: z.coerce.number().positive().max(100000),
  cargoValue: z.coerce.number().nonnegative().max(100000000),
  urgency: z.enum(["standard", "priority", "critical"]).default("standard")
});

export async function POST(request: Request) {
  const limited = await enforceRateLimit(request, "quote", { limit: 20, windowSeconds: 60 });
  if (limited) return limited;

  const parsed = await parseJson(request, quoteSchema, "Please complete the instant quote form.");
  if (parsed.response) return parsed.response;

  try {
    const quote = await createQuote(parsed.data);
    return NextResponse.json(quote);
  } catch (error) {
    return handleApiError(error, request, "Unable to calculate this quote.");
  }
}
