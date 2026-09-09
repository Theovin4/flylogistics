import { cleanEnv } from "@/lib/env";
import { logInfo, logWarn } from "@/server/monitoring";

export type SendboxEnvironment = "staging" | "production";
export type FezEnvironment = "staging" | "production";

export type SendboxConfig = {
  provider: "sendbox";
  environment: SendboxEnvironment;
  apiKey: string | null;
  baseUrl: string | null;
  configured: boolean;
  missing: string[];
};

export type EasyshipConfig = {
  provider: "easyship";
  apiKey: string | null;
  baseUrl: string | null;
  configured: boolean;
  missing: string[];
};

export type FezConfig = {
  provider: "fez_logistics";
  environment: FezEnvironment;
  secretKey: string | null;
  authToken: string | null;
  userId: string | null;
  password: string | null;
  baseUrl: string | null;
  webhookSecretConfigured: boolean;
  configured: boolean;
  missing: string[];
};

type FezAuthResult =
  | { ok: true; headers: Record<string, string> }
  | { ok: false; error: string; status?: number };

let cachedFezToken: { token: string; expiresAt: number } | null = null;

function normalizeEnvironment(value: string | null | undefined): SendboxEnvironment | null {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "staging" || normalized === "development" || normalized === "test" || normalized === "sandbox") return "staging";
  if (normalized === "production" || normalized === "prod" || normalized === "live") return "production";
  return null;
}

export function resolveSendboxEnvironment(): SendboxEnvironment {
  const explicit = cleanEnv(process.env.SENDBOX_ENVIRONMENT);
  const normalizedExplicit = normalizeEnvironment(explicit);
  if (explicit && !normalizedExplicit) {
    logWarn("Invalid SENDBOX_ENVIRONMENT value. Falling back to NODE_ENV.", { provider: "sendbox", value: explicit });
  }
  if (normalizedExplicit) return normalizedExplicit;
  return process.env.NODE_ENV === "development" ? "staging" : "production";
}

export function getSendboxConfig(context = "carrier") {
  const environment = resolveSendboxEnvironment();
  const apiKey = cleanEnv(process.env.SENDBOX_API_KEY);
  const baseUrl = normalizeSendboxBaseUrl(cleanEnv(process.env.SENDBOX_API_BASE_URL));
  const missing = [
    apiKey ? null : "SENDBOX_API_KEY",
    baseUrl ? null : "SENDBOX_API_BASE_URL"
  ].filter(Boolean) as string[];

  const config: SendboxConfig = {
    provider: "sendbox",
    environment,
    apiKey: apiKey ?? null,
    baseUrl,
    configured: missing.length === 0,
    missing
  };

  if (!config.configured) {
    logWarn("Sendbox configuration is incomplete.", { provider: "sendbox", environment, context, missing });
  } else {
    logInfo("Sendbox configuration resolved.", { provider: "sendbox", environment, context, baseUrl });
  }

  return config;
}

export function sendboxAuthHeaders(config: SendboxConfig) {
  const headers: Record<string, string> = {};
  if (config.apiKey) headers.Authorization = config.apiKey;
  return headers;
}

export function getEasyshipConfig(context = "carrier") {
  const apiKey = cleanEnv(process.env.EASYSHIP_API_KEY);
  const baseUrl = cleanEnv(process.env.EASYSHIP_API_BASE_URL)?.replace(/\/$/, "") ?? null;
  const missing = [
    apiKey ? null : "EASYSHIP_API_KEY",
    baseUrl ? null : "EASYSHIP_API_BASE_URL"
  ].filter(Boolean) as string[];

  const config: EasyshipConfig = {
    provider: "easyship",
    apiKey: apiKey ?? null,
    baseUrl,
    configured: missing.length === 0,
    missing
  };

  if (!config.configured) {
    logWarn("Easyship configuration is incomplete.", { provider: "easyship", context, missing });
  }

  return config;
}

