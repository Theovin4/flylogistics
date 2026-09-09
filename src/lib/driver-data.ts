export const driverBaseSelect = "id,name,status,phone,latitude,longitude";

export const driverExtendedSelect =
  "id,name,status,phone,photo_url,latitude,longitude,current_latitude,current_longitude,is_online,last_location_at,approval_status,account_user_id,online_since,offline_since,last_seen_at,rating,kyc_status,vehicle_type,vehicle_plate_number,vehicle_model,created_at,updated_at";

export const driverTransportationOptions = [
  { value: "bike", label: "Dispatch bike" },
  { value: "car", label: "Car" },
  { value: "bus", label: "Bus" },
  { value: "van", label: "Van" },
  { value: "truck", label: "Truck" },
  { value: "lorry", label: "Lorry" },
  { value: "tricycle", label: "Tricycle" }
] as const;

export type DriverTransportationType = (typeof driverTransportationOptions)[number]["value"];

export function normalizeTransportationType(value: unknown): DriverTransportationType {
  const normalized = String(value ?? "").trim().toLowerCase().replaceAll("_", " ");
  if (!normalized) return "bike";
  if (normalized.includes("motor") || normalized.includes("bike") || normalized.includes("rider")) return "bike";
  if (normalized.includes("tricycle") || normalized.includes("keke")) return "tricycle";
  if (normalized.includes("bus")) return "bus";
  if (normalized.includes("lorry")) return "lorry";
  if (normalized.includes("truck")) return "truck";
  if (normalized.includes("van")) return "van";
  if (normalized.includes("car") || normalized.includes("sedan")) return "car";
  return driverTransportationOptions.some((option) => option.value === normalized)
    ? normalized as DriverTransportationType
    : "bike";
}

export function transportationTypeLabel(value: unknown) {
  const normalized = normalizeTransportationType(value);
  return driverTransportationOptions.find((option) => option.value === normalized)?.label ?? "Dispatch bike";
}

export function transportationMarkerKind(value: unknown) {
  const normalized = normalizeTransportationType(value);
  if (normalized === "truck" || normalized === "lorry") return "truck";
  if (normalized === "car" || normalized === "van" || normalized === "bus" || normalized === "tricycle") return "van";
  return "bike";
}

export const optionalDriverColumns = new Set([
  "photo_url",
  "current_latitude",
  "current_longitude",
  "is_online",
  "last_location_at",
  "approval_status",
  "account_user_id",
  "online_since",
  "offline_since",
  "last_seen_at",
  "rating",
  "kyc_status",
  "vehicle_type",
  "vehicle_plate_number",
  "vehicle_model",
  "created_at",
  "updated_at",
  "company_id"
]);

type DriverErrorLike = {
  code?: string;
  message?: string;
} | null;

export type NormalizedDriverRecord = Record<string, unknown> & {
  id?: string | number | null;
  name: string;
  status: string;
  phone: string | null;
  photo_url: string | null;
  latitude: number | null;
  longitude: number | null;
  current_latitude: number | null;
  current_longitude: number | null;
  is_online: boolean;
  last_location_at: string | null;
  approval_status: string;
  account_user_id: string | null;
  online_since: string | null;
  offline_since: string | null;
  last_seen_at: string | null;
  rating: number;
  kyc_status: string;
  vehicle_type: string | null;
  vehicle_plate_number: string | null;
  vehicle_model: string | null;
  created_at: string | null;
  updated_at: string | null;
};

function stringOrNull(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function stringOrDefault(value: unknown, fallback: string) {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function numberOrNull(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function booleanOrDefault(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function statusLooksOnline(status: string) {
  const normalized = status.toLowerCase();
  return !["offline", "inactive", "suspended", "rejected"].some((item) => normalized.includes(item));
}

export function missingDriverColumn(error: DriverErrorLike) {
  if (!error?.message) return null;

  const postgrestMatch = error.message.match(/'([^']+)' column/i);
  if (postgrestMatch?.[1]) return postgrestMatch[1];

  const postgresMatch = error.message.match(/column\s+(?:\w+\.)?"?([a-zA-Z_][\w]*)"?\s+does not exist/i);
  if (postgresMatch?.[1]) return postgresMatch[1];

  return null;
}

export function isDriverSchemaMismatch(error: DriverErrorLike) {
  return Boolean(missingDriverColumn(error));
}

export function normalizeDriverRecord(record: Record<string, unknown>): NormalizedDriverRecord {
  const status = stringOrDefault(record.status, "offline");
  const currentLatitude = numberOrNull(record.current_latitude);
  const currentLongitude = numberOrNull(record.current_longitude);
  const fallbackLatitude = numberOrNull(record.latitude);
  const fallbackLongitude = numberOrNull(record.longitude);
  const isOnline = statusLooksOnline(status) || booleanOrDefault(record.is_online, false);

  return {
    ...record,
    name: stringOrDefault(record.name, "Unnamed driver"),
    status,
    phone: stringOrNull(record.phone),
    photo_url: stringOrNull(record.photo_url),
    latitude: currentLatitude ?? fallbackLatitude,
    longitude: currentLongitude ?? fallbackLongitude,
    current_latitude: currentLatitude,
    current_longitude: currentLongitude,
    is_online: isOnline,
    last_location_at: stringOrNull(record.last_location_at),
    approval_status: stringOrDefault(record.approval_status, "approved"),
    account_user_id: stringOrNull(record.account_user_id),
    online_since: stringOrNull(record.online_since),
    offline_since: stringOrNull(record.offline_since),
    last_seen_at: stringOrNull(record.last_seen_at),
    rating: numberOrNull(record.rating) ?? 4.8,
    kyc_status: stringOrDefault(record.kyc_status, "not_submitted"),
    vehicle_type: normalizeTransportationType(record.vehicle_type),
    vehicle_plate_number: stringOrNull(record.vehicle_plate_number),
    vehicle_model: stringOrNull(record.vehicle_model),
    created_at: stringOrNull(record.created_at),
    updated_at: stringOrNull(record.updated_at)
  };
}
