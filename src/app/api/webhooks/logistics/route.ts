import { NextResponse } from "next/server";
import { z } from "zod";
import { cleanEnv } from "@/lib/env";
import { enforceRateLimit, parseJson } from "@/server/api";
import { logError, logInfo, requestContext } from "@/server/monitoring";
import { verifySharedWebhookSecret } from "@/server/webhook-security";

export const runtime = "nodejs";

const logisticsWebhookSchema = z.object({
  type: z.string().trim().min(1).max(120).optional(),
  id: z.string().trim().max(160).optional(),
  data: z.record(z.unknown()).optional()
}).passthrough();

export async function POST(request: Request) {
  const limited = await enforceRateLimit(request, "logistics-webhook", { limit: 120, windowSeconds: 60 });
  if (limited) return limited;

  const verification = verifySharedWebhookSecret({
    request,
    secret: cleanEnv(process.env.WEBHOOK_SECRET),
    providerName: "Logistics"
  });
  if (!verification.ok) {
    return NextResponse.json({ error: verification.error }, { status: verification.status ?? 401 });
  }

  const parsed = await parseJson(request, logisticsWebhookSchema, "Invalid webhook payload.");
  if (parsed.response) {
    logError(new Error("Invalid logistics webhook payload."), "Invalid logistics webhook JSON.", requestContext(request));
    return parsed.response;
  }

  const event = parsed.data;
  logInfo("Received logistics webhook.", requestContext(request, { eventType: event.type ?? "unknown" }));
  return NextResponse.json({ received: true, eventType: event.type ?? "unknown" });
}

export async function GET() {
  return NextResponse.json({ ok: true, job: "logistics-health-check" });
}