export function easyshipAuthHeaders(config: EasyshipConfig) {
  const headers: Record<string, string> = {};
  if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`;
  return headers;
}

export function resolveFezEnvironment(): FezEnvironment {
  const explicit = cleanEnv(process.env.FEZ_ENVIRONMENT);
  const normalizedExplicit = normalizeEnvironment(explicit);
  if (explicit && !normalizedExplicit) {
    logWarn("Invalid FEZ_ENVIRONMENT value. Falling back to NODE_ENV.", { provider: "fez_logistics", value: explicit });
  }
  if (normalizedExplicit) return normalizedExplicit;
  return process.env.NODE_ENV === "development" ? "staging" : "production";
}

export function getFezConfig(context = "carrier") {
  const configuredEnvironment = cleanEnv(process.env.FEZ_ENVIRONMENT);
  const environment = resolveFezEnvironment();
  const secretKey = cleanEnv(process.env.FEZ_SECRET_KEY);
  const authToken = cleanEnv(process.env.FEZ_AUTH_TOKEN);
  const userId = cleanEnv(process.env.FEZ_USER_ID);
  const password = cleanEnv(process.env.FEZ_PASSWORD);
  const baseUrl = normalizeFezBaseUrl(cleanEnv(process.env.FEZ_API_BASE_URL));
  const webhookSecretConfigured = Boolean(cleanEnv(process.env.FEZ_WEBHOOK_SECRET));
  const missing = [
    baseUrl ? null : "FEZ_API_BASE_URL",
    configuredEnvironment ? null : "FEZ_ENVIRONMENT",
    userId ? null : "FEZ_USER_ID",
    password ? null : "FEZ_PASSWORD",
    secretKey ? null : "FEZ_SECRET_KEY",
    webhookSecretConfigured ? null : "FEZ_WEBHOOK_SECRET"
  ].filter(Boolean) as string[];

  const config: FezConfig = {
    provider: "fez_logistics",
    environment,
    secretKey: secretKey ?? null,
    authToken: authToken ?? null,
    userId: userId ?? null,
    password: password ?? null,
    baseUrl,
    webhookSecretConfigured,
    configured: missing.length === 0,
    missing
  };

  if (!config.configured) {
    logWarn("FEZ Logistics configuration is incomplete.", { provider: "fez_logistics", environment, context, missing });
  } else {
    logInfo("FEZ Logistics configuration resolved.", { provider: "fez_logistics", environment, context, baseUrl, authMode: authToken ? "token_override_available" : "user_password" });
  }

  return config;
}

function normalizeSendboxBaseUrl(value: string | null | undefined) {
  const raw = value?.replace(/\/$/, "");
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (["developers.sendbox.co", "www.developers.sendbox.co", "docs.sendbox.co"].includes(url.hostname.toLowerCase())) {
      url.hostname = "live.sendbox.co";
      url.pathname = "";
      url.search = "";
      url.hash = "";
      return url.toString().replace(/\/$/, "");
    }
    const shippingIndex = url.pathname.toLowerCase().indexOf("/shipping");
    if (shippingIndex >= 0) {
      url.pathname = url.pathname.slice(0, shippingIndex) || "/";
      url.search = "";
      url.hash = "";
      return url.toString().replace(/\/$/, "");
    }
  } catch {
    const index = raw.toLowerCase().indexOf("/shipping");
    if (index >= 0) return raw.slice(0, index).replace(/\/$/, "");
  }
  return raw;
}

function normalizeFezBaseUrl(value: string | null | undefined) {
  const raw = value?.replace(/\/$/, "");
  if (!raw) return null;
  try {
    const url = new URL(raw);
    const versionMatch = url.pathname.match(/\/v\d+/i);
    if (versionMatch?.index !== undefined) {
      url.pathname = url.pathname.slice(0, versionMatch.index + versionMatch[0].length);
      url.search = "";
      url.hash = "";
      return url.toString().replace(/\/$/, "");
    }
    url.pathname = `${url.pathname.replace(/\/$/, "")}/v1`;
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    const versionMatch = raw.match(/\/v\d+/i);
    if (versionMatch?.index !== undefined) return raw.slice(0, versionMatch.index + versionMatch[0].length).replace(/\/$/, "");
    return `${raw}/v1`;
  }
}

export function fezAuthHeaders(config: FezConfig) {
  const headers: Record<string, string> = {};
  if (config.secretKey) {
    headers["secret-key"] = config.secretKey;
    headers.secret_key = config.secretKey;
  }
  if (config.authToken) {
    headers.Authorization = `Bearer ${config.authToken}`;
  }
  return headers;
}

function parseFezTokenExpiry(value: unknown) {
  const timestamp = typeof value === "string" ? new Date(value).getTime() : NaN;
  if (!Number.isFinite(timestamp)) return Date.now() + 50 * 60 * 1000;
  return Math.max(Date.now() + 60_000, timestamp - 60_000);
}

function carrierAuthTimeoutMs() {
  const configured = Number(process.env.CARRIER_API_TIMEOUT_MS ?? 12000);
  return Number.isFinite(configured) && configured >= 3000 ? Math.min(configured, 20000) : 12000;
}

export function resetFezAuthCache() {
  cachedFezToken = null;
}

async function fetchFezToken(config: FezConfig, options: { forceRefresh?: boolean } = {}): Promise<FezAuthResult> {
  if (!config.baseUrl || !config.userId || !config.password) {
    return { ok: false, error: "FEZ_AUTH_TOKEN or FEZ_USER_ID/FEZ_PASSWORD is required." };
  }

  if (!options.forceRefresh && cachedFezToken && cachedFezToken.expiresAt > Date.now()) {
    return {
      ok: true,
      headers: {
        ...fezAuthHeaders({ ...config, authToken: cachedFezToken.token }),
        Authorization: `Bearer ${cachedFezToken.token}`
      }
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), carrierAuthTimeoutMs());
  try {
    const response = await fetch(`${config.baseUrl}/user/authenticate`, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        ...fezAuthHeaders(config)
      },
      body: JSON.stringify({
        user_id: config.userId,
        password: config.password
      }),
      cache: "no-store",
      signal: controller.signal
    });
    const body = await response.json().catch(() => null) as {
      description?: string;
      message?: string;
      authToken?: string;
      expireToken?: string;
      authDetails?: { authToken?: string; expireToken?: string };
      orgDetails?: { "secret-key"?: string; secret_key?: string; secretKey?: string };
    } | null;
    const authToken = body?.authDetails?.authToken ?? body?.authToken;
    const expireToken = body?.authDetails?.expireToken ?? body?.expireToken;
    const responseSecretKey = body?.orgDetails?.["secret-key"] ?? body?.orgDetails?.secret_key ?? body?.orgDetails?.secretKey ?? config.secretKey;
    if (!response.ok || !authToken) {
      return {
        ok: false,
        status: response.status,
        error: body?.description ?? body?.message ?? `FEZ authentication failed with ${response.status}.`
      };
    }

    cachedFezToken = {
      token: authToken,
      expiresAt: parseFezTokenExpiry(expireToken)
    };

    return {
      ok: true,
      headers: {
        ...fezAuthHeaders({ ...config, secretKey: responseSecretKey ?? config.secretKey, authToken: cachedFezToken.token }),
        Authorization: `Bearer ${cachedFezToken.token}`
      }
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return { ok: false, status: 408, error: "FEZ authentication timed out. The shipment can still be created internally and retried from admin." };
    }
    return { ok: false, error: error instanceof Error ? error.message : "Unable to authenticate with FEZ." };
  } finally {
    clearTimeout(timeout);
  }
}

export async function resolveFezAuthHeaders(config: FezConfig, options: { forceRefresh?: boolean } = {}): Promise<FezAuthResult> {
  if (!config.secretKey) return { ok: false, error: "FEZ_SECRET_KEY is required." };
  if (!config.userId || !config.password) {
    return { ok: false, error: "FEZ_USER_ID and FEZ_PASSWORD are required." };
  }
  const token = await fetchFezToken(config, options);
  if (token.ok) return token;
  if (config.authToken && !options.forceRefresh) {
    logWarn("FEZ user/password authentication failed; retrying with FEZ_AUTH_TOKEN override.", { provider: "fez_logistics", environment: config.environment, status: token.status, error: token.error });
    return { ok: true, headers: fezAuthHeaders(config) };
  }
  return token;
}

export async function checkSendboxHealth() {
  const config = getSendboxConfig("admin_health_check");
  if (!config.configured || !config.baseUrl) {
    return {
      environment: config.environment,
      configured: false,
      connectionStatus: "missing_configuration" as const,
      healthStatus: "not_checked" as const,
      missing: config.missing,
      baseUrl: config.baseUrl
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(config.baseUrl, {
      method: "GET",
      headers: {
        accept: "application/json",
        ...sendboxAuthHeaders(config)
      },
      cache: "no-store",
      signal: controller.signal
    });

    const reachable = response.status < 500;
    return {
      environment: config.environment,
      configured: true,
      connectionStatus: reachable ? "reachable" as const : "unreachable" as const,
      healthStatus: reachable ? "ok" as const : "degraded" as const,
      statusCode: response.status,
      missing: [] as string[],
      baseUrl: config.baseUrl
    };
  } catch (error) {
    logWarn("Sendbox health check failed.", {
      provider: "sendbox",
      environment: config.environment,
      message: error instanceof Error ? error.message : "Unknown Sendbox health check error"
    });
    return {
      environment: config.environment,
      configured: true,
      connectionStatus: "unreachable" as const,
      healthStatus: "error" as const,
      missing: [] as string[],
      baseUrl: config.baseUrl
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function checkFezHealth() {
  const config = getFezConfig("admin_health_check");
  if (!config.configured || !config.baseUrl) {
    return {
      environment: config.environment,
      configured: false,
      webhookSecretConfigured: config.webhookSecretConfigured,
      connectionStatus: "missing_configuration" as const,
      healthStatus: "not_checked" as const,
      missing: config.missing,
      baseUrl: config.baseUrl
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const auth = await resolveFezAuthHeaders(config);
    if (!auth.ok) {
      return {
        environment: config.environment,
        configured: false,
        webhookSecretConfigured: config.webhookSecretConfigured,
        connectionStatus: "missing_configuration" as const,
        healthStatus: "not_checked" as const,
        missing: [auth.error],
        baseUrl: config.baseUrl
      };
    }

    const response = await fetch(config.baseUrl, {
      method: "GET",
      headers: {
        accept: "application/json",
        ...auth.headers
      },
      cache: "no-store",
      signal: controller.signal
    });

    const reachable = response.status < 500;
    return {
      environment: config.environment,
      configured: true,
      webhookSecretConfigured: config.webhookSecretConfigured,
      connectionStatus: reachable ? "reachable" as const : "unreachable" as const,
      healthStatus: reachable ? "ok" as const : "degraded" as const,
      statusCode: response.status,
      missing: [] as string[],
      baseUrl: config.baseUrl
    };
  } catch (error) {
    logWarn("FEZ Logistics health check failed.", {
      provider: "fez_logistics",
      environment: config.environment,
      message: error instanceof Error ? error.message : "Unknown FEZ health check error"
    });
    return {
      environment: config.environment,
      configured: true,
      webhookSecretConfigured: config.webhookSecretConfigured,
      connectionStatus: "unreachable" as const,
      healthStatus: "error" as const,
      missing: [] as string[],
      baseUrl: config.baseUrl
    };
  } finally {
    clearTimeout(timeout);
  }
}
