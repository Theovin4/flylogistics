import { getSupabaseAdmin } from "@/lib/supabase-server";
import type { AuthProfile } from "@/lib/request-auth";
import { logApiError, logInfo, logWarn } from "@/server/monitoring";
import { writeAuditLog } from "@/server/audit";
import { writeOperationalEvent } from "@/server/operational-events";

type SupabaseAdminClient = NonNullable<ReturnType<typeof getSupabaseAdmin>>;

type JsonObject = Record<string, unknown>;

type GoogleProfileSyncResult = {
  configured: boolean;
  ok: boolean;
  status: "ready" | "missing_config" | "failed";
  message: string;
  locationName?: string | null;
  accountName?: string | null;
  syncedAt?: string | null;
};

type GoogleBusinessSettings = {
  accountName: string;
  locationName: string;
  profileUrl: string;
  refreshToken: string;
  connectedEmail: string;
  lastSyncAt: string;
};

type GoogleApiResult<T> =
  | { ok: true; data: T; status: number; cached?: boolean; cachedAt?: string | null }
  | { ok: false; error: string; status: number; data?: unknown; retryAfterSeconds?: number; retryAt?: string };

const GOOGLE_SCOPE = "https://www.googleapis.com/auth/business.manage";
const OAUTH_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";
const ACCOUNT_MANAGEMENT_BASE = "https://mybusinessaccountmanagement.googleapis.com/v1";
const BUSINESS_INFO_BASE = "https://mybusinessbusinessinformation.googleapis.com/v1";
const MY_BUSINESS_V4_BASE = "https://mybusiness.googleapis.com/v4";

let tokenCache: { refreshToken: string; accessToken: string; expiresAt: number } | null = null;
const googleCooldowns = new Map<string, number>();

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function retryAfterSeconds(response: Response) {
  const raw = response.headers.get("retry-after");
  const seconds = Number(raw ?? 0);
  if (Number.isFinite(seconds) && seconds > 0) return Math.min(Math.ceil(seconds), 900);
  return response.status === 429 ? 300 : undefined;
}

function cooldown(key: string) {
  const until = googleCooldowns.get(key) ?? 0;
  const remaining = Math.ceil((until - Date.now()) / 1000);
  if (remaining <= 0) {
    googleCooldowns.delete(key);
    return null;
  }
  return {
    retryAfterSeconds: remaining,
    retryAt: new Date(until).toISOString()
  };
}

function setCooldown(key: string, seconds: number) {
  const safeSeconds = Math.max(30, Math.min(Math.ceil(seconds), 900));
  const until = Date.now() + safeSeconds * 1000;
  googleCooldowns.set(key, until);
  return {
    retryAfterSeconds: safeSeconds,
    retryAt: new Date(until).toISOString()
  };
}

function env(name: string) {
  return process.env[name]?.trim() || "";
}

function appUrl() {
  return env("NEXT_PUBLIC_APP_URL") || "https://flylogistics.com.ng";
}

function jsonRecord(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonObject) : {};
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function arrayValue(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function googleErrorMessage(body: unknown, fallback: string, status?: number) {
  const error = jsonRecord(jsonRecord(body).error);
  const message = stringValue(error.message);
  const googleStatus = stringValue(error.status);
  const code = String(error.code ?? status ?? "");
  const combined = `${message} ${googleStatus} ${code}`.toLowerCase();

  if (status === 429 || combined.includes("quota")) {
    return "Google rate limit reached for Business Profile. Wait a few minutes, then try again or request a higher quota in Google Cloud.";
  }

  if (
    combined.includes("api has not been used") ||
    combined.includes("has not been used in project") ||
    combined.includes("service_disabled") ||
    combined.includes("disabled")
  ) {
    return "Google Business Profile API is not enabled for this Google Cloud project. Enable Business Profile Account Management and Business Information APIs, then try again.";
  }

  if (combined.includes("insufficient authentication scopes")) {
    return "Google approved the wrong permissions. Reconnect Google and approve the Business Profile management permission.";
  }

  if (status === 401 || combined.includes("unauthenticated") || combined.includes("invalid_grant")) {
    return "Google connection expired or was revoked. Reconnect Google Business Profile from the admin page.";
  }

  if (status === 403 || combined.includes("permission_denied") || combined.includes("permission")) {
    return "This Google account does not have permission to manage the selected Business Profile. Use the owner or manager Google account, then reconnect.";
  }

  return message || fallback;
}

function googleRawErrorMessage(body: unknown, fallback: string) {
  const error = jsonRecord(jsonRecord(body).error);
  return stringValue(error.message) || fallback;
}

function googleStatusText(body: unknown) {
  const error = jsonRecord(jsonRecord(body).error);
  return stringValue(error.status) || null;
}

function logGoogleApiFailure(kind: string, response: Response, body: unknown, url: string) {
  logWarn("Google Business Profile API request failed.", {
    kind,
    status: response.status,
    statusText: response.statusText,
    googleStatus: googleStatusText(body),
    googleMessage: googleRawErrorMessage(body, `Google returned ${response.status}.`),
    url
  });
}

async function fetchWithBackoff(url: string, init: RequestInit, kind: string) {
  let lastResponse: Response | null = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(url, { ...init, cache: "no-store" });
    lastResponse = response;
    if (response.status !== 429 && response.status < 500) return response;

    const retryAfter = retryAfterSeconds(response);
    if (response.status === 429 && retryAfter && retryAfter > 5) return response;
    if (attempt === 2) return response;

    const waitMs = response.status === 429
      ? Math.min((retryAfter ?? 1) * 1000, 2_000)
      : Math.min(500 * 2 ** attempt, 2_000);
    logWarn("Retrying Google Business Profile API request with backoff.", {
      attempt: attempt + 1,
      kind,
      status: response.status,
      waitMs,
      url
    });
    await sleep(waitMs);
  }
  return lastResponse as Response;
}

