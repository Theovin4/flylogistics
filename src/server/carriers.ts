import { cleanEnv } from "@/lib/env";
import { canonicalSiteUrl } from "@/lib/site";
import {
  carrierProviderLabels,
  isFutureCarrierProvider,
  normalizeCarrierProvider,
  type CarrierProvider,
  type CarrierRateQuote
} from "@/lib/carriers";
import { inferStateCodeFromAddress, normalizeStateCode, stateName } from "@/lib/pricing";
import type { ShipmentRecord } from "@/lib/shipments";
import {
  getFezConfig,
  getSendboxConfig,
  resetFezAuthCache,
  resolveFezAuthHeaders,
  sendboxAuthHeaders
} from "@/server/carrier-config";
import { mapFlyShipmentToFezPayload } from "@/lib/carriers/fez";
import { logInfo, logWarn } from "@/server/monitoring";

type CarrierCreateResult = {
  provider: CarrierProvider;
  carrierShipmentId?: string | null;
  carrierTrackingId?: string | null;
  carrierOrderId?: string | null;
  carrierLabelUrl?: string | null;
  carrierRateAmount?: number | null;
  carrierStatus?: string | null;
  rawResponse?: unknown;
};

type CarrierTrackResult = {
  provider: CarrierProvider;
  carrierStatus?: string | null;
  carrierTrackingId?: string | null;
  carrierOrderId?: string | null;
  carrierRateAmount?: number | null;
  rawResponse?: unknown;
};

type CarrierResponse<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; status?: number; rawResponse?: unknown };

type JsonRecord = Record<string, unknown>;
const MAX_CARRIER_PARSE_DEPTH = 24;
const MAX_CARRIER_PARSE_NODES = 600;

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : null;
}

function nestedRecord(record: JsonRecord | null, key: string) {
  return asRecord(record?.[key]);
}

