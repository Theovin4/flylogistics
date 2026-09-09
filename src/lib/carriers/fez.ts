import "server-only";

import { cleanEnv } from "@/lib/env";
import { inferStateCodeFromAddress, normalizeStateCode, stateName } from "@/lib/pricing";
import type { ShipmentRecord, ShipmentStatus } from "@/lib/shipments";
import { mapCarrierStatusToFlyStatus } from "@/lib/tracking-status";
import { logInfo, logWarn } from "@/server/monitoring";

type JsonRecord = Record<string, unknown>;

type FezConfig = {
  baseUrl: string | null;
  authToken: string | null;
  userId: string | null;
  password: string | null;
  secretKey: string | null;
  environment: "staging" | "production";
};

type FezResponse<T> =
  | { ok: true; data: T; status?: number }
  | { ok: false; error: string; status?: number; rawResponse?: unknown };

let tokenCache: { token: string; expiresAt: number; secretKey?: string | null } | null = null;
const MAX_FEZ_SANITIZE_DEPTH = 24;
const MAX_FEZ_SANITIZE_NODES = 600;

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : null;
}

function stringAt(record: JsonRecord | null, keys: string[]) {
  for (const key of keys) {
    const value = record?.[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return null;
}

function sanitize(value: unknown, seen = new WeakSet<object>(), depth = 0): unknown {
  if (depth > MAX_FEZ_SANITIZE_DEPTH) return "[truncated]";
  if (Array.isArray(value)) {
    if (seen.has(value)) return "[circular]";
    seen.add(value);
    return value.slice(0, MAX_FEZ_SANITIZE_NODES).map((item) => sanitize(item, seen, depth + 1));
  }
  const record = asRecord(value);
  if (!record) return value;
  if (seen.has(record)) return "[circular]";
  seen.add(record);
  return Object.fromEntries(
    Object.entries(record).slice(0, MAX_FEZ_SANITIZE_NODES).map(([key, item]) => [
      key,
      /(token|secret|key|password|authorization)/i.test(key) ? "[redacted]" : sanitize(item, seen, depth + 1)
    ])
  );
}

function normalizeBaseUrl(value?: string | null) {
  const raw = cleanEnv(value ?? undefined)?.replace(/\/$/, "");
  if (!raw) return null;
  try {
    const url = new URL(raw);
    const versionMatch = url.pathname.match(/\/v\d+/i);
    if (versionMatch?.index !== undefined) {
      url.pathname = url.pathname.slice(0, versionMatch.index + versionMatch[0].length);
    } else {
      url.pathname = `${url.pathname.replace(/\/$/, "")}/v1`;
    }
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    const versionMatch = raw.match(/\/v\d+/i);
    return (versionMatch?.index !== undefined ? raw.slice(0, versionMatch.index + versionMatch[0].length) : `${raw}/v1`).replace(/\/$/, "");
  }
}

export function getFezClientConfig(): FezConfig {
  const env = cleanEnv(process.env.FEZ_ENVIRONMENT)?.toLowerCase();
  return {
    baseUrl: normalizeBaseUrl(cleanEnv(process.env.FEZ_API_BASE_URL) ?? "https://api.fezdelivery.co/v1"),
    authToken: cleanEnv(process.env.FEZ_AUTH_TOKEN) ?? null,
    userId: cleanEnv(process.env.FEZ_USER_ID) ?? null,
    password: cleanEnv(process.env.FEZ_PASSWORD) ?? null,
    secretKey: cleanEnv(process.env.FEZ_SECRET_KEY) ?? null,
    environment: env === "staging" || env === "sandbox" || env === "development" ? "staging" : "production"
  };
}

function parseExpiry(value: unknown) {
  const timestamp = typeof value === "string" ? new Date(value).getTime() : NaN;
  return Number.isFinite(timestamp) ? Math.max(Date.now() + 60_000, timestamp - 60_000) : Date.now() + 50 * 60_000;
}

function authHeaders(token: string | null, secretKey: string | null) {
  const headers: Record<string, string> = {
    accept: "application/json",
    "content-type": "application/json"
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (secretKey) {
    headers["secret-key"] = secretKey;
    headers.secret_key = secretKey;
  }
  return headers;
}

export async function authenticateFez(config = getFezClientConfig()): Promise<FezResponse<{ authToken: string; expireToken?: string | null; secretKey?: string | null }>> {
  if (!config.baseUrl) return { ok: false, error: "FEZ_API_BASE_URL is required." };
  if (!config.userId || !config.password) return { ok: false, error: "FEZ_USER_ID and FEZ_PASSWORD are required when FEZ_AUTH_TOKEN is not set." };

  const response = await fetch(`${config.baseUrl}/user/authenticate`, {
    method: "POST",
    headers: authHeaders(null, config.secretKey),
    body: JSON.stringify({ user_id: config.userId, password: config.password }),
    cache: "no-store"
  });
  const raw = await response.json().catch(() => null);
  const body = asRecord(raw);
  const authDetails = asRecord(body?.authDetails) ?? body;
  const orgDetails = asRecord(body?.orgDetails) ?? asRecord(authDetails?.orgDetails);
  const authToken = stringAt(authDetails, ["authToken", "token", "accessToken"]);
  const expireToken = stringAt(authDetails, ["expireToken", "expiresAt", "expires_at"]);
  const secretKey = stringAt(orgDetails, ["secret-key", "secret_key", "secretKey"]) ?? config.secretKey;

  if (!response.ok || !authToken) {
    const error = stringAt(body, ["description", "message", "error"]) ?? `FEZ authentication failed with ${response.status}.`;
    return { ok: false, status: response.status, error, rawResponse: sanitize(raw) };
  }

  tokenCache = { token: authToken, expiresAt: parseExpiry(expireToken), secretKey };
  return { ok: true, status: response.status, data: { authToken, expireToken, secretKey } };
}

export async function getFezToken(options: { forceRefresh?: boolean } = {}, config = getFezClientConfig()) {
  if (!options.forceRefresh && tokenCache && tokenCache.expiresAt > Date.now()) {
    return { token: tokenCache.token, secretKey: tokenCache.secretKey ?? config.secretKey };
  }
  const auth = await authenticateFez(config);
  if (!auth.ok) {
    if (config.authToken && !options.forceRefresh) return { token: config.authToken, secretKey: config.secretKey };
    throw new Error(auth.error);
  }
  return { token: auth.data.authToken, secretKey: auth.data.secretKey ?? config.secretKey };
}

function carrierText(value: unknown, fallback = "") {
  return String(value ?? fallback).trim();
}

function normalizePhone(value: unknown) {
  const text = carrierText(value);
  const plus = text.startsWith("+") ? "+" : "";
  const digits = text.replace(/\D/g, "");
  return digits ? `${plus}${digits}` : "";
}

function supportPhone() {
  return normalizePhone(cleanEnv(process.env.NEXT_PUBLIC_WHATSAPP_NUMBER) ?? cleanEnv(process.env.NEXT_PUBLIC_SUPPORT_PHONE) ?? "+2347061072929");
}

function recipientName(shipment: ShipmentRecord) {
  return carrierText(shipment.recipient_name ?? shipment.customer_name, "Fly Logistics Customer");
}

function recipientPhone(shipment: ShipmentRecord) {
  return normalizePhone(shipment.delivery_phone ?? shipment.customer_phone) || supportPhone();
}

function pickupPhone(shipment: ShipmentRecord) {
  return normalizePhone(shipment.pickup_phone ?? shipment.customer_phone) || supportPhone();
}

function shipmentWeight(shipment: ShipmentRecord) {
  const weight = Number(shipment.weight_kg ?? 1);
  return Number.isFinite(weight) && weight > 0 ? Math.ceil(weight) : 1;
}

function shipmentValue(shipment: ShipmentRecord) {
  const value = Number(shipment.package_value ?? shipment.payment_amount ?? shipment.quoted_price ?? shipment.cod_amount ?? 1000);
  return Number.isFinite(value) && value > 0 ? value : 1000;
}

function isFct(value?: string | null, address?: string | null) {
  const code = normalizeStateCode(value) ?? inferStateCodeFromAddress(address);
  if (code === "FC") return true;
  return /\bf\s*\.?\s*c\s*\.?\s*t\b|\babuja\b|federal\s+capital\s+territory/i.test(`${value ?? ""} ${address ?? ""}`);
}

export function mapFlyStateToFezState(value?: string | null, address?: string | null, fallback = "Lagos") {
  if (isFct(value, address)) return "FCT";
  const code = normalizeStateCode(value) ?? inferStateCodeFromAddress(address);
  return code ? stateName(code) : carrierText(value, fallback);
}

export function mapFlyShipmentToFezPayload(
  shipment: ShipmentRecord,
  options: { pickupState?: string | null; recipientState?: string | null; batchId?: string | null } = {}
) {
  const batchId = options.batchId ?? `FLY-BATCH-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}`;
  const recipientState = options.recipientState ?? mapFlyStateToFezState(shipment.destination_state, shipment.delivery_address);
  const pickupState = options.pickupState ?? mapFlyStateToFezState(shipment.pickup_state, shipment.pickup_address);
  return {
    recipientAddress: carrierText(shipment.delivery_address),
    recipientState,
    recipientName: recipientName(shipment),
    recipientPhone: recipientPhone(shipment),
    recipientEmail: shipment.customer_email ?? undefined,
    uniqueID: shipment.tracking_id,
    BatchID: batchId,
    CustToken: shipment.delivery_otp ?? undefined,
    itemDescription: carrierText(shipment.package_type, "General package"),
    additionalDetails: `Fly Logistics shipment ${shipment.tracking_id}. Package should remain trackable through Fly Logistics.`,
    valueOfItem: String(shipmentValue(shipment)),
    weight: shipmentWeight(shipment),
    pickUpAddress: carrierText(shipment.pickup_address),
    pickUpState: pickupState,
    isItemCod: Number(shipment.cod_amount ?? 0) > 0,
    cashOnDeliveryAmount: Number(shipment.cod_amount ?? 0) || undefined,
    fragile: /fragile|glass|breakable/i.test(String(shipment.package_type ?? "")),
    thirdparty: "true",
    senderName: carrierText(shipment.customer_name, "Fly Logistics Customer"),
    senderAddress: carrierText(shipment.pickup_address),
    senderPhone: pickupPhone(shipment)
  };
}

async function fezFetch<T>(path: string, init: RequestInit = {}, options: { forceRefresh?: boolean } = {}): Promise<FezResponse<T>> {
  const config = getFezClientConfig();
  if (!config.baseUrl) return { ok: false, error: "FEZ_API_BASE_URL is required." };
  if (!config.secretKey || !config.userId || !config.password) {
    return { ok: false, error: "FEZ_API_BASE_URL, FEZ_USER_ID, FEZ_PASSWORD, and FEZ_SECRET_KEY are required." };
  }
  const { token, secretKey } = await getFezToken(options, config);
  const response = await fetch(`${config.baseUrl}${path}`, {
    ...init,
    headers: {
      ...authHeaders(token, secretKey),
      ...(init.headers ?? {})
    },
    cache: "no-store"
  });
  const raw = await response.json().catch(() => null);
  if (!response.ok) {
    const body = asRecord(raw);
    return {
      ok: false,
      status: response.status,
      rawResponse: sanitize(raw),
      error: stringAt(body, ["description", "message", "error", "detail"]) ?? `FEZ request failed with ${response.status}.`
    };
  }
  return { ok: true, status: response.status, data: sanitize(raw) as T };
}

export async function createFezOrder(orderPayloads: JsonRecord[]) {
  logInfo("Creating FEZ order.", { provider: "fez_logistics", count: orderPayloads.length });
  let response = await fezFetch<unknown>("/order", {
    method: "POST",
    body: JSON.stringify(orderPayloads)
  });
  if (!response.ok && response.status === 401) {
    tokenCache = null;
    response = await fezFetch<unknown>("/order", {
      method: "POST",
      body: JSON.stringify(orderPayloads)
    }, { forceRefresh: true });
  }
  if (!response.ok) logWarn("FEZ order creation failed.", { provider: "fez_logistics", status: response.status, error: response.error });
  return response;
}

export async function trackFezOrder(orderNumber: string) {
  let response = await fezFetch<unknown>(`/order/track/${encodeURIComponent(orderNumber)}`, { method: "GET" });
  if (!response.ok && response.status === 401) {
    tokenCache = null;
    response = await fezFetch<unknown>(`/order/track/${encodeURIComponent(orderNumber)}`, { method: "GET" }, { forceRefresh: true });
  }
  return response;
}

export async function registerFezWebhook(webhook: string) {
  return fezFetch<unknown>("/webhooks/store", {
    method: "POST",
    body: JSON.stringify({ webhook })
  });
}

export function mapFezStatusToFlyStatus(status?: string | null): ShipmentStatus | null {
  return mapCarrierStatusToFlyStatus(status);
}