function maskGoogleName(value: string | null | undefined) {
  if (!value) return null;
  const parts = value.split("/");
  return parts.length > 1 ? `${parts[0]}/...${parts[parts.length - 1]}` : value;
}

function configuredEnv() {
  const redirectUri = env("GOOGLE_REDIRECT_URI") || `${appUrl()}/api/integrations/google-business/callback`;
  return {
    clientId: env("GOOGLE_CLIENT_ID"),
    clientSecret: env("GOOGLE_CLIENT_SECRET"),
    redirectUri,
    accountName: env("GOOGLE_BUSINESS_PROFILE_ACCOUNT_NAME"),
    locationName: env("GOOGLE_BUSINESS_PROFILE_LOCATION_NAME"),
    refreshToken: env("GOOGLE_BUSINESS_PROFILE_REFRESH_TOKEN"),
    profileUrl: env("GOOGLE_BUSINESS_PROFILE_URL")
  };
}

async function cacheGoogleBusinessResource(
  supabase: SupabaseAdminClient | null,
  input: {
    accountName?: string | null;
    locationName?: string | null;
    syncType: string;
    rawResponse: JsonObject;
  }
) {
  if (!supabase) return;
  const syncedAt = new Date().toISOString();
  const { error } = await supabase.from("google_business_profile_syncs").insert({
    account_name: input.accountName || null,
    location_name: input.locationName || null,
    sync_type: input.syncType,
    status: "cached",
    raw_response: input.rawResponse,
    synced_at: syncedAt
  });

  if (error && error.code !== "42P01" && error.code !== "42703") {
    logWarn("Unable to cache Google Business Profile resource.", {
      reason: error.message,
      syncType: input.syncType
    });
  }
}

async function readGoogleBusinessCache<T>(
  supabase: SupabaseAdminClient | null,
  syncType: string,
  accountName?: string | null
): Promise<{ data: T; cachedAt: string | null } | null> {
  if (!supabase) return null;

  let query = supabase
    .from("google_business_profile_syncs")
    .select("raw_response,synced_at,created_at")
    .eq("sync_type", syncType)
    .eq("status", "cached")
    .order("created_at", { ascending: false })
    .limit(1);

  if (accountName) query = query.eq("account_name", accountName);

  const { data, error } = await query.maybeSingle();
  if (error) {
    if (error.code !== "42P01" && error.code !== "42703") {
      logWarn("Unable to read Google Business Profile cache.", {
        reason: error.message,
        syncType,
        accountName
      });
    }
    return null;
  }

  const rawResponse = jsonRecord(data?.raw_response);
  return {
    cachedAt: stringValue(data?.synced_at) || stringValue(data?.created_at) || null,
    data: rawResponse as T
  };
}

async function readStoredSettings(supabase: SupabaseAdminClient | null): Promise<Partial<GoogleBusinessSettings>> {
  if (!supabase) return {};

  const { data, error } = await supabase
    .from("google_business_profile_settings")
    .select("account_name,location_name,profile_url,refresh_token,connected_email,last_sync_at")
    .eq("id", "default")
    .maybeSingle();

  if (error) {
    if (error.code !== "42P01" && error.code !== "42703") {
      logWarn("Unable to read Google Business Profile settings.", { reason: error.message });
    }
    return {};
  }

  return {
    accountName: stringValue(data?.account_name),
    locationName: stringValue(data?.location_name),
    profileUrl: stringValue(data?.profile_url),
    refreshToken: stringValue(data?.refresh_token),
    connectedEmail: stringValue(data?.connected_email),
    lastSyncAt: stringValue(data?.last_sync_at)
  };
}