function stringAt(record: JsonRecord | null, keys: string[]) {
  for (const key of keys) {
    const value = record?.[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return null;
}

function numberAt(record: JsonRecord | null, keys: string[], depth = 0): number | null {
  if (depth > MAX_CARRIER_PARSE_DEPTH) return null;
  for (const key of keys) {
    const value = record?.[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && Number.isFinite(Number(value))) return Number(value);
    const valueRecord = asRecord(value);
    if (valueRecord) {
      const nested: number | null = numberAt(valueRecord, ["amount", "value", "total"], depth + 1);
      if (nested !== null) return nested;
    }
  }
  return null;
}

function sanitizeCarrierResponse(value: unknown, seen = new WeakSet<object>(), depth = 0): unknown {
  if (depth > MAX_CARRIER_PARSE_DEPTH) return "[truncated]";
  if (Array.isArray(value)) {
    if (seen.has(value)) return "[circular]";
    seen.add(value);
    return value.slice(0, MAX_CARRIER_PARSE_NODES).map((item) => sanitizeCarrierResponse(item, seen, depth + 1));
  }
  const record = asRecord(value);
  if (!record) return value;
  if (seen.has(record)) return "[circular]";
  seen.add(record);
  return Object.fromEntries(
    Object.entries(record)
      .filter(([key]) => !/(secret|api[_-]?key|token|authorization|password)/i.test(key))
      .slice(0, MAX_CARRIER_PARSE_NODES)
      .map(([key, item]) => [key, sanitizeCarrierResponse(item, seen, depth + 1)])
  );
}

function firstArray(record: JsonRecord | null, keys: string[]) {
  for (const key of keys) {
    const value = record?.[key];
    if (Array.isArray(value)) return value;
  }
  return [];
}

function firstRecord(value: unknown) {
  const direct = asRecord(value);
  if (direct) return direct;
  if (Array.isArray(value)) return asRecord(value[0]);
  return null;
}

function recordsFrom(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.map(asRecord).filter(Boolean) as JsonRecord[] : [];
}

function recordsDeepFrom(value: unknown): JsonRecord[] {
  const records: JsonRecord[] = [];
  const seen = new WeakSet<object>();
  const stack: Array<{ item: unknown; depth: number }> = [{ item: value, depth: 0 }];
  while (stack.length && records.length < MAX_CARRIER_PARSE_NODES) {
    const { item, depth } = stack.pop()!;
    if (depth > MAX_CARRIER_PARSE_DEPTH) continue;
    if (item && typeof item === "object") {
      if (seen.has(item)) continue;
      seen.add(item);
    }
    if (Array.isArray(item)) {
      for (const child of item.slice(0, MAX_CARRIER_PARSE_NODES)) stack.push({ item: child, depth: depth + 1 });
      continue;
    }
    const record = asRecord(item);
    if (!record) continue;
    records.push(record);
    for (const child of Object.values(record).slice(0, MAX_CARRIER_PARSE_NODES)) stack.push({ item: child, depth: depth + 1 });
  }
  return records;
}

function stringValuesFrom(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string | number => typeof item === "string" || typeof item === "number").map(String)
    : [];
}

function looksLikeFezOrderNumber(value: string | null | undefined, trackingId?: string | null) {
  const text = String(value ?? "").trim();
  if (!text) return false;
  const normalizedTrackingId = String(trackingId ?? "").trim().toUpperCase();
  if (normalizedTrackingId && text.toUpperCase() === normalizedTrackingId) return false;
  if (text.toUpperCase().startsWith("FLY-")) return false;
  if (/success|created|pending|pick|delivery|shipment|order\s+success|invalid|failed|error/i.test(text)) return false;
  return /^[A-Z0-9][A-Z0-9-]{5,39}$/i.test(text);
}

function looksLikeCarrierStatus(value: string | null | undefined) {
  const text = String(value ?? "").trim();
  if (!text) return false;
  if (/^[A-Z0-9][A-Z0-9-]{5,39}$/i.test(text) && !/\s/.test(text)) return false;
  return /(pending|pick|pickup|picked|collect|assign|dispatch|transit|route|hub|arriv|deliver|cancel|failed|success|created|booked|confirmed)/i.test(text);
}

function deepCarrierStatus(raw: unknown) {
  const statusKeys = [
    "orderStatus",
    "OrderStatus",
    "order_status",
    "deliveryStatus",
    "DeliveryStatus",
    "delivery_status",
    "statusDescription",
    "StatusDescription",
    "status_description",
    "currentStatus",
    "CurrentStatus",
    "current_status",
    "shipmentStatus",
    "ShipmentStatus",
    "shipment_status",
    "status",
    "message",
    "description"
  ];
  for (const record of recordsDeepFrom(raw)) {
    const value = stringAt(record, statusKeys);
    if (looksLikeCarrierStatus(value)) return value;
  }
  return null;
}

function sendboxEndpointCandidates(baseUrl: string, path: string, alternatePaths: string[] = []) {
  const paths = [path, ...alternatePaths].map((item) => (item.startsWith("/") ? item : `/${item}`));
  const urls = new Set<string>();
  for (const normalizedPath of paths) {
    urls.add(`${baseUrl}${normalizedPath}`);
    urls.add(`${baseUrl}${normalizedPath}/`);
  }

  try {
    const url = new URL(baseUrl);
    if (url.hostname === "live.sendbox.co") {
      for (const normalizedPath of paths) {
        urls.add(`https://api.sendbox.co${normalizedPath}`);
        urls.add(`https://api.sendbox.co${normalizedPath}/`);
      }
    }
    if (url.hostname === "api.sendbox.co") {
      for (const normalizedPath of paths) {
        urls.add(`https://live.sendbox.co${normalizedPath}`);
        urls.add(`https://live.sendbox.co${normalizedPath}/`);
      }
    }
  } catch {
    // The configuration validator already logs invalid base URLs; use the configured value only.
  }

  return Array.from(urls);
}

async function fetchFirstJson(urls: string[], init: RequestInit) {
  let lastResponse: CarrierResponse<unknown> | null = null;
  for (const url of urls) {
    const response = await fetchJson(url, init);
    if (response.ok || response.status !== 404) return response;
    lastResponse = response;
  }
  return lastResponse ?? { ok: false, status: 404, error: "Carrier endpoint was not found." };
}

function carrierTimeoutMs() {
  const configured = Number(process.env.CARRIER_API_TIMEOUT_MS ?? 12000);
  return Number.isFinite(configured) && configured >= 3000 ? Math.min(configured, 20000) : 12000;
}

function splitName(name: string | null | undefined) {
  const parts = String(name ?? "Fly Logistics Customer").trim().split(/\s+/);
  return {
    firstName: parts[0] || "Fly",
    lastName: parts.slice(1).join(" ") || "Customer"
  };
}

function cleanCarrierText(value: unknown, fallback = "") {
  return String(value ?? fallback).trim();
}

function normalizePhone(value: unknown) {
  const text = cleanCarrierText(value);
  if (!text) return "";
  const withPlus = text.startsWith("+") ? "+" : "";
  const digits = text.replace(/\D/g, "");
  return digits ? `${withPlus}${digits}` : "";
}

function supportPhone() {
  return normalizePhone(cleanEnv(process.env.NEXT_PUBLIC_WHATSAPP_NUMBER) ?? cleanEnv(process.env.NEXT_PUBLIC_SUPPORT_PHONE) ?? "+2347061072929");
}

function recipientPhone(shipment: ShipmentRecord) {
  return normalizePhone(shipment.delivery_phone ?? shipment.customer_phone) || supportPhone();
}

function pickupPhone(shipment: ShipmentRecord) {
  return normalizePhone(shipment.pickup_phone ?? shipment.customer_phone) || supportPhone();
}

function recipientName(shipment: ShipmentRecord) {
  return cleanCarrierText(shipment.recipient_name ?? shipment.customer_name, "Fly Logistics Customer");
}

function countryCode(value: unknown, fallback = "NG") {
  const normalized = cleanCarrierText(value, fallback).toUpperCase();
  if (!normalized || normalized === "NIGERIA") return "NG";
  if (normalized.length === 2) return normalized;
  return fallback;
}

function carrierStateName(value: string | null | undefined, address: string | null | undefined, fallback = "Lagos") {
  const code = normalizeStateCode(value) ?? inferStateCodeFromAddress(address);
  if (code) return stateName(code);

  const text = String(value ?? address ?? "").toLowerCase();
  const knownStates = ["lagos", "abuja", "ogun", "oyo", "rivers", "kano", "enugu", "kaduna", "edo"];
  const inferred = knownStates.find((state) => text.includes(state));
  return inferred ? inferred.replace(/\b\w/g, (letter) => letter.toUpperCase()) : fallback;
}

function isFctState(value: string | null | undefined, address: string | null | undefined) {
  const code = normalizeStateCode(value) ?? inferStateCodeFromAddress(address);
  if (code === "FC") return true;

  const text = `${value ?? ""} ${address ?? ""}`.toLowerCase();
  return /\bf\s*\.?\s*c\s*\.?\s*t\b|\babuja\b|federal\s+capital\s+territory/.test(text);
}

function fezStateName(value: string | null | undefined, address: string | null | undefined, fallback = "Lagos") {
  if (isFctState(value, address)) return "FCT";
  return carrierStateName(value, address, fallback);
}

function fezStateAlternates(value: string | null | undefined, address: string | null | undefined, fallback = "Lagos") {
  const primary = fezStateName(value, address, fallback);
  if (primary !== "FCT") return [primary];
  return ["FCT", "Abuja", "Federal Capital Territory"];
}

function shipmentWeight(shipment: ShipmentRecord) {
  const weight = Number(shipment.weight_kg ?? 1);
  return Number.isFinite(weight) && weight > 0 ? weight : 1;
}

function shipmentValue(shipment: ShipmentRecord) {
  const value = Number(shipment.payment_amount ?? shipment.quoted_price ?? shipment.cod_amount ?? 1000);
  return Number.isFinite(value) && value > 0 ? value : 1000;
}

function validateCarrierShipment(shipment: ShipmentRecord, provider: CarrierProvider) {
  const missing: string[] = [];
  if (!cleanCarrierText(shipment.pickup_address)) missing.push("pickup address");
  if (!cleanCarrierText(shipment.delivery_address)) missing.push("delivery address");
  if (!cleanCarrierText(shipment.package_type)) missing.push("package type");
  if (!recipientName(shipment)) missing.push("receiver name");
  if (!recipientPhone(shipment)) missing.push("receiver phone");
  if (!pickupPhone(shipment)) missing.push("pickup phone");
  if (!carrierStateName(shipment.destination_state, shipment.delivery_address)) missing.push("destination state");
  if (provider === "fez_logistics" && !carrierStateName(shipment.pickup_state, shipment.pickup_address)) missing.push("pickup state");

  if (missing.length) {
    return `Add ${missing.join(", ")} before sending this shipment to ${carrierProviderLabels[provider]}.`;
  }
  return null;
}

async function fetchJson(url: string, init: RequestInit): Promise<CarrierResponse<unknown>> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), carrierTimeoutMs());
  try {
    const response = await fetch(url, {
      ...init,
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        ...(init.headers ?? {})
      },
      cache: "no-store",
      signal: init.signal ?? controller.signal
    });
    const raw = await response.json().catch(() => null);
    if (!response.ok) {
      const body = asRecord(raw);
      return {
        ok: false,
        status: response.status,
        rawResponse: sanitizeCarrierResponse(raw),
        error: stringAt(body, ["message", "description", "error", "detail"]) ?? `Carrier request failed with ${response.status}.`
      };
    }
    return { ok: true, data: sanitizeCarrierResponse(raw) };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return { ok: false, status: 408, error: "Carrier request timed out. The shipment was kept in Fly Logistics and can be retried from admin." };
    }
    return { ok: false, error: error instanceof Error ? error.message : "Carrier request failed." };
  } finally {
    clearTimeout(timeout);
  }
}

function internalRate(shipment: ShipmentRecord): CarrierRateQuote {
  return {
    provider: "internal_fly_logistics",
    serviceName: "Fly Logistics managed delivery",
    amount: Number(shipment.payment_amount ?? shipment.quoted_price ?? 0) || null,
    currency: "NGN",
    etaLabel: shipment.eta ?? null,
    rateId: shipment.tracking_id
  };
}

