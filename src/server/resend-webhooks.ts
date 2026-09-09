import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

function clean(value: string | undefined | null) { return value?.trim() || undefined; }

export function verifyResendWebhook(rawBody: string, headers: Headers) {
  // SIGNING_SECRET is retained as a deployment-compatible alias for the
  // Resend dashboard's webhook signing secret. Prefer the provider-specific
  // name for new environments to avoid ambiguity between webhook providers.
  const secret = clean(process.env.RESEND_WEBHOOK_SECRET) || clean(process.env.SIGNING_SECRET);
  if (!secret) return { ok: false as const, status: 503, error: "Resend webhook verification is not configured." };
  const id = headers.get("svix-id");
  const timestamp = headers.get("svix-timestamp");
  const signatureHeader = headers.get("svix-signature");
  if (!id || !timestamp || !signatureHeader) return { ok: false as const, status: 401, error: "Missing Resend webhook signature." };
  const timestampNumber = Number(timestamp);
  if (!Number.isFinite(timestampNumber) || Math.abs(Date.now() / 1000 - timestampNumber) > 300) return { ok: false as const, status: 401, error: "Expired Resend webhook signature." };
  try {
    const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
    const expected = createHmac("sha256", key).update(`${id}.${timestamp}.${rawBody}`).digest("base64");
    const valid = signatureHeader.split(" ").some((entry) => {
      const candidate = entry.startsWith("v1,") ? entry.slice(3) : "";
      const left = Buffer.from(candidate); const right = Buffer.from(expected);
      return left.length === right.length && timingSafeEqual(left, right);
    });
    return valid ? { ok: true as const, eventId: id } : { ok: false as const, status: 401, error: "Invalid Resend webhook signature." };
  } catch { return { ok: false as const, status: 401, error: "Invalid Resend webhook signature." }; }
}

export async function getReceivedEmail(emailId: string) {
  const apiKey = clean(process.env.RESEND_API_KEY);
  if (!apiKey) throw new Error("Resend API key is not configured.");
  const response = await fetch(`https://api.resend.com/emails/receiving/${encodeURIComponent(emailId)}`, { headers: { Authorization: `Bearer ${apiKey}` }, cache: "no-store" });
  const body = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (!response.ok) throw new Error(typeof body?.message === "string" ? body.message : `Unable to retrieve received email (${response.status}).`);
  return body ?? {};
}

export function senderAddress(value: unknown) {
  const raw = String(value ?? "").trim();
  return raw.match(/<([^>]+)>/)?.[1]?.toLowerCase() ?? raw.toLowerCase();
}