export async function getGoogleBusinessSettings(supabase: SupabaseAdminClient | null) {
  const base = configuredEnv();
  const stored = await readStoredSettings(supabase);

  return {
    clientId: base.clientId,
    clientSecret: base.clientSecret,
    redirectUri: base.redirectUri,
    accountName: stored.accountName || base.accountName,
    locationName: stored.locationName || base.locationName,
    refreshToken: stored.refreshToken || base.refreshToken,
    profileUrl: stored.profileUrl || base.profileUrl,
    connectedEmail: stored.connectedEmail || "",
    lastSyncAt: stored.lastSyncAt || ""
  };
}

export function googleBusinessProfileConfig() {
  const config = configuredEnv();
  const missing = [
    !config.clientId ? "GOOGLE_CLIENT_ID" : "",
    !config.clientSecret ? "GOOGLE_CLIENT_SECRET" : "",
    !config.redirectUri ? "GOOGLE_REDIRECT_URI" : ""
  ].filter(Boolean);

  return {
    accountName: config.accountName,
    clientConfigured: !missing.length,
    configured: Boolean(config.clientId && config.clientSecret && config.refreshToken),
    locationName: config.locationName,
    missing,
    profileUrl: config.profileUrl,
    refreshTokenConfigured: Boolean(config.refreshToken),
    scope: GOOGLE_SCOPE
  };
}

export async function googleBusinessProfileHealth(supabase?: SupabaseAdminClient | null) {
  const settings = await getGoogleBusinessSettings(supabase ?? null);
  const missing = [
    !settings.clientId ? "GOOGLE_CLIENT_ID" : "",
    !settings.clientSecret ? "GOOGLE_CLIENT_SECRET" : "",
    !settings.redirectUri ? "GOOGLE_REDIRECT_URI" : "",
    !settings.refreshToken ? "GOOGLE_BUSINESS_PROFILE_REFRESH_TOKEN or connected OAuth refresh token" : ""
  ].filter(Boolean);

  return {
    configured: missing.length === 0,
    accountName: settings.accountName || null,
    connectedEmail: settings.connectedEmail || null,
    lastSyncAt: settings.lastSyncAt || null,
    locationName: settings.locationName || null,
    missing,
    profileUrl: settings.profileUrl || null,
    refreshTokenConfigured: Boolean(settings.refreshToken),
    status: missing.length === 0 ? "ready" : "setup_needed"
  };
}

export function googleBusinessOAuthUrl(state: string) {
  const config = configuredEnv();
  if (!config.clientId || !config.clientSecret || !config.redirectUri) {
    return {
      ok: false as const,
      error: "Google OAuth client ID, client secret, and redirect URI are required."
    };
  }

  const params = new URLSearchParams({
    access_type: "offline",
    client_id: config.clientId,
    include_granted_scopes: "true",
    prompt: "consent",
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: GOOGLE_SCOPE,
    state
  });

  return { ok: true as const, url: `${OAUTH_AUTH_URL}?${params.toString()}` };
}

export async function exchangeGoogleBusinessCode(code: string) {
  const config = configuredEnv();
  if (!config.clientId || !config.clientSecret || !config.redirectUri) {
    return { ok: false as const, error: "Google OAuth is not configured.", status: 500 };
  }

  const response = await fetch(OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: config.redirectUri
    }),
    cache: "no-store"
  });
  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    logGoogleApiFailure("oauth_code_exchange", response, body, OAUTH_TOKEN_URL);
    return {
      ok: false as const,
      error: googleErrorMessage(body, `Google OAuth returned ${response.status}.`, response.status),
      status: response.status
    };
  }

  const record = jsonRecord(body);
  return {
    ok: true as const,
    accessToken: stringValue(record.access_token),
    expiresIn: Number(record.expires_in ?? 3600),
    refreshToken: stringValue(record.refresh_token),
    scope: stringValue(record.scope),
    tokenType: stringValue(record.token_type),
    status: response.status
  };
}

async function refreshAccessToken(refreshToken: string, clientId: string, clientSecret: string): Promise<GoogleApiResult<{ accessToken: string; expiresIn: number }>> {
  if (tokenCache && tokenCache.refreshToken === refreshToken && tokenCache.expiresAt > Date.now() + 60_000) {
    return { ok: true, data: { accessToken: tokenCache.accessToken, expiresIn: Math.max(60, Math.floor((tokenCache.expiresAt - Date.now()) / 1000)) }, status: 200 };
  }

  const response = await fetch(OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken
    }),
    cache: "no-store"
  });
  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    logGoogleApiFailure("oauth_refresh_token", response, body, OAUTH_TOKEN_URL);
    return {
      ok: false,
      error: googleErrorMessage(body, `Google token refresh returned ${response.status}.`, response.status),
      status: response.status,
      data: body
    };
  }

  const record = jsonRecord(body);
  const accessToken = stringValue(record.access_token);
  const expiresIn = Number(record.expires_in ?? 3600);
  tokenCache = {
    accessToken,
    expiresAt: Date.now() + Math.max(60, expiresIn - 60) * 1000,
    refreshToken
  };

  return { ok: true, data: { accessToken, expiresIn }, status: response.status };
}

