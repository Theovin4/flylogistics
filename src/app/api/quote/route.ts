import { NextResponse } from "next/server";
import { createQuote } from "@/server/actions/shipments";
import { rateLimit } from "@/server/rate-limit";

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for") ?? "local";
  const limit = await rateLimit(`quote:${ip}`);
  if (!limit.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });

  const body = await request.json();
  const quote = await createQuote(body);
  return NextResponse.json(quote);
}
