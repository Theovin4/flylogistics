"use client";

type ConversionEvent =
  | "quote_request_submitted"
  | "payment_initiated"
  | "payment_completed"
  | "shipment_created"
  | "wallet_funded"
  | "tracking_lookup"
  | "ai_chat_message"
  | "whatsapp_contact";

type ConversionPayload = Record<string, string | number | boolean | null | undefined>;

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
    fbq?: (...args: unknown[]) => void;
  }
}

const metaEventMap: Record<ConversionEvent, string> = {
  quote_request_submitted: "Lead",
  payment_initiated: "InitiateCheckout",
  payment_completed: "Purchase",
  shipment_created: "Purchase",
  wallet_funded: "WalletFunded",
  tracking_lookup: "Search",
  ai_chat_message: "Contact",
  whatsapp_contact: "Contact"
};

function anonymousId() {
  try {
    const key = "fly_logistics_visitor_id";
    const existing = window.localStorage.getItem(key);
    if (existing) return existing;
    const next = `fly-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    window.localStorage.setItem(key, next);
    return next;
  } catch {
    return undefined;
  }
}

function campaignContext() {
  const params = new URLSearchParams(window.location.search);
  const referrer = document.referrer;
  return {
    source: params.get("utm_source") ?? (referrer ? "referral" : "direct"),
    medium: params.get("utm_medium") ?? (referrer ? "referral" : "direct"),
    campaign: params.get("utm_campaign"),
    content: params.get("utm_content"),
    term: params.get("utm_term"),
    landingPage: window.location.href
  };
}

function cookieValue(name: string) {
  return document.cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1);
}

function safeMetaPayload(payload: ConversionPayload) {
  return Object.fromEntries(Object.entries(payload).filter(([key]) => [
    "content_category", "currency", "delivery_category", "has_driver", "message_length", "status", "urgency", "value"
  ].includes(key)));
}

function recordFlyGrowthEvent(eventName: ConversionEvent, payload: ConversionPayload, eventId: string) {
  try {
    const body = JSON.stringify({
      eventName,
      eventId,
      anonymousId: anonymousId(),
      fbp: cookieValue("_fbp"),
      fbc: cookieValue("_fbc"),
      eventSourceUrl: window.location.href,
      ...campaignContext(),
      conversionValue: Number(payload.value ?? payload.amount ?? 0) || 0,
      metadata: payload
    });

    if (navigator.sendBeacon) {
      navigator.sendBeacon("/api/growth/events", new Blob([body], { type: "application/json" }));
      return;
    }

    void fetch("/api/growth/events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      keepalive: true
    });
  } catch {
    // Analytics must never interrupt booking, tracking, or payment flows.
  }
}

export function trackConversion(eventName: ConversionEvent, payload: ConversionPayload = {}) {
  if (typeof window === "undefined") return;
  const eventId = `${eventName}-${crypto.randomUUID()}`;
  const metaPayload = safeMetaPayload(payload);

  window.gtag?.("event", eventName, {
    event_category: "conversion",
    ...payload
  });

  window.fbq?.("track", metaEventMap[eventName], metaPayload, { eventID: eventId });
  recordFlyGrowthEvent(eventName, payload, eventId);
}
