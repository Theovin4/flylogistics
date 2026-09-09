import { createHmac, timingSafeEqual } from "node:crypto";
import { cleanEnv } from "@/lib/env";

type WebhookVerificationOptions = {
  request: Request;
  rawBody?: string;
  secret: string | undefined;
  providerName: string;
  secretHeaders?: string[];
  signatureHeaders?: string[];
  queryParams?: string[];
};

type WebhookVerificationResult =
  | { ok: true; warning?: string }
  | { ok: false; status: number; error: string };

function secureCompare(left: string | null | undefined, right: string) {
  if (!left) return false;
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function bearerValue(header: string | null) {
  return header?.replace(/^bearer\s+/i, "").trim() ?? null;
}

function normalizeSignature(value: string | null) {
  return value?.replace(/^sha256=/i, "").trim() ?? null;
}

function hmacDigests(rawBody: string, secret: string) {
  const hmac = createHmac("sha256", secret).update(rawBody);
  return {
    hex: hmac.digest("hex"),
    base64: createHmac("sha256", secret).update(rawBody).digest("base64")
  };
}

export function verifySharedWebhookSecret({
  request,
  rawBody = "",
  secret,
  providerName,
  secretHeaders = ["x-fly-webhook-secret", "x-webhook-secret"],
  signatureHeaders = ["x-fly-signature", "x-webhook-signature", "x-hub-signature-256"],
  queryParams = ["token", "secret"]
}: WebhookVerificationOptions): WebhookVerificationResult {
  const configuredSecret = cleanEnv(secret);
  if (!configuredSecret) {
    if (process.env.NODE_ENV === "production") {
      return {
        ok: false,
        status: 503,
        error: `${providerName} webhook secret is not configured.`
      };
    }

    return { ok: true, warning: `${providerName} webhook accepted without a secret outside production.` };
  }

  const url = new URL(request.url);
  const directValues = [
    bearerValue(request.headers.get("authorization")),
    ...secretHeaders.map((header) => request.headers.get(header)),
    ...queryParams.map((name) => url.searchParams.get(name))
  ];

  if (directValues.some((value) => secureCompare(value, configuredSecret))) {
    return { ok: true };
  }

  const signatures = signatureHeaders
    .map((header) => normalizeSignature(request.headers.get(header)))
    .filter(Boolean);

  if (rawBody && signatures.length > 0) {
    const expected = hmacDigests(rawBody, configuredSecret);
    if (signatures.some((signature) => secureCompare(signature, expected.hex) || secureCompare(signature, expected.base64))) {
      return { ok: true };
    }
  }

  return {
    ok: false,
    status: 401,
    error: `Invalid ${providerName} webhook signature.`
  };
}