export async function getGoogleBusinessAccessToken(supabase: SupabaseAdminClient | null): Promise<GoogleApiResult<{ accessToken: string; expiresIn: number }>> {
  const settings = await getGoogleBusinessSettings(supabase);
  if (!settings.clientId || !settings.clientSecret || !settings.refreshToken) {
    return {
      ok: false,
      error: "Google Business Profile is not connected. Add OAuth credentials and connect an admin Google account.",
      status: 428
    };
  }
  return refreshAccessToken(settings.refreshToken, settings.clientId, settings.clientSecret);
}

async function googleFetch<T>(
  supabase: SupabaseAdminClient | null,
  url: string,
  init: RequestInit = {}
): Promise<GoogleApiResult<T>> {
  const token = await getGoogleBusinessAccessToken(supabase);
  if (!token.ok) return token;

  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token.data.accessToken}`);
  headers.set("Accept", "application/json");
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");

  const response = await fetchWithBackoff(url, { ...init, headers }, "business_profile_api");
  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    logGoogleApiFailure("business_profile_api", response, body, url);
    const retryAfter = retryAfterSeconds(response);
    return {
      ok: false,
      error: googleErrorMessage(body, `Google Business Profile returned ${response.status}.`, response.status),
      status: response.status,
      data: body,
      ...(retryAfter ? { retryAfterSeconds: retryAfter, retryAt: new Date(Date.now() + retryAfter * 1000).toISOString() } : {})
    };
  }

  return { ok: true, data: body as T, status: response.status };
}

async function googleFetchWithRefreshToken<T>(
  refreshToken: string,
  url: string,
  init: RequestInit = {}
): Promise<GoogleApiResult<T>> {
  const config = configuredEnv();
  if (!config.clientId || !config.clientSecret || !refreshToken) {
    return {
      ok: false,
      error: "Google OAuth client and refresh token are required.",
      status: 428
    };
  }

  const token = await refreshAccessToken(refreshToken, config.clientId, config.clientSecret);
  if (!token.ok) return token;

  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token.data.accessToken}`);
  headers.set("Accept", "application/json");
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");

  const response = await fetchWithBackoff(url, { ...init, headers }, "business_profile_api_with_refresh_token");
  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    logGoogleApiFailure("business_profile_api_with_refresh_token", response, body, url);
    const retryAfter = retryAfterSeconds(response);
    return {
      ok: false,
      error: googleErrorMessage(body, `Google Business Profile returned ${response.status}.`, response.status),
      status: response.status,
      data: body,
      ...(retryAfter ? { retryAfterSeconds: retryAfter, retryAt: new Date(Date.now() + retryAfter * 1000).toISOString() } : {})
    };
  }

  return { ok: true, data: body as T, status: response.status };
}

function normalizeAccountName(accountName: string) {
  const value = accountName.trim();
  if (!value) return "";
  return value.startsWith("accounts/") ? value : `accounts/${value}`;
}

function normalizeLocationName(locationName: string) {
  const value = locationName.trim();
  if (!value) return "";
  return value.startsWith("locations/") || value.startsWith("accounts/") ? value : `locations/${value}`;
}

function v4LocationPath(accountName: string, locationName: string) {
  const account = normalizeAccountName(accountName);
  const location = normalizeLocationName(locationName);
  if (location.startsWith("accounts/")) return location;
  if (!account || !location) return "";
  return `${account}/${location}`;
}

async function selectedLocationPath(supabase: SupabaseAdminClient | null) {
  const settings = await getGoogleBusinessSettings(supabase);
  const accountName = normalizeAccountName(settings.accountName);
  const locationName = normalizeLocationName(settings.locationName);
  const path = v4LocationPath(accountName, locationName);
  if (!path) {
    return {
      ok: false as const,
      error: "Select a Google Business Profile account and location before using this action.",
      accountName,
      locationName,
      profileUrl: settings.profileUrl
    };
  }
  return { ok: true as const, accountName, locationName, path, profileUrl: settings.profileUrl };
}

export async function googleBusinessProfileSelection(supabase: SupabaseAdminClient | null) {
  const settings = await getGoogleBusinessSettings(supabase);
  const accountName = normalizeAccountName(settings.accountName);
  const locationName = normalizeLocationName(settings.locationName);

  return {
    accountName: accountName || null,
    locationName: locationName || null,
    profileUrl: settings.profileUrl || null,
    selected: Boolean(accountName && locationName)
  };
}