function sendboxPayload(shipment: ShipmentRecord, selectedRateId?: string | null) {
  const customer = splitName(recipientName(shipment));
  const pickupState = carrierStateName(shipment.pickup_state, shipment.pickup_address);
  const destinationState = carrierStateName(shipment.destination_state, shipment.delivery_address);
  const destinationCountry = countryCode(shipment.destination_country);
  const serviceType = destinationCountry === "NG" ? "local" : "international";
  const serviceCode = shipment.urgency === "critical" ? "expedient" : shipment.urgency === "priority" ? "premium" : "standard";
  const weight = shipmentWeight(shipment);
  const totalValue = shipmentValue(shipment);
  const itemDescription = `${shipment.package_type} - Fly Logistics ${shipment.tracking_id}`;

  return {
    origin: {
      first_name: "Fly",
      last_name: "Logistics",
      name: "Fly Logistics",
      street: shipment.pickup_address,
      street_line_2: "",
      state: pickupState.toLowerCase(),
      city: pickupState,
      country: "NG",
      post_code: "",
      phone: pickupPhone(shipment),
      email: null
    },
    destination: {
      first_name: customer.firstName,
      last_name: customer.lastName,
      name: recipientName(shipment),
      street: shipment.delivery_address,
      street_line_2: "",
      state: destinationState.toLowerCase(),
      city: destinationState,
      country: destinationCountry,
      post_code: "",
      phone: recipientPhone(shipment),
      email: shipment.customer_email ?? ""
    },
    weight,
    dimension: { length: 10, width: 10, height: 10 },
    items: [
      {
        name: shipment.package_type,
        description: itemDescription,
        item_type_code: "other",
        package_size_code: weight > 10 ? "large" : weight > 3 ? "medium" : "small",
        quantity: 1,
        weight,
        value: totalValue
      }
    ],
    incoming_option: "pickup",
    pickup_date: new Date().toISOString().slice(0, 10),
    total_value: totalValue,
    package_type: "general",
    channel_code: "api",
    service_type: serviceType,
    service_code: serviceCode,
    region: "NG",
    currency: "NGN",
    ...(selectedRateId ? { selected_courier_id: selectedRateId, use_selected_rate: true } : {}),
    callback_url: `${canonicalSiteUrl}/api/webhooks/sendbox`
  };
}

function normalizeSendboxRates(raw: unknown): CarrierRateQuote[] {
  const body = asRecord(raw);
  return firstArray(body, ["rates", "data", "results"]).map((item) => {
    const rate = asRecord(item);
    return {
      provider: "sendbox",
      serviceName: stringAt(rate, ["name", "description", "rate_type", "service_code"]) ?? "Sendbox carrier rate",
      amount: numberAt(rate, ["fee", "amount", "price", "total"]),
      currency: stringAt(rate, ["currency"]) ?? "NGN",
      etaLabel: stringAt(rate, ["delivery_eta_string", "delivery_window", "sla_description"]),
      rateId: stringAt(rate, ["rate_card_id", "key", "id", "code"]),
      rawResponse: item
    };
  });
}

function sendboxCreateResult(raw: unknown): CarrierCreateResult {
  const body = asRecord(raw);
  const status = nestedRecord(body, "current_status") ?? nestedRecord(body, "status");
  const tracking = nestedRecord(body, "tracking");
  const paymentData = nestedRecord(body, "payment_data");
  return {
    provider: "sendbox",
    carrierShipmentId: stringAt(body, ["id", "_id", "shipment_id"]),
    carrierTrackingId: stringAt(body, ["code", "tracking_code", "reference_code"]) ?? stringAt(tracking, ["code"]),
    carrierLabelUrl: stringAt(body, ["label_url", "waybill_url", "package_invoice_image"]),
    carrierRateAmount: numberAt(paymentData, ["amount"]) ?? numberAt(body, ["paid", "fee", "amount"]),
    carrierStatus: stringAt(status, ["code", "name"]) ?? stringAt(body, ["status_code"]),
    rawResponse: raw
  };
}

function sendboxTrackResult(raw: unknown): CarrierTrackResult {
  const body = asRecord(raw);
  const status = nestedRecord(body, "status") ?? nestedRecord(body, "current_status");
  return {
    provider: "sendbox",
    carrierStatus: stringAt(status, ["code", "name"]) ?? stringAt(body, ["status_code"]),
    carrierTrackingId: stringAt(body, ["code", "tracking_code", "reference_code"]),
    rawResponse: raw
  };
}

function fezPayloadWithStates(shipment: ShipmentRecord, states: { pickupState: string; destinationState: string }) {
  return [
    mapFlyShipmentToFezPayload(shipment, {
      pickupState: states.pickupState,
      recipientState: states.destinationState,
      batchId: `FLY-BATCH-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}`
    })
  ];
}

function fezInvalidStateError(response: CarrierResponse<unknown>) {
  return !response.ok && response.status === 400 && /state\s+is\s+invalid|invalid\s+state|recipient.*state/i.test(response.error);
}

function fezDeliveryType(shipment: ShipmentRecord) {
  const category = String(shipment.delivery_category ?? shipment.delivery_type ?? "").toLowerCase();
  if (category.includes("import")) return "import";
  if (category.includes("export") || category.includes("international")) return "export";
  return "local";
}

function normalizeFezRates(raw: unknown, shipment: ShipmentRecord, etaLabel?: string | null): CarrierRateQuote[] {
  const body = asRecord(raw);
  const costs = firstArray(body, ["Cost", "cost", "data", "rates"]);
  const destinationState = fezStateName(shipment.destination_state, shipment.delivery_address);
  const rates = costs.length ? costs : [body].filter(Boolean);
  return rates.map((item) => {
    const rate = asRecord(item);
    const state = stringAt(rate, ["state", "destination_state", "recipientState"]);
    return {
      provider: "fez_logistics",
      serviceName: state ? `FEZ delivery to ${state}` : "FEZ delivery rate",
      amount: numberAt(rate, ["cost", "amount", "price", "total"]),
      currency: stringAt(rate, ["currency"]) ?? "NGN",
      etaLabel: etaLabel ?? stringAt(rate, ["eta", "delivery_eta", "delivery_time"]),
      rateId: stringAt(rate, ["rate_id", "id", "code"]) ?? destinationState,
      rawResponse: item
    };
  });
}

function orderNumberFromFezValue(value: unknown, trackingId: string, seen = new WeakSet<object>(), depth = 0): string | null {
  if (depth > MAX_CARRIER_PARSE_DEPTH) return null;
  if (value && typeof value === "object") {
    if (seen.has(value)) return null;
    seen.add(value);
  }
  const normalizedTrackingId = String(trackingId ?? "").trim().toUpperCase();
  if (typeof value === "string" || typeof value === "number") {
    const text = String(value).trim();
    if (looksLikeFezOrderNumber(text, normalizedTrackingId)) {
      return text;
    }
  }

  for (const item of stringValuesFrom(value)) {
    const nested = orderNumberFromFezValue(item, trackingId, seen, depth + 1);
    if (nested) return nested;
  }

  const record = asRecord(value);
  if (record) {
    const direct = stringAt(record, [trackingId, normalizedTrackingId, trackingId.toLowerCase()]);
    if (direct) return direct;

    const recordNumber = stringAt(record, [
      "orderNo",
      "OrderNo",
      "orderNumber",
      "OrderNumber",
      "order_number",
      "waybillNumber",
      "WaybillNumber",
      "waybill_number",
      "trackingNumber",
      "TrackingNumber",
      "tracking_number",
      "order_no",
      "orderNos",
      "OrderNos",
      "waybillNo",
      "WaybillNo",
      "waybill",
      "Waybill",
      "trackingId",
      "TrackingId",
      "tracking_id",
      "carrierOrderNo",
      "carrier_order_no",
      "carrierTrackingId",
      "carrier_tracking_id"
    ]);
    const recordUniqueId = stringAt(record, [
      "uniqueID",
      "UniqueID",
      "uniqueId",
      "unique_id",
      "reference",
      "referenceId",
      "clientReference",
      "client_reference",
      "clientRef",
      "client_ref"
    ]);
    if (recordNumber && looksLikeFezOrderNumber(recordNumber, normalizedTrackingId) && (!recordUniqueId || recordUniqueId.toUpperCase() === normalizedTrackingId)) return recordNumber;

    for (const item of Object.values(record).slice(0, MAX_CARRIER_PARSE_NODES)) {
      const nested = orderNumberFromFezValue(item, trackingId, seen, depth + 1);
      if (nested) return nested;
    }
  }

  for (const item of recordsFrom(value)) {
    const nested = orderNumberFromFezValue(item, trackingId, seen, depth + 1);
    if (nested) return nested;
  }

  return null;
}

