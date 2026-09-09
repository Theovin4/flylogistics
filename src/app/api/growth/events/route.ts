import { NextResponse } from "next/server";
import { z } from "zod";
import { getRequestProfile } from "@/lib/request-auth";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { enforceRateLimit, parseJson } from "@/server/api";
import { logApiError, requestContext } from "@/server/monitoring";
import { sendMetaConversion } from "@/server/meta-conversions";

export const dynamic = "force-dynamic";

const campaignEventSchema = z.object({
  eventName: z.string().trim().min(2).max(120),
  eventId: z.string().trim().min(8).max(180).optional(),
  anonymousId: z.string().trim().max(160).optional().nullable(),
  fbp: z.string().trim().max(255).optional().nullable(),
  fbc: z.string().trim().max(255).optional().nullable(),
  eventSourceUrl: z.string().trim().url().max(500).optional().nullable(),
  source: z.string().trim().max(120).optional().nullable(),
  medium: z.string().trim().max(120).optional().nullable(),
  campaign: z.string().trim().max(180).optional().nullable(),
  content: z.string().trim().max(180).optional().nullable(),
  term: z.string().trim().max(180).optional().nullable(),
  landingPage: z.string().trim().max(500).optional().nullable(),
  conversionValue: z.coerce.number().min(0).max(1_000_000_000).default(0),
  metadata: z.record(z.unknown()).optional().default({})
});

export async function POST(request: Request) {
  const limited = await enforceRateLimit(request, "growth-event", { limit: 40, windowSeconds: 60 });
  if (limited) return limited;

  const parsed = await parseJson(request, campaignEventSchema, "Invalid campaign event.");
  if (parsed.response) return parsed.response;

  const profile = await getRequestProfile(request).catch(() => ({ profile: null }));
  const eventId = parsed.data.eventId ?? `server-${crypto.randomUUID()}`;
  const metadata = parsed.data.metadata ?? {};
  const metaPromise = sendMetaConversion({
    request,
    eventName: parsed.data.eventName,
    eventId,
    eventSourceUrl: parsed.data.eventSourceUrl,
    value: parsed.data.conversionValue,
    currency: typeof metadata.currency === "string" ? metadata.currency : "NGN",
    anonymousId: parsed.data.anonymousId,
    fbp: parsed.data.fbp,
    fbc: parsed.data.fbc,
    profile: profile.profile
  });

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    await metaPromise;
    return NextResponse.json({ ok: true }, { status: 202 });
  }

  const { error } = await supabase.from("campaign_events").insert({
    user_id: profile.profile?.id ?? null,
    anonymous_id: parsed.data.anonymousId || null,
    event_name: parsed.data.eventName,
    source: parsed.data.source || null,
    medium: parsed.data.medium || null,
    campaign: parsed.data.campaign || null,
    content: parsed.data.content || null,
    term: parsed.data.term || null,
    landing_page: parsed.data.landingPage || request.headers.get("referer"),
    conversion_value: parsed.data.conversionValue,
    metadata: {
      ...metadata,
      userAgent: request.headers.get("user-agent")
    }
  });

  const meta = await metaPromise;
  if (error) {
    logApiError(error, "Unable to record campaign event.", requestContext(request));
    return NextResponse.json({ ok: true }, { status: 202 });
  }

  return NextResponse.json({ ok: true, meta: { configured: meta.configured, sent: meta.sent } }, { status: 201 });
}