export async function listAccounts(supabase: SupabaseAdminClient | null, options?: { force?: boolean }) {
  const cached = !options?.force
    ? await readGoogleBusinessCache<{ accounts?: JsonObject[] }>(supabase, "accounts_cache")
    : null;
  if (cached?.data?.accounts?.length) {
    return {
      ok: true as const,
      data: cached.data,
      status: 200,
      cached: true,
      cachedAt: cached.cachedAt
    };
  }

  const activeCooldown = cooldown("accounts");
  if (activeCooldown) {
    return {
      ok: false as const,
      error: `Google account loading is cooling down after a rate limit. Try again in ${Math.ceil(activeCooldown.retryAfterSeconds / 60)} minute(s), or use manual mode.`,
      status: 429,
      ...activeCooldown
    };
  }

  const result = await googleFetch<{ accounts?: JsonObject[] }>(supabase, `${ACCOUNT_MANAGEMENT_BASE}/accounts`);
  if (!result.ok) {
    if (result.status === 429) {
      const nextCooldown = setCooldown("accounts", result.retryAfterSeconds ?? 300);
      return { ...result, ...nextCooldown };
    }
    return result;
  }

  await cacheGoogleBusinessResource(supabase, {
    syncType: "accounts_cache",
    rawResponse: result.data
  });
  return result;
}

export async function listAccountsWithRefreshToken(refreshToken: string) {
  return googleFetchWithRefreshToken<{ accounts?: JsonObject[] }>(refreshToken, `${ACCOUNT_MANAGEMENT_BASE}/accounts`);
}

export async function listLocations(supabase: SupabaseAdminClient | null, accountName?: string) {
  const settings = await getGoogleBusinessSettings(supabase);
  const account = normalizeAccountName(accountName || settings.accountName);
  if (!account) return { ok: false as const, error: "Google Business Profile account name is required.", status: 400 };
  const cached = await readGoogleBusinessCache<{ locations?: JsonObject[] }>(supabase, "locations_cache", account);
  if (cached?.data?.locations?.length) {
    return {
      ok: true as const,
      data: cached.data,
      status: 200,
      cached: true,
      cachedAt: cached.cachedAt
    };
  }

  const cooldownKey = `locations:${account}`;
  const activeCooldown = cooldown(cooldownKey);
  if (activeCooldown) {
    return {
      ok: false as const,
      error: `Google location loading is cooling down after a rate limit. Try again in ${Math.ceil(activeCooldown.retryAfterSeconds / 60)} minute(s), or use manual mode.`,
      status: 429,
      ...activeCooldown
    };
  }

  const readMask = ["name", "title", "storefrontAddress", "phoneNumbers", "websiteUri", "metadata", "categories", "regularHours"].join(",");
  const result = await googleFetch<{ locations?: JsonObject[] }>(supabase, `${BUSINESS_INFO_BASE}/${account}/locations?readMask=${encodeURIComponent(readMask)}`);
  if (!result.ok) {
    if (result.status === 429) {
      const nextCooldown = setCooldown(cooldownKey, result.retryAfterSeconds ?? 300);
      return { ...result, ...nextCooldown };
    }
    return result;
  }

  await cacheGoogleBusinessResource(supabase, {
    accountName: account,
    syncType: "locations_cache",
    rawResponse: result.data
  });
  return result;
}

export async function listLocationsWithRefreshToken(refreshToken: string, accountName: string) {
  const account = normalizeAccountName(accountName);
  if (!account) return { ok: false as const, error: "Google Business Profile account name is required.", status: 400 };
  const readMask = ["name", "title", "storefrontAddress", "phoneNumbers", "websiteUri", "metadata", "categories", "regularHours"].join(",");
  return googleFetchWithRefreshToken<{ locations?: JsonObject[] }>(refreshToken, `${BUSINESS_INFO_BASE}/${account}/locations?readMask=${encodeURIComponent(readMask)}`);
}

export async function getLocation(supabase: SupabaseAdminClient | null) {
  const selected = await selectedLocationPath(supabase);
  if (!selected.ok) return { ok: false as const, error: selected.error, status: 400 };
  const readMask = ["name", "title", "storefrontAddress", "phoneNumbers", "websiteUri", "metadata", "categories", "regularHours", "serviceArea"].join(",");
  const businessInfoLocation = selected.locationName.startsWith("accounts/") ? selected.locationName.split("/").slice(-2).join("/") : selected.locationName;
  return googleFetch<JsonObject>(supabase, `${BUSINESS_INFO_BASE}/${businessInfoLocation}?readMask=${encodeURIComponent(readMask)}`);
}