function fezCreateResult(raw: unknown, shipment: ShipmentRecord): CarrierCreateResult {
  const body = firstRecord(raw);
  const nestedData = body ? body.data : null;
  const dataRecord = firstRecord(nestedData);
  const responseRecord = nestedRecord(body, "Response") ?? nestedRecord(body, "response");
  const orderNosValue =
    body?.orderNos ??
    body?.OrderNos ??
    body?.order_nos ??
    body?.Order_Nos ??
    body?.order_numbers ??
    body?.orderNumbers ??
    body?.OrderNumbers ??
    body?.order_no ??
    body?.orders ??
    body?.Orders ??
    body?.orderNo ??
    body?.OrderNo ??
    body?.orderNumber ??
    body?.OrderNumber ??
    dataRecord?.orderNos ??
    dataRecord?.OrderNos ??
    dataRecord?.order_nos ??
    dataRecord?.order_numbers ??
    dataRecord?.orderNumbers ??
    responseRecord ??
    dataRecord ??
    raw;
  const orderNos = asRecord(orderNosValue) ?? responseRecord ?? dataRecord;
  const orderNoCandidate =
    orderNumberFromFezValue(orderNosValue, shipment.tracking_id) ??
    stringAt(orderNos, [shipment.tracking_id]) ??
    stringAt(dataRecord, ["orderNo", "OrderNo", "orderNumber", "OrderNumber", "order_number", "waybillNumber", "WaybillNumber", "waybill_number", "trackingNumber", "TrackingNumber"]) ??
    stringAt(body, ["orderNo", "OrderNo", "orderNumber", "OrderNumber", "order_number", "waybillNumber", "WaybillNumber", "waybill_number", "trackingNumber", "TrackingNumber", "order_no"]) ??
    stringAt(orderNos, Object.keys(orderNos ?? {}));
  const orderNo = looksLikeFezOrderNumber(orderNoCandidate, shipment.tracking_id) ? orderNoCandidate : null;
  const carrierStatus =
    stringAt(body, ["status", "orderStatus", "order_status", "description", "message"]) ??
    stringAt(dataRecord, ["status", "orderStatus", "order_status", "description", "message"]) ??
    "created";

  return {
    provider: "fez_logistics",
    carrierShipmentId: orderNo,
    carrierOrderId: orderNo,
    carrierTrackingId: orderNo,
    carrierRateAmount: numberAt(body, ["cost", "amount", "price", "total"]),
    carrierStatus: orderNo ? carrierStatus : carrierStatus || "created",
    rawResponse: raw
  };
}

function fezResponseLooksCreated(raw: unknown) {
  const body = firstRecord(raw);
  if (!body) return false;
  const status = stringAt(body, ["status", "description", "message"]);
  const text = JSON.stringify(sanitizeCarrierResponse(raw));
  if (
    (status && /success|created|processed|received|already\s+exists|duplicate|already\s+created/i.test(status)) ||
    /order\s+successfully\s+created|successfully\s+created|orderNos|order_nos|orderNo|orderNumber/i.test(text)
  ) return true;
  if (orderNumberFromFezValue(raw, "FLY-")) return true;
  if (body.orderNos || body.order_nos || body.order_numbers || nestedRecord(body, "Response") || nestedRecord(body, "response")) return true;
  if (firstRecord(body.data)) return true;
  return false;
}

function fezTrackResult(raw: unknown): CarrierTrackResult {
  const body = asRecord(raw);
  const orderDetails = firstRecord(body?.orderDetails) ?? firstRecord(body?.OrderDetails);
  const order =
    nestedRecord(body, "order") ??
    nestedRecord(body, "Order") ??
    orderDetails ??
    firstRecord(body?.data) ??
    nestedRecord(body, "data") ??
    recordsDeepFrom(raw).find((record) => stringAt(record, ["orderNo", "orderNumber", "waybillNumber", "trackingNumber"])) ??
    body;
  const orderNumber = stringAt(order, ["orderNo", "OrderNo", "orderNumber", "OrderNumber", "waybillNumber", "WaybillNumber", "trackingNumber", "TrackingNumber"]);
  const latestHistory = firstArray(body, ["history", "History", "timeline", "Timeline"])[0];
  const latestHistoryRecord = asRecord(latestHistory);
  const carrierStatus =
    stringAt(order, ["orderStatus", "OrderStatus", "status", "carrier_status"]) ??
    stringAt(latestHistoryRecord, ["orderStatus", "OrderStatus", "status", "statusDescription"]) ??
    deepCarrierStatus(raw) ??
    stringAt(body, ["orderStatus", "status"]) ??
    "synced";
  return {
    provider: "fez_logistics",
    carrierStatus,
    carrierTrackingId: orderNumber,
    carrierOrderId: orderNumber,
    carrierRateAmount: numberAt(order, ["cost", "deliveryCost", "amount", "price", "totalCost"]) ?? numberAt(body, ["totalCost", "deliveryCost", "cost", "amount"]),
    rawResponse: raw
  };
}

function fezSearchResult(raw: unknown, flyTrackingId: string) {
  const body = asRecord(raw);
  const data = nestedRecord(body, "data") ?? firstRecord(body?.data) ?? body;
  const orderNumber =
    stringAt(data, ["orderNumber", "orderNo", "order_number", "waybillNumber", "waybill_number"]) ??
    orderNumberFromFezValue(data, flyTrackingId) ??
    orderNumberFromFezValue(raw, flyTrackingId);
  return orderNumber && !orderNumber.toUpperCase().startsWith("FLY-") ? orderNumber : null;
}

