import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { cleanEnv } from "@/lib/env";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { apiError, MAX_JSON_BODY_BYTES } from "@/server/api";
import { logApiError, logInfo, logWarn, requestContext } from "@/server/monitoring";
import { writeOperationalEvent } from "@/server/operational-events";
import { parseWhatsAppWebhookPayload, processWhatsAppWebhookEvent } from "@/server/notifications/whatsapp-inbox";

export const dynamic = "force-dynamic";

function webhookVerifyToken() {
  return cleanEnv(process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN) ?? cleanEnv(process.env.WHATSAPP_VERIFY_TOKEN);
}

function webhookAppSecret() {
  return cleanEnv(process.env.WHATSAPP_APP_SECRET) ?? cleanEnv(process.env.META_APP_SECRET);
}

function safeTimingEqual(left?: string | null, right?: string | null) {
  if (!left || !right) return false;
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function verifySignature(rawBody: string, header: string | null, appSecret?: string) {
  if (!appSecret) {
    return { ok: false, configured: false, reason: "Meta app secret is not configured." };
  }

  if (!header?.startsWith("sha256=")) {
    return { ok: false, configured: true, reason: "Missing WhatsApp webhook signature." };
  }

  const expected = `sha256=${crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex")}`;
  return {
    ok: safeTimingEqual(header, expected),
    configured: true,
    reason: "Invalid WhatsApp webhook signature."
  };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const verifyToken = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  const configuredToken = webhookVerifyToken();

  if (mode === "subscribe" && challenge !== null && safeTimingEqual(verifyToken, configuredToken)) {
    logInfo("Accepted WhatsApp webhook verification.", requestContext(request, {
      mode,
      challengePresent: true,
      verifyTokenConfigured: Boolean(configuredToken)
    }));
    return new Response(challenge, {
      status: 200,
      headers: { "Content-Type": "text/plain; charset=utf-8" }
    });
  }

  logWarn("Rejected WhatsApp webhook verification.", requestContext(request, {
    mode,
    tokenConfigured: Boolean(configuredToken),
    challengePresent: challenge !== null
  }));
  return new Response("Forbidden", { status: 403 });
}

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_JSON_BODY_BYTES) {
    logWarn("Rejected oversized WhatsApp webhook payload.", requestContext(request, { contentLength, maxBytes: MAX_JSON_BODY_BYTES }));
    return apiError("Webhook payload is too large.", { status: 413 });
  }

  const rawBody = await request.text().catch(() => "");
  if (!rawBody || rawBody.length > MAX_JSON_BODY_BYTES) {
    logWarn("Rejected empty or oversized WhatsApp webhook body.", requestContext(request, { bytes: rawBody.length }));
    return apiError("Invalid WhatsApp webhook payload.", { status: rawBody.length > MAX_JSON_BODY_BYTES ? 413 : 400 });
  }

  const signature = verifySignature(rawBody, request.headers.get("x-hub-signature-256"), webhookAppSecret());
  if (!signature.ok) {
    logWarn("Rejected WhatsApp webhook signature.", requestContext(request, {
      signatureConfigured: signature.configured,
      signaturePresent: Boolean(request.headers.get("x-hub-signature-256")),
      reason: signature.reason
    }));
    return apiError(signature.configured ? "Invalid webhook signature." : "WhatsApp webhook signature verification is not configured.", {
      status: signature.configured ? 401 : 503
    });
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    logWarn("Rejected WhatsApp webhook with invalid JSON.", requestContext(request));
    return apiError("Invalid WhatsApp webhook payload.", { status: 400 });
  }

  const event = parseWhatsAppWebhookPayload(body);
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    logWarn("WhatsApp webhook received while Supabase admin client is unavailable.", requestContext(request, {
      messageCount: event.messages.length,
      statusCount: event.statuses.length
    }));
    return NextResponse.json({ ok: true, warning: "Webhook accepted; persistence unavailable." }, { status: 202 });
  }

  try {
    const result = await processWhatsAppWebhookEvent(supabase, event, request);
    logInfo("Received WhatsApp Cloud webhook.", requestContext(request, {
      object: event.object,
      messageCount: event.messages.length,
      statusCount: event.statuses.length,
      signatureVerified: signature.configured,
      ...result
    }));

    return NextResponse.json({
      ok: true,
      webhook: "whatsapp",
      messages: event.messages.length,
      statuses: event.statuses.length,
      ...result
    });
  } catch (error) {
    logApiError(error, "WhatsApp webhook processing failed.", requestContext(request, {
      messageCount: event.messages.length,
      statusCount: event.statuses.length
    }));
    await writeOperationalEvent(supabase, {
      category: "notification",
      severity: "error",
      message: "WhatsApp Cloud webhook processing failed.",
      entityType: "whatsapp_webhook",
      entityId: event.messages[0]?.id ?? event.statuses[0]?.id ?? null,
      metadata: {
        provider: "whatsapp_cloud_api",
        messageCount: event.messages.length,
        statusCount: event.statuses.length,
        reason: error instanceof Error ? error.message : String(error)
      },
      request
    });
    return apiError("Unable to process WhatsApp webhook.", { status: 500 });
  }
}