export async function syncBusinessInfo(supabase: SupabaseAdminClient | null, request?: Request, actor?: AuthProfile | null) {
  const location = await getLocation(supabase);
  const syncedAt = new Date().toISOString();
  if (!supabase) return location;

  const settings = await getGoogleBusinessSettings(supabase);
  const payload = location.ok ? location.data : {};
  const record = jsonRecord(payload);
  const metadata = jsonRecord(record.metadata);
  const phoneNumbers = jsonRecord(record.phoneNumbers);
  const address = jsonRecord(record.storefrontAddress);

  await supabase.from("google_business_profile_syncs").insert({
    account_name: settings.accountName || null,
    location_name: settings.locationName || null,
    sync_type: "business_info",
    status: location.ok ? "connected" : "failed",
    raw_response: payload,
    error_message: location.ok ? null : location.error,
    synced_at: syncedAt
  });

  if (location.ok) {
    await supabase.from("google_business_profile_settings").upsert({
      id: "default",
      account_name: settings.accountName || null,
      location_name: stringValue(record.name) || settings.locationName || null,
      profile_url: stringValue(metadata.mapsUri) || stringValue(metadata.newReviewUri) || settings.profileUrl || null,
      business_name: stringValue(record.title) || null,
      business_phone: stringValue(phoneNumbers.primaryPhone) || null,
      business_website: stringValue(record.websiteUri) || null,
      business_address: address,
      business_hours: record.regularHours ?? {},
      business_categories: record.categories ?? {},
      business_info: record,
      last_sync_at: syncedAt,
      updated_at: syncedAt
    }, { onConflict: "id" });
  }

  await writeAuditLog(supabase, {
    action: "google_business_profile.sync_business_info",
    actor,
    entityType: "google_business_profile",
    entityId: settings.locationName || "unselected",
    metadata: { ok: location.ok, status: location.status },
    request
  });
  await writeOperationalEvent(supabase, {
    category: "system",
    severity: location.ok ? "info" : "warning",
    message: location.ok ? "Google Business Profile business information synced." : "Google Business Profile business information sync failed.",
    entityType: "google_business_profile",
    entityId: settings.locationName || "unselected",
    metadata: { ok: location.ok, status: location.status, error: location.ok ? null : location.error },
    request
  });

  return location;
}

export async function listReviews(supabase: SupabaseAdminClient | null) {
  const selected = await selectedLocationPath(supabase);
  if (!selected.ok) return { ok: false as const, error: selected.error, status: 400 };
  return googleFetch<{ reviews?: JsonObject[]; averageRating?: number; totalReviewCount?: number; nextPageToken?: string }>(
    supabase,
    `${MY_BUSINESS_V4_BASE}/${selected.path}/reviews?pageSize=50`
  );
}

export async function replyToReview(supabase: SupabaseAdminClient | null, reviewName: string, comment: string) {
  return googleFetch<JsonObject>(supabase, `${MY_BUSINESS_V4_BASE}/${reviewName.replace(/^\/+/, "")}/reply`, {
    method: "PUT",
    body: JSON.stringify({ comment })
  });
}

export async function deleteReviewReply(supabase: SupabaseAdminClient | null, reviewName: string) {
  return googleFetch<JsonObject>(supabase, `${MY_BUSINESS_V4_BASE}/${reviewName.replace(/^\/+/, "")}/reply`, {
    method: "DELETE"
  });
}

export async function listPosts(supabase: SupabaseAdminClient | null) {
  const selected = await selectedLocationPath(supabase);
  if (!selected.ok) return { ok: false as const, error: selected.error, status: 400 };
  return googleFetch<{ localPosts?: JsonObject[]; nextPageToken?: string }>(
    supabase,
    `${MY_BUSINESS_V4_BASE}/${selected.path}/localPosts?pageSize=20`
  );
}