async function findFezOrderByFlyTracking(
  config: ReturnType<typeof getFezConfig>,
  headers: Record<string, string>,
  flyTrackingId: string
): Promise<CarrierResponse<CarrierTrackResult> | null> {
  if (!config.baseUrl) return null;
  const encoded = encodeURIComponent(flyTrackingId);
  const candidates: Array<{ path: string; method: "GET" | "POST"; body?: Record<string, string> }> = [
    { path: `/orders/search/${encoded}`, method: "GET" },
    { path: `/order/search/${encoded}`, method: "GET" },
    { path: `/orders/search?keyword=${encoded}`, method: "GET" },
    { path: `/order/search?keyword=${encoded}`, method: "GET" },
    { path: `/orders/search?uniqueID=${encoded}`, method: "GET" },
    { path: `/order/search?uniqueID=${encoded}`, method: "GET" },
    { path: `/orders?search=${encoded}`, method: "GET" },
    { path: `/order?search=${encoded}`, method: "GET" },
    { path: "/orders/search", method: "POST", body: { keyword: flyTrackingId, uniqueID: flyTrackingId, uniqueId: flyTrackingId, reference: flyTrackingId } },
    { path: "/order/search", method: "POST", body: { keyword: flyTrackingId, uniqueID: flyTrackingId, uniqueId: flyTrackingId, reference: flyTrackingId } }
  ];

  let lastError: CarrierResponse<unknown> | null = null;
  for (const candidate of candidates) {
    const response = await fetchJson(`${config.baseUrl}${candidate.path}`, {
      method: candidate.method,
      headers,
      ...(candidate.body ? { body: JSON.stringify(candidate.body) } : {})
    });

    if (!response.ok) {
      lastError = response;
      if (response.status === 401) return { ok: false, error: response.error, status: response.status, rawResponse: response.rawResponse };
      if (response.status === 404 || response.status === 405) continue;
      continue;
    }

    const orderNumber = fezSearchResult(response.data, flyTrackingId);
    if (!orderNumber) continue;

    const tracked = await fetchJson(`${config.baseUrl}/order/track/${encodeURIComponent(orderNumber)}`, {
      method: "GET",
      headers
    });
    if (tracked.ok) return { ok: true, data: fezTrackResult(tracked.data) };

    return {
      ok: true,
      data: {
        provider: "fez_logistics",
        carrierStatus: "created",
        carrierOrderId: orderNumber,
        carrierTrackingId: orderNumber,
        rawResponse: response.data
      }
    };
  }

  if (lastError && lastError.status && ![404, 405].includes(lastError.status)) {
    return { ok: false, error: lastError.error, status: lastError.status, rawResponse: lastError.rawResponse };
  }
  return null;
}

export async function cancelFezOrder(orderNumber: string) {
  const config = getFezConfig("cancel_order");
  if (!config.configured || !config.baseUrl) {
    return { ok: false, error: `FEZ Logistics is not configured for ${config.environment}. Missing: ${config.missing.join(", ")}.` } satisfies CarrierResponse<unknown>;
  }
  const auth = await resolveFezAuthHeaders(config);
  if (!auth.ok) return { ok: false, error: auth.error, status: auth.status } satisfies CarrierResponse<unknown>;
  // TODO: Confirm the final FEZ cancellation endpoint with FEZ support before enabling admin cancellation.
  const response = await fetchJson(`${config.baseUrl}/order/${encodeURIComponent(orderNumber)}`, {
    method: "DELETE",
    headers: auth.headers
  });
  if (!response.ok) logWarn("FEZ order cancellation failed.", { provider: "fez_logistics", environment: config.environment, orderNumber, status: response.status, error: response.error });
  return response;
}

export async function getFezInternationalRates(shipment: ShipmentRecord) {
  const config = getFezConfig("international_rates");
  if (!config.configured || !config.baseUrl) {
    return { ok: false, error: `FEZ Logistics is not configured for ${config.environment}. Missing: ${config.missing.join(", ")}.` } satisfies CarrierResponse<unknown>;
  }
  let auth = await resolveFezAuthHeaders(config);
  if (!auth.ok) return { ok: false, error: auth.error, status: auth.status } satisfies CarrierResponse<unknown>;
  // TODO: Map import/export rate payloads once FEZ confirms the exact international rate endpoint for this account.
  let response = await fetchJson(`${config.baseUrl}/delivery-time-estimate`, {
    method: "POST",
    headers: auth.headers,
    body: JSON.stringify({
      delivery_type: fezDeliveryType(shipment),
      pick_up_state: fezStateName(shipment.pickup_state, shipment.pickup_address),
      drop_off_state: fezStateName(shipment.destination_state, shipment.delivery_address)
    })
  });
  if (!response.ok && response.status === 401) {
    resetFezAuthCache();
    auth = await resolveFezAuthHeaders(config, { forceRefresh: true });
    if (!auth.ok) return { ok: false, error: auth.error, status: auth.status } satisfies CarrierResponse<unknown>;
    response = await fetchJson(`${config.baseUrl}/delivery-time-estimate`, {
      method: "POST",
      headers: auth.headers,
      body: JSON.stringify({
        delivery_type: fezDeliveryType(shipment),
        pick_up_state: fezStateName(shipment.pickup_state, shipment.pickup_address),
        drop_off_state: fezStateName(shipment.destination_state, shipment.delivery_address)
      })
    });
  }
  if (!response.ok) logWarn("FEZ international rate placeholder failed.", { provider: "fez_logistics", environment: config.environment, trackingId: shipment.tracking_id, status: response.status, error: response.error });
  return response;
}

export async function getFezLockerOptions() {
  const config = getFezConfig("locker_options");
  if (!config.configured || !config.baseUrl) {
    return { ok: false, error: `FEZ Logistics is not configured for ${config.environment}. Missing: ${config.missing.join(", ")}.` } satisfies CarrierResponse<unknown>;
  }
  const auth = await resolveFezAuthHeaders(config);
  if (!auth.ok) return { ok: false, error: auth.error, status: auth.status } satisfies CarrierResponse<unknown>;
  // TODO: Confirm whether the account uses /locker or /lockers; current FEZ docs list Locker endpoints but account-level availability may vary.
  const response = await fetchJson(`${config.baseUrl}/locker`, {
    method: "GET",
    headers: auth.headers
  });
  if (!response.ok) logWarn("FEZ locker option lookup failed.", { provider: "fez_logistics", environment: config.environment, status: response.status, error: response.error });
  return response;
}

