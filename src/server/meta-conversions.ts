import { createHash } from "node:crypto";
import { cleanEnv } from "@/lib/env";
import type { AuthProfile } from "@/lib/request-auth";
import { siteConfig } from "@/lib/site";
import { logWarn } from "@/server/monitoring";

const metaEventNames: Record<string, string> = {
  ai_chat_message: "Contact",
  payment_completed: "Purchase",
  payment_initiated: "InitiateCheckout",
  quote_request_submitted: "Lead",
  shipment_created: "Purchase",
  tracking_lookup: "Search",
  wallet_funded: "WalletFunded",
  whatsapp_contact: "Contact"
};

type MetaConversionInput = {
  request: Request;
  eventName: string;
  eventId: string;
  eventSourceUrl?: string | null;
  value?: number;
  currency?: string | null;
  anonymousId?: string | null;
  fbp?: string | null;
  fbc?: string | null;
  profile?: AuthProfile | null;
};

function sha256(value?: string | null) {
  const normalized = value?.trim().toLowerCase();
  return normalized ? createHash("sha256").update(normalized).digest("hex") : undefined;
}

function normalizedPhone(value?: string | null) {
  return value?.replace(/\D/g, "") || undefined;
}

function safeSourceUrl(value?: string | null) {
  try {
    const url = new URL(value || siteConfig.url);
    const canonicalHost = new URL(siteConfig.url).host;
    if (url.protocol !== "https:" || url.host !== canonicalHost) return siteConfig.url;
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return siteConfig.url;
  }
}

function forwardedIp(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? request.headers.get("x-real-ip")?.trim()
    ?? undefined;
}

export function metaConversionsConfigured() {
  return Boolean(cleanEnv(process.env.META_CONVERSIONS_API_ACCESS_TOKEN));
}

export async function sendMetaConversion(input: MetaConversionInput) {
  const accessToken = cleanEnv(process.env.META_CONVERSIONS_API_ACCESS_TOKEN);
  const pixelId = cleanEnv(process.env.META_PIXEL_ID)
    ?? cleanEnv(process.env.NEXT_PUBLIC_META_PIXEL_ID)
    ?? "2062991460969957";
  const mappedEvent = metaEventNames[input.eventName];
  if (!accessToken || !mappedEvent) return { sent: false, configured: Boolean(accessToken) };

  const nameParts = input.profile?.full_name?.trim().split(/\s+/) ?? [];
  const userData = {
    client_ip_address: forwardedIp(input.request),
    client_user_agent: input.request.headers.get("user-agent") ?? undefined,
    em: input.profile?.email ? [sha256(input.profile.email)] : undefined,
    ph: input.profile?.phone ? [sha256(normalizedPhone(input.profile.phone))] : undefined,
    fn: nameParts[0] ? [sha256(nameParts[0])] : undefined,
    ln: nameParts.length > 1 ? [sha256(nameParts.at(-1))] : undefined,
    external_id: input.profile?.id
      ? [sha256(input.profile.id)]
      : input.anonymousId
        ? [sha256(input.anonymousId)]
        : undefined,
    fbp: input.fbp || undefined,
    fbc: input.fbc || undefined
  };

  const customData = input.value && input.value > 0
    ? { value: input.value, currency: (input.currency || "NGN").toUpperCase() }
    : undefined;

  try {
    const response = await fetch(`https://graph.facebook.com/v25.0/${encodeURIComponent(pixelId)}/events`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        data: [{
          event_name: mappedEvent,
          event_time: Math.floor(Date.now() / 1000),
          event_id: input.eventId,
          event_source_url: safeSourceUrl(input.eventSourceUrl),
          action_source: "website",
          user_data: userData,
          custom_data: customData
        }],
        test_event_code: cleanEnv(process.env.META_CONVERSIONS_API_TEST_EVENT_CODE)
      }),
      signal: AbortSignal.timeout(8_000)
    });
    const result: { events_received?: number; error?: { message?: string } } = await response.json().catch(() => ({}));
    if (!response.ok) {
      logWarn("Meta Conversions API rejected an event.", {
        eventName: mappedEvent,
        status: response.status,
        providerMessage: typeof result?.error?.message === "string" ? result.error.message : "Provider request failed"
      });
      return { sent: false, configured: true, status: response.status };
    }
    return { sent: true, configured: true, eventsReceived: Number(result?.events_received ?? 0) };
  } catch (error) {
    logWarn("Meta Conversions API request failed without affecting the customer flow.", {
      eventName: mappedEvent,
      reason: error instanceof Error ? error.message : "Unknown provider error"
    });
    return { sent: false, configured: true };
  }
}