export async function createPost(supabase: SupabaseAdminClient | null, input: { summary: string; title?: string; ctaUrl?: string; ctaLabel?: string }) {
  const selected = await selectedLocationPath(supabase);
  if (!selected.ok) return { ok: false as const, error: selected.error, status: 400 };
  const summary = input.title ? `${input.title}\n\n${input.summary}` : input.summary;
  const payload: JsonObject = {
    languageCode: "en-US",
    summary,
    topicType: "STANDARD"
  };
  if (input.ctaUrl) {
    payload.callToAction = {
      actionType: "LEARN_MORE",
      url: input.ctaUrl
    };
  }
  return googleFetch<JsonObject>(supabase, `${MY_BUSINESS_V4_BASE}/${selected.path}/localPosts`, {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function updatePost(supabase: SupabaseAdminClient | null, postName: string, input: { summary: string; ctaUrl?: string }) {
  const payload: JsonObject = { summary: input.summary };
  if (input.ctaUrl) payload.callToAction = { actionType: "LEARN_MORE", url: input.ctaUrl };
  return googleFetch<JsonObject>(supabase, `${MY_BUSINESS_V4_BASE}/${postName.replace(/^\/+/, "")}?updateMask=summary,callToAction`, {
    method: "PATCH",
    body: JSON.stringify(payload)
  });
}

export async function deletePost(supabase: SupabaseAdminClient | null, postName: string) {
  return googleFetch<JsonObject>(supabase, `${MY_BUSINESS_V4_BASE}/${postName.replace(/^\/+/, "")}`, {
    method: "DELETE"
  });
}

export async function listMedia(supabase: SupabaseAdminClient | null) {
  const selected = await selectedLocationPath(supabase);
  if (!selected.ok) return { ok: false as const, error: selected.error, status: 400 };
  return googleFetch<{ mediaItems?: JsonObject[]; nextPageToken?: string }>(
    supabase,
    `${MY_BUSINESS_V4_BASE}/${selected.path}/media?pageSize=50`
  );
}

export async function uploadMedia(supabase: SupabaseAdminClient | null, input: { sourceUrl: string; category?: string; description?: string }) {
  const selected = await selectedLocationPath(supabase);
  if (!selected.ok) return { ok: false as const, error: selected.error, status: 400 };
  return googleFetch<JsonObject>(supabase, `${MY_BUSINESS_V4_BASE}/${selected.path}/media`, {
    method: "POST",
    body: JSON.stringify({
      mediaFormat: "PHOTO",
      locationAssociation: { category: input.category || "ADDITIONAL" },
      sourceUrl: input.sourceUrl,
      description: input.description || undefined
    })
  });
}

export async function deleteMedia(supabase: SupabaseAdminClient | null, mediaName: string) {
  return googleFetch<JsonObject>(supabase, `${MY_BUSINESS_V4_BASE}/${mediaName.replace(/^\/+/, "")}`, {
    method: "DELETE"
  });
}

function starNumber(value: unknown) {
  const text = stringValue(value).toUpperCase();
  return { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 }[text] ?? 0;
}

async function saveReviews(supabase: SupabaseAdminClient | null, reviews: JsonObject[], accountName: string, locationName: string) {
  if (!supabase || !reviews.length) return;
  const rows = reviews.map((review) => {
    const reviewer = jsonRecord(review.reviewer);
    const reply = jsonRecord(review.reviewReply);
    return {
      review_name: stringValue(review.name),
      review_id: stringValue(review.reviewId) || stringValue(review.name),
      account_name: accountName,
      location_name: locationName,
      reviewer_name: stringValue(reviewer.displayName),
      reviewer_photo_url: stringValue(reviewer.profilePhotoUrl),
      star_rating: stringValue(review.starRating),
      rating_value: starNumber(review.starRating),
      comment: stringValue(review.comment),
      reply_comment: stringValue(reply.comment),
      reply_updated_at: stringValue(reply.updateTime) || null,
      review_created_at: stringValue(review.createTime) || null,
      review_updated_at: stringValue(review.updateTime) || null,
      raw_response: review,
      synced_at: new Date().toISOString()
    };
  }).filter((row) => row.review_name);
  if (!rows.length) return;

  const { error } = await supabase.from("google_business_profile_reviews").upsert(rows, { onConflict: "review_name" });
  if (error) logWarn("Unable to store Google Business Profile reviews.", { reason: error.message });
}

async function savePosts(supabase: SupabaseAdminClient | null, posts: JsonObject[], accountName: string, locationName: string) {
  if (!supabase || !posts.length) return;
  const rows = posts.map((post) => ({
    post_name: stringValue(post.name),
    account_name: accountName,
    location_name: locationName,
    summary: stringValue(post.summary),
    topic_type: stringValue(post.topicType),
    state: stringValue(post.state),
    search_url: stringValue(post.searchUrl),
    raw_response: post,
    synced_at: new Date().toISOString()
  })).filter((row) => row.post_name);
  if (!rows.length) return;

  const { error } = await supabase.from("google_business_profile_posts").upsert(rows, { onConflict: "post_name" });
  if (error) logWarn("Unable to store Google Business Profile posts.", { reason: error.message });
}

async function saveMedia(supabase: SupabaseAdminClient | null, mediaItems: JsonObject[], accountName: string, locationName: string) {
  if (!supabase || !mediaItems.length) return;
  const rows = mediaItems.map((item) => ({
    media_name: stringValue(item.name),
    account_name: accountName,
    location_name: locationName,
    source_url: stringValue(item.sourceUrl) || stringValue(item.googleUrl),
    thumbnail_url: stringValue(item.thumbnailUrl),
    media_format: stringValue(item.mediaFormat),
    category: stringValue(jsonRecord(item.locationAssociation).category),
    raw_response: item,
    synced_at: new Date().toISOString()
  })).filter((row) => row.media_name);
  if (!rows.length) return;

  const { error } = await supabase.from("google_business_profile_media").upsert(rows, { onConflict: "media_name" });
  if (error) logWarn("Unable to store Google Business Profile media.", { reason: error.message });
}

export async function syncGoogleBusinessProfile(
  supabase: SupabaseAdminClient | null,
  request?: Request,
  actor?: AuthProfile | null
): Promise<GoogleProfileSyncResult> {
  const health = await googleBusinessProfileHealth(supabase);
  const syncedAt = new Date().toISOString();
  if (!health.configured) {
    return {
      configured: false,
      ok: false,
      status: "missing_config",
      message: `Google Business Profile setup is incomplete. Missing: ${health.missing.join(", ")}.`,
      locationName: health.locationName,
      accountName: health.accountName,
      syncedAt
    };
  }

  const selection = await googleBusinessProfileSelection(supabase);
  if (!selection.selected) {
    return {
      configured: true,
      ok: false,
      status: "missing_config",
      message: "Select and save a Google Business Profile account and location before syncing.",
      locationName: selection.locationName,
      accountName: selection.accountName,
      syncedAt
    };
  }

  const settings = await getGoogleBusinessSettings(supabase);
  const [businessInfo, reviews, posts, media] = await Promise.all([
    syncBusinessInfo(supabase, request, actor),
    listReviews(supabase),
    listPosts(supabase),
    listMedia(supabase)
  ]);

  if (reviews.ok) await saveReviews(supabase, reviews.data.reviews ?? [], settings.accountName, settings.locationName);
  if (posts.ok) await savePosts(supabase, posts.data.localPosts ?? [], settings.accountName, settings.locationName);
  if (media.ok) await saveMedia(supabase, media.data.mediaItems ?? [], settings.accountName, settings.locationName);

  const ok = businessInfo.ok && reviews.ok && posts.ok && media.ok;
  const message = ok ? "Google Business Profile sync completed." : "Google Business Profile sync completed with warnings.";

  if (supabase) {
    await supabase.from("google_business_profile_syncs").insert({
      account_name: settings.accountName || null,
      location_name: settings.locationName || null,
      sync_type: "full_sync",
      status: ok ? "connected" : "warning",
      raw_response: {
        businessInfo: businessInfo.ok,
        reviews: reviews.ok ? arrayValue(reviews.data.reviews).length : reviews.error,
        posts: posts.ok ? arrayValue(posts.data.localPosts).length : posts.error,
        media: media.ok ? arrayValue(media.data.mediaItems).length : media.error
      },
      error_message: ok ? null : "One or more Google Business Profile resources could not be synced.",
      synced_at: syncedAt
    });

    await writeAuditLog(supabase, {
      action: "google_business_profile.full_sync",
      actor,
      entityType: "google_business_profile",
      entityId: settings.locationName || "unselected",
      metadata: { ok },
      request
    });
    await writeOperationalEvent(supabase, {
      category: "system",
      severity: ok ? "info" : "warning",
      message,
      entityType: "google_business_profile",
      entityId: settings.locationName || "unselected",
      metadata: { ok },
      request
    });
  }

  logInfo("Google Business Profile sync finished.", {
    ok,
    accountName: maskGoogleName(settings.accountName),
    locationName: maskGoogleName(settings.locationName)
  });

  return {
    configured: true,
    ok,
    status: ok ? "ready" : "failed",
    message,
    locationName: settings.locationName,
    accountName: settings.accountName,
    syncedAt
  };
}

export async function saveGoogleBusinessConnection(
  supabase: SupabaseAdminClient | null,
  input: {
    refreshToken?: string | null;
    accountName?: string | null;
    locationName?: string | null;
    connectedEmail?: string | null;
    profileUrl?: string | null;
  }
) {
  if (!supabase) return { ok: false as const, error: "Database is unavailable.", status: 503 };
  const now = new Date().toISOString();
  const { error } = await supabase.from("google_business_profile_settings").upsert({
    id: "default",
    ...(input.refreshToken ? { refresh_token: input.refreshToken } : {}),
    ...(input.accountName ? { account_name: input.accountName } : {}),
    ...(input.locationName ? { location_name: input.locationName } : {}),
    ...(input.connectedEmail ? { connected_email: input.connectedEmail } : {}),
    ...(input.profileUrl ? { profile_url: input.profileUrl } : {}),
    connected_at: now,
    updated_at: now
  }, { onConflict: "id" });

  if (error) {
    logApiError(error, "Unable to save Google Business Profile connection.");
    return { ok: false as const, error: "Unable to save Google Business Profile connection.", status: 500 };
  }

  tokenCache = null;
  return { ok: true as const, status: 200 };
}

export async function disconnectGoogleBusinessProfile(supabase: SupabaseAdminClient | null, request?: Request, actor?: AuthProfile | null) {
  if (!supabase) return { ok: false as const, error: "Database is unavailable.", status: 503 };
  const now = new Date().toISOString();
  const { error } = await supabase.from("google_business_profile_settings").upsert({
    id: "default",
    refresh_token: null,
    connected_email: null,
    disconnected_at: now,
    updated_at: now
  }, { onConflict: "id" });

  if (error) return { ok: false as const, error: "Unable to disconnect Google Business Profile.", status: 500 };
  tokenCache = null;
  await writeAuditLog(supabase, {
    action: "google_business_profile.disconnect",
    actor,
    entityType: "google_business_profile",
    entityId: "default",
    request
  });
  return { ok: true as const, status: 200 };
}