export async function getCarrierRates(shipment: ShipmentRecord, providers?: CarrierProvider[]) {
  const selectedProviders = providers?.length ? providers : ["internal_fly_logistics", "sendbox", "fez_logistics"] as CarrierProvider[];
  const rates: CarrierRateQuote[] = [];
  const errors: Record<string, string> = {};

  for (const provider of selectedProviders) {
    if (provider === "internal_fly_logistics") {
      rates.push(internalRate(shipment));
      continue;
    }

    if (provider === "sendbox") {
      const validationError = validateCarrierShipment(shipment, provider);
      if (validationError) {
        errors.sendbox = validationError;
        continue;
      }
      const config = getSendboxConfig("rates");
      if (!config.configured || !config.baseUrl) {
        errors.sendbox = `Sendbox is not configured for ${config.environment}. Missing: ${config.missing.join(", ")}.`;
        continue;
      }
      logInfo("Requesting Sendbox carrier rates.", { provider: "sendbox", environment: config.environment });
      const response = await fetchFirstJson(sendboxEndpointCandidates(config.baseUrl, "/shipping/shipment_delivery_quote", [
        "/shipping/shipment-delivery-quote",
        "/shipping/rates",
        "/shipment_delivery_quote",
        "/rates"
      ]), {
        method: "POST",
        headers: sendboxAuthHeaders(config),
        body: JSON.stringify(sendboxPayload(shipment))
      });
      if (response.ok) rates.push(...normalizeSendboxRates(response.data));
      else {
        logWarn("Sendbox rate retrieval failed.", { provider: "sendbox", environment: config.environment, status: response.status, error: response.error });
        errors.sendbox = response.error;
      }
    }

    if (provider === "fez_logistics") {
      const validationError = validateCarrierShipment(shipment, provider);
      if (validationError) {
        errors.fez_logistics = validationError;
        continue;
      }
      const config = getFezConfig("rates");
      if (!config.configured || !config.baseUrl) {
        errors.fez_logistics = `FEZ Logistics is not configured for ${config.environment}. Missing: ${config.missing.join(", ")}.`;
        continue;
      }
      let auth = await resolveFezAuthHeaders(config);
      if (!auth.ok) {
        logWarn("FEZ Logistics rate authentication failed.", { provider: "fez_logistics", environment: config.environment, status: auth.status, error: auth.error });
        errors.fez_logistics = auth.error;
        continue;
      }
      let authHeaders = auth.headers;
      logInfo("Requesting FEZ Logistics carrier rates.", { provider: "fez_logistics", environment: config.environment, trackingId: shipment.tracking_id });
      let response: CarrierResponse<unknown> | null = null;
      for (const destinationState of fezStateAlternates(shipment.destination_state, shipment.delivery_address)) {
        for (const pickupState of fezStateAlternates(shipment.pickup_state, shipment.pickup_address)) {
          response = await fetchJson(`${config.baseUrl}/order/cost`, {
            method: "POST",
            headers: authHeaders,
            body: JSON.stringify({
              state: destinationState,
              pickUpState: pickupState,
              weight: shipmentWeight(shipment)
            })
          });
          if (!response.ok && response.status === 401) {
            resetFezAuthCache();
            auth = await resolveFezAuthHeaders(config, { forceRefresh: true });
            if (!auth.ok) {
              errors.fez_logistics = auth.error;
              break;
            }
            authHeaders = auth.headers;
            response = await fetchJson(`${config.baseUrl}/order/cost`, {
              method: "POST",
              headers: authHeaders,
              body: JSON.stringify({
                state: destinationState,
                pickUpState: pickupState,
                weight: shipmentWeight(shipment)
              })
            });
          }
          if (response.ok || !fezInvalidStateError(response)) break;
          logWarn("FEZ Logistics rejected rate state; retrying with alternate state alias.", { provider: "fez_logistics", environment: config.environment, trackingId: shipment.tracking_id, destinationState, pickupState, status: response.status, error: response.error });
        }
        if (response?.ok || (response && !fezInvalidStateError(response))) break;
      }
      if (response?.ok) {
        // FEZ's delivery-time endpoint can remain open for several minutes in
        // production. Rate lookup is part of the shipment creation request, so
        // use the Fly Logistics ETA already calculated for the shipment instead
        // of allowing an optional carrier ETA call to block order creation.
        rates.push(...normalizeFezRates(response.data, shipment, shipment.eta ?? null));
      } else {
        logWarn("FEZ Logistics rate retrieval failed.", { provider: "fez_logistics", environment: config.environment, status: response?.status, error: response?.error });
        errors.fez_logistics = response?.error ?? "FEZ Logistics rate retrieval failed.";
      }
    }

    if (provider === "easyship_inactive") {
      errors.easyship_inactive = "Easyship is inactive for Nigeria fulfilment. Use Fly Logistics, Sendbox, or FEZ Logistics.";
    }

    if (isFutureCarrierProvider(provider)) {
      errors[provider] = `${carrierProviderLabels[provider]} integration is planned for global fulfilment and is not active yet.`;
    }
  }

  return { rates, errors };
}

