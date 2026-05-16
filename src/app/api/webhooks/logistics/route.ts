import { headers } from "next/headers";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const headerStore = await headers();
  const signature = headerStore.get("x-fly-signature");
  if (process.env.WEBHOOK_SECRET && signature !== process.env.WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }
  const event = await request.json();
  return NextResponse.json({ received: true, eventType: event.type ?? "unknown" });
}

export async function GET() {
  return NextResponse.json({ ok: true, job: "logistics-health-check" });
}
