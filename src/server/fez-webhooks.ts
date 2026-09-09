import { cleanEnv } from "@/lib/env";
import { getFezConfig, resolveFezAuthHeaders } from "@/server/carrier-config";
import { logInfo, logWarn } from "@/server/monitoring";

type FezWebhookRegistrationResult =
  | { ok: true; webhookUrl: string; rawResponse: unknown }
  | { ok: false; webhookUrl: string; error: string; status?: number; rawResponse?: unknown };

function defaultWebhookUrl() {
  const appUrl = cleanEnv(process.env.NEXT_PUBLIC_APP_URL)?.replace(/\/$/, "");
  const webhookUrl = new URL(`${appUrl ?? "https://flylogistics.com.ng"}/api/webhooks/fez`);
  const webhookSecret = cleanEnv(process.env.FEZ_WEBHOOK_SECRET) ?? cleanEnv(process.env.CARRIER_WEBHOOK_SECRET);
  if (webhookSecret) webhookUrl.searchParams.set("secret", webhookSecret);
  return webhookUrl.toString();
}

export function redactedFezWebhookUrl(webhookUrl: string) {
  try {
    const url = new URL(webhookUrl);
    if (url.searchParams.has("token")) url.searchParams.set("token", "redacted");
    if (url.searchParams.has("secret")) url.searchParams.set("secret", "redacted");
    return url.toString();
  } catch {
    return webhookUrl.includes("token=") || webhookUrl.includes("secret=") ? "[redacted webhook url]" : webhookUrl;
  }
}

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function errorMessage(raw: unknown, fallback: string) {
  const body = asRecord(raw);
  for (const key of ["message", "description", "error", "detail"]) {
    const value = body?.[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return fallback;
}

export async function registerFezWebhook(webhookUrl = defaultWebhookUrl()): Promise<FezWebhookRegistrationResult> {
  const config = getFezConfig("register_webhook");
  if (!config.configured || !config.baseUrl) {
    return {
      ok: false,
      webhookUrl,
      error: `FEZ Logistics is not configured for ${config.environment}. Missing: ${config.missing.join(", ")}.`
    };
  }

  logInfo("Registering FEZ webhook URL.", {
    provider: "fez_logistics",
    environment: config.environment,
    webhookUrl: redactedFezWebhookUrl(webhookUrl)
  });

  try {
    const auth = await resolveFezAuthHeaders(config);
    if (!auth.ok) {
      return { ok: false, webhookUrl, status: auth.status, error: auth.error };
    }

    const response = await fetch(`${config.baseUrl}/webhooks/store`, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        ...auth.headers
      },
      body: JSON.stringify({ webhook: webhookUrl }),
      cache: "no-store"
    });
    const raw = await response.json().catch(() => null);

    if (!response.ok) {
      const error = errorMessage(raw, `FEZ webhook registration failed with ${response.status}.`);
      logWarn("FEZ webhook registration failed.", {
        provider: "fez_logistics",
        environment: config.environment,
        webhookUrl: redactedFezWebhookUrl(webhookUrl),
        status: response.status,
        error
      });
      return { ok: false, webhookUrl, status: response.status, error, rawResponse: raw };
    }

    return { ok: true, webhookUrl, rawResponse: raw };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to register FEZ webhook.";
    logWarn("FEZ webhook registration request failed.", {
      provider: "fez_logistics",
      environment: config.environment,
      webhookUrl: redactedFezWebhookUrl(webhookUrl),
      error: message
    });
    return { ok: false, webhookUrl, error: message };
  }
}