export async function createCarrierShipment(
  shipment: ShipmentRecord,
  providerInput: unknown,
  rateId?: string | null
): Promise<CarrierResponse<CarrierCreateResult>> {
  const provider = normalizeCarrierProvider(providerInput);
  if (provider === "easyship_inactive") {
    return { ok: false, error: "Easyship is inactive for Nigeria fulfilment. Choose Fly Logistics, Sendbox, or FEZ Logistics." };
  }
  if (isFutureCarrierProvider(provider)) {
    return { ok: false, error: `${carrierProviderLabels[provider]} integration is planned for global fulfilment and is not active yet.` };
  }
  if (provider === "internal_fly_logistics") {
    return {
      ok: true,
      data: {
        provider: "internal_fly_logistics",
        carrierShipmentId: shipment.tracking_id,
        carrierTrackingId: shipment.tracking_id,
        carrierRateAmount: Number(shipment.payment_amount ?? shipment.quoted_price ?? 0) || null,
        carrierStatus: shipment.status,
        rawResponse: { source: carrierProviderLabels.internal_fly_logistics }
      }
    };
  }

  if (provider === "sendbox") {
    const validationError = validateCarrierShipment(shipment, provider);
    if (validationError) return { ok: false, status: 422, error: validationError };
    const config = getSendboxConfig("create_shipment");
    if (!config.configured || !config.baseUrl) {
      return { ok: false, error: `Sendbox is not configured for ${config.environment}. Missing: ${config.missing.join(", ")}.` };
    }
    logInfo("Creating Sendbox shipment.", { provider: "sendbox", environment: config.environment, trackingId: shipment.tracking_id });
    const response = await fetchFirstJson(sendboxEndpointCandidates(config.baseUrl, "/shipping/shipments", [
      "/shipping/shipment",
      "/shipping/orders",
      "/shipping/order",
      "/shipments",
      "/shipment",
      "/orders",
      "/order"
    ]), {
      method: "POST",
      headers: sendboxAuthHeaders(config),
      body: JSON.stringify(sendboxPayload(shipment, rateId))
    });
    if (!response.ok) logWarn("Sendbox shipment creation failed.", { provider: "sendbox", environment: config.environment, trackingId: shipment.tracking_id, status: response.status, error: response.error });
    return response.ok ? { ok: true, data: sendboxCreateResult(response.data) } : response;
  }

  if (provider === "fez_logistics") {
    const validationError = validateCarrierShipment(shipment, provider);
    if (validationError) return { ok: false, status: 422, error: validationError };
    const config = getFezConfig("create_order");
    if (!config.configured || !config.baseUrl) {
      return { ok: false, error: `FEZ Logistics is not configured for ${config.environment}. Missing: ${config.missing.join(", ")}.` };
    }
    let auth = await resolveFezAuthHeaders(config);
    if (!auth.ok) return { ok: false, error: auth.error, status: auth.status };
    logInfo("Creating FEZ Logistics order.", { provider: "fez_logistics", environment: config.environment, trackingId: shipment.tracking_id });
    let response: CarrierResponse<unknown> | null = null;
    for (const destinationState of fezStateAlternates(shipment.destination_state, shipment.delivery_address)) {
      for (const pickupState of fezStateAlternates(shipment.pickup_state, shipment.pickup_address)) {
        response = await fetchJson(`${config.baseUrl}/order`, {
          method: "POST",
          headers: auth.headers,
          body: JSON.stringify(fezPayloadWithStates(shipment, { pickupState, destinationState }))
        });
        if (!response.ok && response.status === 401) {
          resetFezAuthCache();
          auth = await resolveFezAuthHeaders(config, { forceRefresh: true });
          if (!auth.ok) return { ok: false, error: auth.error, status: auth.status };
          logWarn("FEZ session was invalid; retrying order creation with refreshed auth.", { provider: "fez_logistics", environment: config.environment, trackingId: shipment.tracking_id });
          response = await fetchJson(`${config.baseUrl}/order`, {
            method: "POST",
            headers: auth.headers,
            body: JSON.stringify(fezPayloadWithStates(shipment, { pickupState, destinationState }))
          });
        }
        if (response.ok || fezResponseLooksCreated(response.rawResponse) || !fezInvalidStateError(response)) break;
        logWarn("FEZ rejected order recipient state; retrying with alternate state alias.", { provider: "fez_logistics", environment: config.environment, trackingId: shipment.tracking_id, destinationState, pickupState, status: response.status, error: response.error });
      }
      if (response?.ok || (response && fezResponseLooksCreated(response.rawResponse)) || (response && !fezInvalidStateError(response))) break;
    }

    if (!response) return { ok: false, error: "FEZ Logistics order creation did not return a response." };
    if (response.ok) {
      const created = fezCreateResult(response.data, shipment);
      if (!created.carrierOrderId && !created.carrierTrackingId) {
        const reconciled = await findFezOrderByFlyTracking(config, auth.headers, shipment.tracking_id);
        if (reconciled?.ok) {
          return {
            ok: true,
            data: {
              provider: "fez_logistics",
              carrierShipmentId: reconciled.data.carrierOrderId ?? reconciled.data.carrierTrackingId ?? null,
              carrierOrderId: reconciled.data.carrierOrderId ?? reconciled.data.carrierTrackingId ?? null,
              carrierTrackingId: reconciled.data.carrierTrackingId ?? reconciled.data.carrierOrderId ?? null,
              carrierRateAmount: reconciled.data.carrierRateAmount ?? created.carrierRateAmount ?? null,
              carrierStatus: reconciled.data.carrierStatus ?? created.carrierStatus ?? "created",
              rawResponse: {
                createResponse: response.data,
                reconciliation: reconciled.data.rawResponse ?? null
              }
            }
          };
        }
      }
      return { ok: true, data: created };
    }
    if (fezResponseLooksCreated(response.rawResponse)) {
      logWarn("FEZ returned a non-2xx response that still appears to have created the order; saving as created for reconciliation.", { provider: "fez_logistics", environment: config.environment, trackingId: shipment.tracking_id, status: response.status });
      return { ok: true, data: fezCreateResult(response.rawResponse, shipment) };
    }

    if (!response.ok) {
      const reconciled = await findFezOrderByFlyTracking(config, auth.headers, shipment.tracking_id);
      if (reconciled?.ok) {
        logWarn("FEZ order was reconciled by Fly tracking ID after an ambiguous create response.", { provider: "fez_logistics", environment: config.environment, trackingId: shipment.tracking_id, status: response.status });
        return {
          ok: true,
          data: {
            provider: "fez_logistics",
            carrierShipmentId: reconciled.data.carrierOrderId ?? reconciled.data.carrierTrackingId ?? null,
            carrierOrderId: reconciled.data.carrierOrderId ?? reconciled.data.carrierTrackingId ?? null,
            carrierTrackingId: reconciled.data.carrierTrackingId ?? reconciled.data.carrierOrderId ?? null,
            carrierRateAmount: reconciled.data.carrierRateAmount ?? null,
            carrierStatus: reconciled.data.carrierStatus ?? "created",
            rawResponse: {
              createResponse: response.rawResponse ?? { error: response.error, status: response.status },
              reconciliation: reconciled.data.rawResponse ?? null
            }
          }
        };
      }
    }

    if (response.status === 404 || response.status === 405) {
      logWarn("FEZ /order endpoint rejected request; retrying /order/multiple.", { provider: "fez_logistics", environment: config.environment, trackingId: shipment.tracking_id, status: response.status, error: response.error });
      let fallbackResponse: CarrierResponse<unknown> | null = null;
      for (const destinationState of fezStateAlternates(shipment.destination_state, shipment.delivery_address)) {
        for (const pickupState of fezStateAlternates(shipment.pickup_state, shipment.pickup_address)) {
          fallbackResponse = await fetchJson(`${config.baseUrl}/order/multiple`, {
            method: "POST",
            headers: auth.headers,
            body: JSON.stringify(fezPayloadWithStates(shipment, { pickupState, destinationState }))
          });
          if (!fallbackResponse.ok && fallbackResponse.status === 401) {
            resetFezAuthCache();
            auth = await resolveFezAuthHeaders(config, { forceRefresh: true });
            if (!auth.ok) return { ok: false, error: auth.error, status: auth.status };
            fallbackResponse = await fetchJson(`${config.baseUrl}/order/multiple`, {
              method: "POST",
              headers: auth.headers,
              body: JSON.stringify(fezPayloadWithStates(shipment, { pickupState, destinationState }))
            });
          }
          if (fallbackResponse.ok || fezResponseLooksCreated(fallbackResponse.rawResponse) || !fezInvalidStateError(fallbackResponse)) break;
          logWarn("FEZ fallback rejected order recipient state; retrying with alternate state alias.", { provider: "fez_logistics", environment: config.environment, trackingId: shipment.tracking_id, destinationState, pickupState, status: fallbackResponse.status, error: fallbackResponse.error });
        }
        if (fallbackResponse?.ok || (fallbackResponse && fezResponseLooksCreated(fallbackResponse.rawResponse)) || (fallbackResponse && !fezInvalidStateError(fallbackResponse))) break;
      }
      if (fallbackResponse?.ok) {
        const created = fezCreateResult(fallbackResponse.data, shipment);
        if (!created.carrierOrderId && !created.carrierTrackingId) {
          const reconciled = await findFezOrderByFlyTracking(config, auth.headers, shipment.tracking_id);
          if (reconciled?.ok) {
            return {
              ok: true,
              data: {
                provider: "fez_logistics",
                carrierShipmentId: reconciled.data.carrierOrderId ?? reconciled.data.carrierTrackingId ?? null,
                carrierOrderId: reconciled.data.carrierOrderId ?? reconciled.data.carrierTrackingId ?? null,
                carrierTrackingId: reconciled.data.carrierTrackingId ?? reconciled.data.carrierOrderId ?? null,
                carrierRateAmount: reconciled.data.carrierRateAmount ?? created.carrierRateAmount ?? null,
                carrierStatus: reconciled.data.carrierStatus ?? created.carrierStatus ?? "created",
                rawResponse: {
                  createResponse: fallbackResponse.data,
                  reconciliation: reconciled.data.rawResponse ?? null
                }
              }
            };
          }
        }
        return { ok: true, data: created };
      }
      if (fallbackResponse && fezResponseLooksCreated(fallbackResponse.rawResponse)) {
        logWarn("FEZ fallback returned a non-2xx response that appears to have created the order; saving as created for reconciliation.", { provider: "fez_logistics", environment: config.environment, trackingId: shipment.tracking_id, status: fallbackResponse.status });
        return { ok: true, data: fezCreateResult(fallbackResponse.rawResponse, shipment) };
      }
      const reconciled = await findFezOrderByFlyTracking(config, auth.headers, shipment.tracking_id);
      if (reconciled?.ok) {
        logWarn("FEZ fallback order was reconciled by Fly tracking ID after an ambiguous response.", { provider: "fez_logistics", environment: config.environment, trackingId: shipment.tracking_id, status: fallbackResponse?.status });
        return {
          ok: true,
          data: {
            provider: "fez_logistics",
            carrierShipmentId: reconciled.data.carrierOrderId ?? reconciled.data.carrierTrackingId ?? null,
            carrierOrderId: reconciled.data.carrierOrderId ?? reconciled.data.carrierTrackingId ?? null,
            carrierTrackingId: reconciled.data.carrierTrackingId ?? reconciled.data.carrierOrderId ?? null,
            carrierRateAmount: reconciled.data.carrierRateAmount ?? null,
            carrierStatus: reconciled.data.carrierStatus ?? "created",
            rawResponse: {
              createResponse: fallbackResponse?.rawResponse ?? { error: fallbackResponse?.error, status: fallbackResponse?.status },
              reconciliation: reconciled.data.rawResponse ?? null
            }
          }
        };
      }
      logWarn("FEZ Logistics fallback order creation failed.", { provider: "fez_logistics", environment: config.environment, trackingId: shipment.tracking_id, status: fallbackResponse?.status, error: fallbackResponse?.error });
      return fallbackResponse ?? { ok: false, error: "FEZ Logistics fallback order creation failed." };
    }

    logWarn("FEZ Logistics order creation failed.", { provider: "fez_logistics", environment: config.environment, trackingId: shipment.tracking_id, status: response.status, error: response.error });
    return response;
  }

  return { ok: false, error: "Unsupported carrier provider." };
}

export async function syncCarrierShipment(shipment: ShipmentRecord): Promise<CarrierResponse<CarrierTrackResult>> {
  const provider = normalizeCarrierProvider(shipment.carrier_provider);
  if (provider === "easyship_inactive") {
    return { ok: false, error: "Easyship is inactive for Nigeria fulfilment. Choose Fly Logistics, Sendbox, or FEZ Logistics." };
  }
  if (isFutureCarrierProvider(provider)) {
    return { ok: false, error: `${carrierProviderLabels[provider]} integration is planned for global fulfilment and is not active yet.` };
  }
  if (provider === "internal_fly_logistics") {
    return {
      ok: true,
      data: {
        provider,
        carrierStatus: shipment.status,
        carrierTrackingId: shipment.tracking_id,
        rawResponse: { source: carrierProviderLabels.internal_fly_logistics }
      }
    };
  }

  const trackingCode = provider === "fez_logistics"
    ? ([
        shipment.carrier_order_no,
        shipment.carrier_order_id,
        shipment.carrier_tracking_id,
        shipment.carrier_waybill_no,
        shipment.carrier_shipment_id
      ].find((value) => {
        const text = String(value ?? "").trim();
        return text && !text.toUpperCase().startsWith("FLY-");
      }) ?? shipment.tracking_id)
    : shipment.carrier_tracking_id ?? shipment.carrier_shipment_id ?? shipment.carrier_order_id;
  if (!trackingCode) {
    return { ok: false, error: "This shipment does not have a carrier tracking ID yet." };
  }

  if (provider === "sendbox") {
    const config = getSendboxConfig("sync_tracking");
    if (!config.configured || !config.baseUrl) {
      return { ok: false, error: `Sendbox is not configured for ${config.environment}. Missing: ${config.missing.join(", ")}.` };
    }
    logInfo("Syncing Sendbox shipment tracking.", { provider: "sendbox", environment: config.environment, trackingId: shipment.tracking_id });
    const response = await fetchFirstJson(sendboxEndpointCandidates(config.baseUrl, "/shipping/tracking", [
      "/shipping/track",
      "/tracking",
      "/track"
    ]), {
      method: "POST",
      headers: sendboxAuthHeaders(config),
      body: JSON.stringify({ code: trackingCode })
    });
    if (!response.ok) logWarn("Sendbox tracking sync failed.", { provider: "sendbox", environment: config.environment, trackingId: shipment.tracking_id, status: response.status, error: response.error });
    return response.ok ? { ok: true, data: sendboxTrackResult(response.data) } : response;
  }

  if (provider === "fez_logistics") {
    const config = getFezConfig("sync_tracking");
    if (!config.configured || !config.baseUrl) {
      return { ok: false, error: `FEZ Logistics is not configured for ${config.environment}. Missing: ${config.missing.join(", ")}.` };
    }
    let auth = await resolveFezAuthHeaders(config);
    if (!auth.ok) return { ok: false, error: auth.error, status: auth.status };
    let fezTrackingCode = String(trackingCode);
    if (fezTrackingCode.toUpperCase().startsWith("FLY-")) {
      let searchResponse = await findFezOrderByFlyTracking(config, auth.headers, fezTrackingCode);
      if (searchResponse && !searchResponse.ok && searchResponse.status === 401) {
        resetFezAuthCache();
        auth = await resolveFezAuthHeaders(config, { forceRefresh: true });
        if (!auth.ok) return { ok: false, error: auth.error, status: auth.status };
        searchResponse = await findFezOrderByFlyTracking(config, auth.headers, fezTrackingCode);
      }
      const foundOrderNumber = searchResponse?.ok
        ? searchResponse.data.carrierOrderId ?? searchResponse.data.carrierTrackingId ?? null
        : null;
      if (foundOrderNumber && !foundOrderNumber.toUpperCase().startsWith("FLY-")) {
        fezTrackingCode = foundOrderNumber;
      } else if (searchResponse && !searchResponse.ok) {
        logWarn("FEZ Logistics order search by Fly tracking ID failed.", { provider: "fez_logistics", environment: config.environment, trackingId: shipment.tracking_id, status: searchResponse.status, error: searchResponse.error });
      }
    }

    logInfo("Syncing FEZ Logistics order tracking.", { provider: "fez_logistics", environment: config.environment, trackingId: shipment.tracking_id });
    let response = await fetchJson(`${config.baseUrl}/order/track/${encodeURIComponent(fezTrackingCode)}`, {
      method: "GET",
      headers: auth.headers
    });
    if (!response.ok && response.status === 401) {
      resetFezAuthCache();
      auth = await resolveFezAuthHeaders(config, { forceRefresh: true });
      if (!auth.ok) return { ok: false, error: auth.error, status: auth.status };
      logWarn("FEZ session was invalid; retrying tracking sync with refreshed auth.", { provider: "fez_logistics", environment: config.environment, trackingId: shipment.tracking_id });
      response = await fetchJson(`${config.baseUrl}/order/track/${encodeURIComponent(fezTrackingCode)}`, {
        method: "GET",
        headers: auth.headers
      });
    }
    if (!response.ok && !fezTrackingCode.toUpperCase().startsWith("FLY-")) {
      const searchResponse = await findFezOrderByFlyTracking(config, auth.headers, shipment.tracking_id);
      if (searchResponse?.ok) {
        logWarn("FEZ direct tracking lookup failed, but order was reconciled by Fly tracking ID.", {
          provider: "fez_logistics",
          environment: config.environment,
          trackingId: shipment.tracking_id,
          carrierReference: fezTrackingCode,
          status: response.status,
          error: response.error
        });
        return searchResponse;
      }
    }
    if (!response.ok) logWarn("FEZ Logistics tracking sync failed.", { provider: "fez_logistics", environment: config.environment, trackingId: shipment.tracking_id, status: response.status, error: response.error });
    return response.ok ? { ok: true, data: fezTrackResult(response.data) } : response;
  }

  return { ok: false, error: "Unsupported carrier provider." };
}
