"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { ArrowRight, BellRing, Bot, CheckCircle2, CheckSquare2, Clock3, CreditCard, DollarSign, Download, ExternalLink, FileText, Loader2, MapPin, MessageCircle, PackagePlus, RefreshCw, Send, ShieldCheck, Sparkles, Trash2, Truck, XCircle } from "lucide-react";
import { flyError, flyInfo, flySuccess } from "@/components/feedback/fly-toast";
import { getSupabaseBrowser } from "@/lib/supabase";
import {
  carrierProviderLabels,
  carrierProviders,
  carrierStatusLabel,
  isFutureCarrierProvider,
  normalizeCarrierProvider,
  type CarrierProvider,
  type CarrierRateQuote
} from "@/lib/carriers";
import {
  canConvertQuote,
  normalizeQuoteStatus,
  quoteDisplayAmount,
  quoteDisplayEta,
  quoteLifecycleTone,
  quoteStatusLabel
} from "@/lib/quotes";
import { shipmentFinanceSnapshot } from "@/lib/shipment-finance";
import {
  shipmentCustomerMessage,
  shipmentOperationsChecklist,
  shipmentStatusLabel,
  sortShipmentTimelineLatestFirst,
  type DriverSummary,
  type QuoteRequestRecord,
  type ShipmentRecord,
  type ShipmentStatus
} from "@/lib/shipments";
import { buildWhatsAppUrl, whatsappMessages } from "@/lib/contact";
import { optimizedCloudinaryImageUrl } from "@/lib/cloudinary-url";
import { freightClassificationLabel, freightClassificationOptions, freightModeLabel, freightModeOptions, supportedCurrencies } from "@/lib/international";
import { deliveryTypeOptions, nigerianStates } from "@/lib/pricing";
import type { UploadedAsset } from "@/lib/cloudinary";
import { CloudinaryUpload } from "@/components/cloudinary/cloudinary-upload";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CountryStateSelect } from "@/components/shipments/country-state-select";

const initialShipmentForm = {
  deliveryCategory: "local_nigeria",
  freightMode: "air_freight",
  quoteCurrency: "NGN",
  freightClassification: "general_cargo",
  pickupCountry: "Nigeria",
  destinationCountry: "Nigeria",
  pickupState: "LA",
  destinationState: "LA",
  customerName: "",
  customerEmail: "",
  customerPhone: "",
  recipientName: "",
  pickupPhone: "",
  deliveryPhone: "",
  pickupAddress: "",
  deliveryAddress: "",
  packageType: "",
  weightKg: "5",
  customsInformation: "",
  packageValue: "",
  dutiesTaxesAmount: "",
  exportImportDocuments: "",
  urgency: "standard",
  status: "PENDING" as ShipmentStatus,
  driverId: "",
  carrierProvider: "fez_logistics" as CarrierProvider,
  eta: "",
  paymentAmount: "0",
  driverPayoutAmount: "",
  driverPayoutStatus: "UNPAID",
  driverPayoutNotes: "",
  carrierCostAmount: "",
  backdatedAt: "",
  backdateReason: "",
  walletAdjustmentType: "credit" as "credit" | "debit" | "none",
  walletAdjustmentAmount: "",
  businessReference: "",
  codAmount: "0",
  codStatus: "NOT_APPLICABLE",
  internalNotes: ""
};

const adminShipmentStatusOptions: ShipmentStatus[] = [
  "PENDING",
  "PENDING_PICKUP",
  "CONFIRMED",
  "DRIVER_ASSIGNED",
  "PICKED_UP",
  "IN_TRANSIT",
  "ARRIVED",
  "DELIVERED",
  "CANCELLED"
];

const adminCreateCarrierProviders = carrierProviders.filter((provider) => provider !== "easyship_inactive" && !isFutureCarrierProvider(provider)) as CarrierProvider[];

const moneyFormatter = new Intl.NumberFormat("en-NG", {
  currency: "NGN",
  maximumFractionDigits: 0,
  style: "currency"
});

const paymentFilterOptions = ["all", "PAID", "UNPAID", "PENDING", "FAILED", "CANCELLED"];
const quoteFilterStatusOptions = ["all", "PENDING_REVIEW", "QUOTED", "ACCEPTED", "DECLINED", "EXPIRED", "PAID", "CONVERTED_TO_SHIPMENT"];

function searchable(value: unknown) {
  return String(value ?? "").toLowerCase();
}

function displayShipmentStatus(shipment: ShipmentRecord): ShipmentStatus {
  const provider = normalizeCarrierProvider(shipment.carrier_provider);
  const carrierStatus = String(shipment.carrier_status ?? "").toLowerCase();
  if (provider === "fez_logistics" && carrierStatus.includes("pending") && carrierStatus.includes("pick")) {
    return "PENDING_PICKUP";
  }
  return (shipment.status ?? "PENDING") as ShipmentStatus;
}

function driverDedupKey(driver: DriverSummary) {
  const phone = String(driver.phone ?? "").replace(/\D/g, "");
  const name = String(driver.name ?? "").trim().toLowerCase();
  return phone ? `phone:${phone}` : `name:${name || driver.id}`;
}

function driverSortLabel(driver: DriverSummary) {
  return String(driver.name ?? `Driver ${driver.id}`).trim().toLowerCase();
}

function driverRank(driver: DriverSummary) {
  return [
    driver.approval_status === "approved" ? 4 : 0,
    driver.account_user_id ? 2 : 0,
    driver.is_online || !String(driver.status ?? "offline").toLowerCase().includes("offline") ? 1 : 0
  ].reduce((sum, score) => sum + score, 0);
}

function dedupeAssignableDrivers(drivers: DriverSummary[]) {
  const byDriver = new Map<string, DriverSummary>();
  for (const driver of drivers) {
    if (driver.approval_status && driver.approval_status !== "approved") continue;
    const key = driverDedupKey(driver);
    const existing = byDriver.get(key);
    if (!existing || driverRank(driver) > driverRank(existing)) {
      byDriver.set(key, driver);
    }
  }
  return Array.from(byDriver.values()).sort((a, b) => driverSortLabel(a).localeCompare(driverSortLabel(b)));
}

type DispatchDriverCandidate = DriverSummary & {
  workload: number;
  completedDeliveries: number;
  failedDeliveries: number;
  acceptanceRate: number;
  successRate: number;
  performanceScore: number;
  distanceKm: number | null;
  score: number;
  signals: string[];
};

type DispatchRecommendation = {
  trackingId: string;
  recommendedDriver: DispatchDriverCandidate;
  reason: string;
  confidence: number;
  mode: "groq" | "heuristic-fallback";
  routeRecommendation?: {
    etaHours: number;
    etaLabel: string;
    distanceKm: number;
    confidence: number;
    trafficAssumption: string;
    deliveryType: string;
    routeSummary: string;
    vehicleType: string;
  };
  candidateDrivers: DispatchDriverCandidate[];
};

type QuoteDraft = {
  quotedPrice: string;
  quotedEtaHours: string;
  quotedEtaLabel: string;
  quoteValidUntil: string;
  quoteNotes: string;
  reviewNotes: string;
};

type ShipmentEditDraft = {
  deliveryCategory: string;
  freightMode: string;
  quoteCurrency: string;
  freightClassification: string;
  pickupCountry: string;
  destinationCountry: string;
  pickupState: string;
  destinationState: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  recipientName: string;
  pickupPhone: string;
  deliveryPhone: string;
  pickupAddress: string;
  deliveryAddress: string;
  packageType: string;
  weightKg: string;
  customsInformation: string;
  packageValue: string;
  dutiesTaxesAmount: string;
  exportImportDocuments: string;
  urgency: string;
  eta: string;
  paymentAmount: string;
  driverPayoutAmount: string;
  driverPayoutStatus: string;
  driverPayoutNotes: string;
  carrierCostAmount: string;
  backdatedAt: string;
  backdateReason: string;
};

type CarrierLinkDraft = {
  carrierOrderId: string;
  carrierTrackingId: string;
};

type AdminShipmentManagerMode = "shipments" | "quotes" | "all";

function isFlyCarrierReference(value?: string | null) {
  return String(value ?? "").trim().toUpperCase().startsWith("FLY-");
}

function firstCarrierReference(...values: Array<string | null | undefined>) {
  return values.find((value) => {
    const text = String(value ?? "").trim();
    return text && !isFlyCarrierReference(text);
  }) ?? "";
}

function carrierOrderReference(shipment: ShipmentRecord) {
  return firstCarrierReference(
    shipment.carrier_order_no,
    shipment.carrier_order_id,
    shipment.carrier_shipment_id,
    shipment.carrier_waybill_no,
    shipment.carrier_tracking_id
  );
}

function carrierTrackingReference(shipment: ShipmentRecord) {
  return firstCarrierReference(
    shipment.carrier_tracking_id,
    shipment.carrier_waybill_no,
    shipment.carrier_order_no,
    shipment.carrier_order_id,
    shipment.carrier_shipment_id
  );
}

function carrierLinkDraftFromShipment(shipment: ShipmentRecord): CarrierLinkDraft {
  const order = carrierOrderReference(shipment);
  return {
    carrierOrderId: order,
    carrierTrackingId: carrierTrackingReference(shipment) || order
  };
}

function dateInputValue(value?: string | null) {
  if (!value) return "";
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return "";
  return new Date(timestamp).toISOString().slice(0, 10);
}

function dateTimeLocalValue(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60_000);
  return local.toISOString().slice(0, 16);
}

function quoteDraftFromRecord(quote: QuoteRequestRecord): QuoteDraft {
  return {
    quotedPrice: String(quote.quoted_price ?? quote.payment_amount ?? quote.estimated_price ?? ""),
    quotedEtaHours: String(quote.quoted_eta_hours ?? quote.estimated_eta_hours ?? ""),
    quotedEtaLabel: quote.quoted_eta_label ?? quoteDisplayEta(quote),
    quoteValidUntil: dateInputValue(quote.quote_valid_until),
    quoteNotes: quote.quote_notes ?? quote.review_notes ?? "",
    reviewNotes: quote.review_notes ?? ""
  };
}

function shipmentEditDraftFromRecord(shipment: ShipmentRecord): ShipmentEditDraft {
  return {
    deliveryCategory: shipment.delivery_category ?? "local_nigeria",
    freightMode: shipment.freight_mode ?? "air_freight",
    quoteCurrency: shipment.quote_currency ?? "NGN",
    freightClassification: shipment.freight_classification ?? "general_cargo",
    pickupCountry: shipment.pickup_country ?? "Nigeria",
    destinationCountry: shipment.destination_country ?? "Nigeria",
    pickupState: shipment.pickup_state ?? "LA",
    destinationState: shipment.destination_state ?? "LA",
    customerName: shipment.customer_name ?? "",
    customerEmail: shipment.customer_email ?? "",
    customerPhone: shipment.customer_phone ?? "",
    recipientName: shipment.recipient_name ?? "",
    pickupPhone: shipment.pickup_phone ?? "",
    deliveryPhone: shipment.delivery_phone ?? "",
    pickupAddress: shipment.pickup_address ?? "",
    deliveryAddress: shipment.delivery_address ?? "",
    packageType: shipment.package_type ?? "",
    weightKg: shipment.weight_kg !== undefined && shipment.weight_kg !== null ? String(shipment.weight_kg) : "",
    customsInformation: shipment.customs_information ?? "",
    packageValue: shipment.package_value !== undefined && shipment.package_value !== null ? String(shipment.package_value) : "",
    dutiesTaxesAmount: shipment.duties_taxes_amount !== undefined && shipment.duties_taxes_amount !== null ? String(shipment.duties_taxes_amount) : "",
    exportImportDocuments: shipment.export_import_documents ?? "",
    urgency: shipment.urgency ?? "standard",
    eta: shipment.eta ?? "",
    paymentAmount: shipment.payment_amount !== undefined && shipment.payment_amount !== null ? String(shipment.payment_amount) : "",
    driverPayoutAmount: shipment.driver_payout_amount !== undefined && shipment.driver_payout_amount !== null ? String(shipment.driver_payout_amount) : "",
    driverPayoutStatus: shipment.driver_payout_status ?? "UNPAID",
    driverPayoutNotes: shipment.driver_payout_notes ?? "",
    carrierCostAmount: shipment.carrier_cost_amount !== undefined && shipment.carrier_cost_amount !== null ? String(shipment.carrier_cost_amount) : "",
    backdatedAt: dateTimeLocalValue(shipment.backdated_at ?? null),
    backdateReason: shipment.backdate_reason ?? ""
  };
}

function customerWhatsAppUrl(phone: string | null | undefined, message: string) {
  return buildWhatsAppUrl({ phone, message });
}

function paymentBadgeClass(status: string | null | undefined) {
  const normalized = (status ?? "UNPAID").toUpperCase();
  if (normalized === "PAID") return "border-emerald-500/40 bg-emerald-500/10 text-emerald-500";
  if (normalized === "PENDING") return "border-primary/40 bg-primary/10 text-primary";
  if (normalized === "FAILED" || normalized === "CANCELLED") return "border-destructive/40 bg-destructive/10 text-destructive";
  return "border-muted-foreground/30 bg-background/55 text-muted-foreground";
}

function PaymentStatusBadge({ status }: { status?: string | null }) {
  const label = (status ?? "UNPAID").replaceAll("_", " ");
  return <Badge className={paymentBadgeClass(status)}>{label}</Badge>;
}

async function readApiJson<T>(response: Response, fallback: string): Promise<T & { error?: string }> {
  const text = await response.text();
  if (!text.trim()) {
    return { error: `${fallback} The server returned an empty response. Please try again.` } as T & { error?: string };
  }

  try {
    return JSON.parse(text) as T & { error?: string };
  } catch {
    return { error: `${fallback} The server returned an unreadable response. Please refresh and try again.` } as T & { error?: string };
  }
}

export function AdminShipmentManager({ mode = "shipments" }: { mode?: AdminShipmentManagerMode }) {
  const showShipmentTools = mode === "shipments" || mode === "all";
  const showQuoteTools = mode === "quotes" || mode === "all";
  const [shipments, setShipments] = useState<ShipmentRecord[]>([]);
  const [drivers, setDrivers] = useState<DriverSummary[]>([]);
  const [quoteRequests, setQuoteRequests] = useState<QuoteRequestRecord[]>([]);
  const [form, setForm] = useState(initialShipmentForm);
  const [loading, setLoading] = useState(true);
  const [quotesLoading, setQuotesLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [updatingTrackingId, setUpdatingTrackingId] = useState<string | null>(null);
  const [convertingRequestId, setConvertingRequestId] = useState<string | null>(null);
  const [eventDrafts, setEventDrafts] = useState<Record<string, { label: string; location: string }>>({});
  const [quoteDriverIds, setQuoteDriverIds] = useState<Record<string, string>>({});
  const [quoteReviewNotes, setQuoteReviewNotes] = useState<Record<string, string>>({});
  const [quoteDrafts, setQuoteDrafts] = useState<Record<string, QuoteDraft>>({});
  const [reviewingRequestId, setReviewingRequestId] = useState<string | null>(null);
  const [internalNotesDrafts, setInternalNotesDrafts] = useState<Record<string, string>>({});
  const [proofDrafts, setProofDrafts] = useState<Record<string, { deliveryOtp: string; recipientName: string; recipientSignatureUrl: string; proofLat: string; proofLng: string }>>({});
  const [savingNotesTrackingId, setSavingNotesTrackingId] = useState<string | null>(null);
  const [notificationSendingId, setNotificationSendingId] = useState<string | null>(null);
  const [dispatchRecommendations, setDispatchRecommendations] = useState<Record<string, DispatchRecommendation>>({});
  const [suggestingTrackingId, setSuggestingTrackingId] = useState<string | null>(null);
  const [carrierSelections, setCarrierSelections] = useState<Record<string, CarrierProvider>>({});
  const [carrierRates, setCarrierRates] = useState<Record<string, CarrierRateQuote[]>>({});
  const [carrierLinkDrafts, setCarrierLinkDrafts] = useState<Record<string, CarrierLinkDraft>>({});
  const [savingCarrierLinkId, setSavingCarrierLinkId] = useState<string | null>(null);
  const [carrierBusyKey, setCarrierBusyKey] = useState<string | null>(null);
  const [expandedShipments, setExpandedShipments] = useState<Record<string, boolean>>({});
  const [expandedQuotes, setExpandedQuotes] = useState<Record<string, boolean>>({});
  const [shipmentEditDrafts, setShipmentEditDrafts] = useState<Record<string, ShipmentEditDraft>>({});
  const [savingShipmentDetailsId, setSavingShipmentDetailsId] = useState<string | null>(null);
  const [deletingTrackingId, setDeletingTrackingId] = useState<string | null>(null);
  const [deletingRequestId, setDeletingRequestId] = useState<string | null>(null);
  const [shipmentFilters, setShipmentFilters] = useState({
    query: "",
    status: "all",
    paymentStatus: "all",
    carrierProvider: "all",
    deliveryCategory: "all"
  });
  const [quoteFilters, setQuoteFilters] = useState({
    query: "",
    status: "all",
    paymentStatus: "all",
    deliveryCategory: "all"
  });
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const authHeaders = useCallback(async () => {
    const supabase = getSupabaseBrowser();
    const { data } = supabase ? await supabase.auth.getSession() : { data: { session: null } };
    return data.session?.access_token ? { Authorization: `Bearer ${data.session.access_token}` } : {};
  }, []);

  const authorizedFetch = useCallback(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const headers = new Headers(init.headers);
    const auth = await authHeaders();
    Object.entries(auth).forEach(([key, value]) => headers.set(key, value));
    return fetch(input, { ...init, headers });
  }, [authHeaders]);

  const showSuccess = useCallback((title: string, nextMessage: string) => {
    setMessage(nextMessage);
    flySuccess(title, nextMessage);
  }, []);

  const showError = useCallback((title: string, err: unknown, fallback: string) => {
    const nextError = err instanceof Error ? err.message : fallback;
    setError(nextError);
    flyError(title, nextError);
  }, []);

  const loadShipments = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await authorizedFetch("/api/shipments");
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to load shipments.");
      const records = data as ShipmentRecord[];
      setShipments(records);
      setCarrierSelections(
        Object.fromEntries(records.map((shipment) => [shipment.tracking_id, normalizeCarrierProvider(shipment.carrier_provider)]))
      );
      setInternalNotesDrafts(
        Object.fromEntries(records.map((shipment) => [shipment.tracking_id, shipment.internal_notes ?? ""]))
      );
      setShipmentEditDrafts(
        Object.fromEntries(records.map((shipment) => [shipment.tracking_id, shipmentEditDraftFromRecord(shipment)]))
      );
      setCarrierLinkDrafts(
        Object.fromEntries(records.map((shipment) => [
          shipment.tracking_id,
          carrierLinkDraftFromShipment(shipment)
        ]))
      );
      setProofDrafts((current) => ({
        ...Object.fromEntries(records.map((shipment) => [
          shipment.tracking_id,
          {
            deliveryOtp: shipment.delivery_otp ?? "",
            recipientName: shipment.recipient_name ?? "",
            recipientSignatureUrl: shipment.recipient_signature_url ?? "",
            proofLat: shipment.proof_lat !== undefined && shipment.proof_lat !== null ? String(shipment.proof_lat) : "",
            proofLng: shipment.proof_lng !== undefined && shipment.proof_lng !== null ? String(shipment.proof_lng) : ""
          }
        ])),
        ...current
      }));
    } catch (err) {
      showError("Unable to load shipments", err, "Unable to load shipments.");
    } finally {
      setLoading(false);
    }
  }, [authorizedFetch, showError]);

  const loadDrivers = useCallback(async () => {
    try {
      const response = await authorizedFetch("/api/drivers");
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to load drivers.");
      setDrivers(data);
    } catch (err) {
      showError("Unable to load drivers", err, "Unable to load drivers.");
      setDrivers([]);
    }
  }, [authorizedFetch, showError]);

  const loadQuoteRequests = useCallback(async () => {
    setQuotesLoading(true);
    try {
      const response = await authorizedFetch("/api/quote-requests");
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to load quote requests.");
      setQuoteRequests(data);
      setQuoteDrafts((current) => {
        const next = { ...current };
        for (const quote of data as QuoteRequestRecord[]) {
          if (!next[quote.request_id]) next[quote.request_id] = quoteDraftFromRecord(quote);
        }
        return next;
      });
    } catch (err) {
      showError("Unable to load quote requests", err, "Unable to load quote requests.");
    } finally {
      setQuotesLoading(false);
    }
  }, [authorizedFetch, showError]);

  useEffect(() => {
    if (showShipmentTools) void loadShipments();
    void loadDrivers();
    if (showQuoteTools) void loadQuoteRequests();
  }, [loadDrivers, loadQuoteRequests, loadShipments, showQuoteTools, showShipmentTools]);

  function updateField(field: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function updateDeliveryCategory(value: string) {
    setForm((current) => ({
      ...current,
      deliveryCategory: value,
      pickupCountry: value === "international_import" ? "" : "Nigeria",
      destinationCountry: value === "international_export" ? "" : "Nigeria",
      pickupState: value === "international_import" ? "" : current.pickupState || "LA",
      destinationState: value === "international_export" ? "" : current.destinationState || "LA"
    }));
  }

  function toggleShipment(trackingId: string) {
    setExpandedShipments((current) => ({ ...current, [trackingId]: !current[trackingId] }));
  }

  function toggleQuote(requestId: string) {
    setExpandedQuotes((current) => ({ ...current, [requestId]: !current[requestId] }));
  }

  function updateShipmentFilter(field: keyof typeof shipmentFilters, value: string) {
    setShipmentFilters((current) => ({ ...current, [field]: value }));
  }

  function updateQuoteFilter(field: keyof typeof quoteFilters, value: string) {
    setQuoteFilters((current) => ({ ...current, [field]: value }));
  }

  async function deleteShipment(trackingId: string) {
    const confirmed = window.confirm(`Delete shipment ${trackingId}? This removes the shipment from operations, customer portals, and public tracking. Audit logs will keep the admin action.`);
    if (!confirmed) return;

    setError(null);
    setMessage(null);
    setDeletingTrackingId(trackingId);
    try {
      const response = await authorizedFetch(`/api/shipments/${encodeURIComponent(trackingId)}`, { method: "DELETE" });
      const data = await readApiJson<{ ok?: boolean; trackingId?: string }>(response, "Unable to delete shipment.");
      if (!response.ok) throw new Error(data.error ?? "Unable to delete shipment.");
      setShipments((current) => current.filter((shipment) => shipment.tracking_id !== trackingId));
      setExpandedShipments((current) => {
        const next = { ...current };
        delete next[trackingId];
        return next;
      });
      showSuccess("Shipment deleted", `Shipment ${trackingId} deleted.`);
    } catch (err) {
      showError("Unable to delete shipment", err, "Unable to delete shipment.");
    } finally {
      setDeletingTrackingId(null);
    }
  }

  async function deleteQuoteRequest(requestId: string) {
    const confirmed = window.confirm(`Delete quote request ${requestId}? Converted shipments will remain in shipment operations.`);
    if (!confirmed) return;

    setError(null);
    setMessage(null);
    setDeletingRequestId(requestId);
    try {
      const response = await authorizedFetch(`/api/quote-requests/${encodeURIComponent(requestId)}`, { method: "DELETE" });
      const data = await readApiJson<{ ok?: boolean; requestId?: string }>(response, "Unable to delete quote request.");
      if (!response.ok) throw new Error(data.error ?? "Unable to delete quote request.");
      setQuoteRequests((current) => current.filter((quote) => quote.request_id !== requestId));
      setExpandedQuotes((current) => {
        const next = { ...current };
        delete next[requestId];
        return next;
      });
      showSuccess("Quote request deleted", `Quote request ${requestId} deleted.`);
    } catch (err) {
      showError("Unable to delete quote request", err, "Unable to delete quote request.");
    } finally {
      setDeletingRequestId(null);
    }
  }

  async function createShipment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const response = await authorizedFetch("/api/shipments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          weightKg: Number(form.weightKg),
          packageValue: form.packageValue ? Number(form.packageValue) : undefined,
          dutiesTaxesAmount: form.dutiesTaxesAmount ? Number(form.dutiesTaxesAmount) : undefined,
          paymentAmount: Number(form.paymentAmount || 0),
          driverPayoutAmount: form.driverPayoutAmount ? Number(form.driverPayoutAmount) : undefined,
          driverPayoutStatus: form.driverPayoutStatus,
          driverPayoutNotes: form.driverPayoutNotes || undefined,
          carrierCostAmount: form.carrierCostAmount ? Number(form.carrierCostAmount) : undefined,
          backdatedAt: form.backdatedAt || undefined,
          backdateReason: form.backdateReason || undefined,
          walletAdjustmentAmount: form.walletAdjustmentAmount ? Number(form.walletAdjustmentAmount) : undefined,
          codAmount: Number(form.codAmount || 0)
        })
      });
      const data = await readApiJson<ShipmentRecord & {
        error?: string;
        admin_wallet_fee_adjustment?: { ok?: boolean; reason?: string };
        carrier_automation?: {
          ok?: boolean;
          providerLabel?: string;
          error?: string;
          adminWalletDebit?: { ok?: boolean; reason?: string };
        };
      }>(response, "Unable to create shipment.");
      if (!response.ok) throw new Error(data.error ?? "Unable to create shipment.");
      setShipments((current) => [data, ...current]);
      setCarrierSelections((current) => ({ ...current, [data.tracking_id]: normalizeCarrierProvider(data.carrier_provider) }));
      setInternalNotesDrafts((current) => ({ ...current, [data.tracking_id]: data.internal_notes ?? "" }));
      setShipmentEditDrafts((current) => ({ ...current, [data.tracking_id]: shipmentEditDraftFromRecord(data) }));
      setForm(initialShipmentForm);
      if (data.carrier_automation?.ok) {
        const debitText = data.carrier_automation.adminWalletDebit?.ok
          ? "Admin wallet debit recorded."
          : "Admin wallet debit needs review.";
        const feeText = data.admin_wallet_fee_adjustment?.ok ? "Shipping fee posted to admin wallet." : "Shipping fee wallet post needs review.";
        showSuccess("Shipment created", `Shipment ${data.tracking_id} created and sent to ${data.carrier_automation.providerLabel ?? "the selected carrier"}. ${feeText} ${debitText}`);
      } else if (data.carrier_automation && !data.carrier_automation.ok) {
        const feeText = data.admin_wallet_fee_adjustment?.ok ? "Shipping fee posted to admin wallet." : "";
        const notice = `Shipment ${data.tracking_id} created. ${feeText} ${data.carrier_automation.providerLabel ?? "Selected carrier"} automation needs review: ${data.carrier_automation.error ?? "carrier request failed"}.`;
        setMessage(notice);
        flyInfo("Carrier automation notice", notice);
      } else {
        const feeText = data.admin_wallet_fee_adjustment?.ok ? " Shipping fee posted to admin wallet." : "";
        showSuccess("Shipment created", `Shipment ${data.tracking_id} created.${feeText}`);
      }
      void suggestDriver(data.tracking_id, { quiet: true });
    } catch (err) {
      showError("Unable to create shipment", err, "Unable to create shipment.");
    } finally {
      setSaving(false);
    }
  }

  async function suggestDriver(trackingId: string, options?: { quiet?: boolean }) {
    setSuggestingTrackingId(trackingId);
    if (!options?.quiet) {
      setError(null);
      setMessage(null);
    }

    try {
      const response = await authorizedFetch("/api/admin/dispatch/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trackingId })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to generate AI dispatch recommendation.");

      const recommendation = data as DispatchRecommendation;
      setDispatchRecommendations((current) => ({ ...current, [trackingId]: recommendation }));
      showSuccess("AI dispatch suggestion ready", `AI dispatch recommends ${recommendation.recommendedDriver.name} for ${trackingId}.`);
    } catch (err) {
      if (!options?.quiet) showError("Unable to suggest driver", err, "Unable to generate AI dispatch recommendation.");
    } finally {
      setSuggestingTrackingId(null);
    }
  }

  async function approveDispatchRecommendation(trackingId: string) {
    const recommendation = dispatchRecommendations[trackingId];
    if (!recommendation) return;
    await updateShipment(trackingId, { driverId: String(recommendation.recommendedDriver.id) });
    setDispatchRecommendations((current) => {
      const next = { ...current };
      delete next[trackingId];
      return next;
    });
  }

  async function updateShipment(
    trackingId: string,
    updates: {
      status?: ShipmentStatus;
      driverId?: string;
      timelineLabel?: string;
      timelineLocation?: string;
      timelineCompleted?: boolean;
      internalNotes?: string;
      carrierOrderId?: string;
      carrierTrackingId?: string;
      carrierProvider?: CarrierProvider;
    }
  ) {
    setError(null);
    setUpdatingTrackingId(trackingId);
    try {
      const response = await authorizedFetch(`/api/shipments/${encodeURIComponent(trackingId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates)
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to update shipment.");
      setShipments((current) => current.map((shipment) => (shipment.tracking_id === trackingId ? data : shipment)));
      setShipmentEditDrafts((current) => ({ ...current, [trackingId]: shipmentEditDraftFromRecord(data) }));
      if ("carrierOrderId" in updates || "carrierTrackingId" in updates) {
        setCarrierLinkDrafts((current) => ({
          ...current,
          [trackingId]: carrierLinkDraftFromShipment(data)
        }));
      }
      if ("internalNotes" in updates) {
        setInternalNotesDrafts((current) => ({ ...current, [trackingId]: data.internal_notes ?? "" }));
      }
      showSuccess("Shipment updated", `Shipment ${trackingId} updated.`);
    } catch (err) {
      showError("Unable to update shipment", err, "Unable to update shipment.");
    } finally {
      setUpdatingTrackingId(null);
    }
  }

  function updateShipmentEditDraft(trackingId: string, field: keyof ShipmentEditDraft, value: string) {
    setShipmentEditDrafts((current) => ({
      ...current,
      [trackingId]: {
        ...(current[trackingId] ?? {
          deliveryCategory: "local_nigeria",
          freightMode: "air_freight",
          quoteCurrency: "NGN",
          freightClassification: "general_cargo",
          pickupCountry: "Nigeria",
          destinationCountry: "Nigeria",
          pickupState: "LA",
          destinationState: "LA",
          customerName: "",
          customerEmail: "",
          customerPhone: "",
          recipientName: "",
          pickupPhone: "",
          deliveryPhone: "",
          pickupAddress: "",
          deliveryAddress: "",
          packageType: "",
          weightKg: "",
          customsInformation: "",
          packageValue: "",
          dutiesTaxesAmount: "",
          exportImportDocuments: "",
          urgency: "standard",
          eta: "",
          paymentAmount: "",
          driverPayoutAmount: "",
          driverPayoutStatus: "UNPAID",
          driverPayoutNotes: "",
          carrierCostAmount: "",
          backdatedAt: "",
          backdateReason: ""
        }),
        [field]: value
      }
    }));
  }

  async function saveShipmentDetails(trackingId: string) {
    const draft = shipmentEditDrafts[trackingId];
    if (!draft) return;
    const currentShipment = shipments.find((shipment) => shipment.tracking_id === trackingId);
    const delivered = currentShipment?.status === "DELIVERED";
    const financeBody = {
      driverPayoutAmount: draft.driverPayoutAmount ? Number(draft.driverPayoutAmount) : undefined,
      driverPayoutStatus: draft.driverPayoutStatus || undefined,
      driverPayoutNotes: draft.driverPayoutNotes || undefined,
      carrierCostAmount: draft.carrierCostAmount ? Number(draft.carrierCostAmount) : undefined,
      backdatedAt: draft.backdatedAt || undefined,
      backdateReason: draft.backdateReason || undefined
    };
    const detailBody = {
      deliveryCategory: draft.deliveryCategory,
      ...(draft.deliveryCategory.includes("international")
        ? {
            freightMode: draft.freightMode,
            quoteCurrency: draft.quoteCurrency,
            freightClassification: draft.freightClassification
          }
        : {}),
      pickupCountry: draft.pickupCountry,
      destinationCountry: draft.destinationCountry,
      pickupState: draft.pickupState,
      destinationState: draft.destinationState,
      customerName: draft.customerName,
      customerEmail: draft.customerEmail,
      customerPhone: draft.customerPhone,
      recipientName: draft.recipientName,
      pickupPhone: draft.pickupPhone,
      deliveryPhone: draft.deliveryPhone,
      pickupAddress: draft.pickupAddress,
      deliveryAddress: draft.deliveryAddress,
      packageType: draft.packageType,
      weightKg: draft.weightKg ? Number(draft.weightKg) : undefined,
      customsInformation: draft.customsInformation,
      packageValue: draft.packageValue ? Number(draft.packageValue) : undefined,
      dutiesTaxesAmount: draft.dutiesTaxesAmount ? Number(draft.dutiesTaxesAmount) : undefined,
      exportImportDocuments: draft.exportImportDocuments,
      urgency: draft.urgency,
      eta: draft.eta,
      paymentAmount: draft.paymentAmount ? Number(draft.paymentAmount) : undefined
    };

    setSavingShipmentDetailsId(trackingId);
    setError(null);
    try {
      const response = await authorizedFetch(`/api/shipments/${encodeURIComponent(trackingId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          delivered
            ? {
                ...financeBody,
                ...(!currentShipment?.recipient_name && draft.recipientName.trim()
                  ? { recipientName: draft.recipientName.trim() }
                  : {})
              }
            : { ...detailBody, ...financeBody }
        )
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to save shipment details.");
      setShipments((current) => current.map((shipment) => (shipment.tracking_id === trackingId ? data : shipment)));
      setShipmentEditDrafts((current) => ({ ...current, [trackingId]: shipmentEditDraftFromRecord(data) }));
      setInternalNotesDrafts((current) => ({ ...current, [trackingId]: data.internal_notes ?? "" }));
      showSuccess(
        "Shipment details saved",
        delivered
          ? `Shipment ${trackingId} recipient and finance corrections saved.`
          : `Shipment ${trackingId} details saved.`
      );
    } catch (err) {
      showError("Unable to save shipment details", err, "Unable to save shipment details.");
    } finally {
      setSavingShipmentDetailsId(null);
    }
  }

  async function saveProof(trackingId: string, asset: UploadedAsset) {
    const proofDraft = proofDrafts[trackingId] ?? { deliveryOtp: "", recipientName: "", recipientSignatureUrl: "", proofLat: "", proofLng: "" };
    const proofLat = proofDraft.proofLat ? Number(proofDraft.proofLat) : undefined;
    const proofLng = proofDraft.proofLng ? Number(proofDraft.proofLng) : undefined;
    const response = await authorizedFetch(`/api/shipments/${encodeURIComponent(trackingId)}/proof`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        proofImageUrl: asset.secureUrl,
        deliveryOtp: proofDraft.deliveryOtp || undefined,
        recipientName: proofDraft.recipientName || undefined,
        recipientSignatureUrl: proofDraft.recipientSignatureUrl || undefined,
        proofLat: Number.isFinite(proofLat) ? proofLat : undefined,
        proofLng: Number.isFinite(proofLng) ? proofLng : undefined
      })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "Unable to save proof image.");
    setShipments((current) => current.map((shipment) => (shipment.tracking_id === trackingId ? data : shipment)));
    setShipmentEditDrafts((current) => ({ ...current, [trackingId]: shipmentEditDraftFromRecord(data) }));
    showSuccess("Proof uploaded", `Proof of delivery saved and ${trackingId} marked delivered.`);
  }

  function updateProofDraft(trackingId: string, field: "deliveryOtp" | "recipientName" | "recipientSignatureUrl" | "proofLat" | "proofLng", value: string) {
    setProofDrafts((current) => ({
      ...current,
      [trackingId]: {
        ...(current[trackingId] ?? { deliveryOtp: "", recipientName: "", recipientSignatureUrl: "", proofLat: "", proofLng: "" }),
        [field]: value
      }
    }));
  }

  function updateEventDraft(trackingId: string, field: "label" | "location", value: string) {
    setEventDrafts((current) => ({
      ...current,
      [trackingId]: { ...(current[trackingId] ?? { label: "", location: "" }), [field]: value }
    }));
  }

  async function addTimelineEvent(trackingId: string) {
    const draft = eventDrafts[trackingId];
    if (!draft?.label.trim()) return;
    await updateShipment(trackingId, {
      timelineLabel: draft.label,
      timelineLocation: draft.location,
      timelineCompleted: true
    });
    setEventDrafts((current) => ({ ...current, [trackingId]: { label: "", location: "" } }));
  }

  function updateQuoteDriver(requestId: string, driverId: string) {
    setQuoteDriverIds((current) => ({ ...current, [requestId]: driverId }));
  }

  function updateQuoteReviewNotes(requestId: string, notes: string) {
    setQuoteReviewNotes((current) => ({ ...current, [requestId]: notes }));
    setQuoteDrafts((current) => ({
      ...current,
      [requestId]: { ...(current[requestId] ?? { quotedPrice: "", quotedEtaHours: "", quotedEtaLabel: "", quoteValidUntil: "", quoteNotes: "", reviewNotes: "" }), reviewNotes: notes }
    }));
  }

  function updateQuoteDraft(requestId: string, field: keyof QuoteDraft, value: string) {
    setQuoteDrafts((current) => ({
      ...current,
      [requestId]: { ...(current[requestId] ?? { quotedPrice: "", quotedEtaHours: "", quotedEtaLabel: "", quoteValidUntil: "", quoteNotes: "", reviewNotes: "" }), [field]: value }
    }));
    if (field === "reviewNotes") setQuoteReviewNotes((current) => ({ ...current, [requestId]: value }));
  }

  async function reviewQuoteRequest(requestId: string, action: "send_quote" | "decline" | "expire" | "mark_paid" | "update_quote") {
    setError(null);
    setMessage(null);
    setReviewingRequestId(requestId);

    try {
      const draft = quoteDrafts[requestId];
      const response = await authorizedFetch(`/api/quote-requests/${encodeURIComponent(requestId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          quotedPrice: draft?.quotedPrice ? Number(draft.quotedPrice) : undefined,
          quotedEtaHours: draft?.quotedEtaHours ? Number(draft.quotedEtaHours) : undefined,
          quotedEtaLabel: draft?.quotedEtaLabel || undefined,
          quoteValidUntil: draft?.quoteValidUntil || undefined,
          quoteNotes: draft?.quoteNotes ?? undefined,
          reviewNotes: draft?.reviewNotes ?? quoteReviewNotes[requestId] ?? ""
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to review quote request.");
      setQuoteRequests((current) => current.map((quote) => (quote.request_id === requestId ? data : quote)));
      setQuoteReviewNotes((current) => ({ ...current, [requestId]: data.review_notes ?? "" }));
      setQuoteDrafts((current) => ({ ...current, [requestId]: quoteDraftFromRecord(data) }));
      showSuccess(action === "send_quote" ? "Quote sent" : "Quote updated", action === "send_quote" ? `Quote ${requestId} sent to customer.` : `Quote ${requestId} updated.`);
    } catch (err) {
      showError("Unable to review quote", err, "Unable to review quote request.");
    } finally {
      setReviewingRequestId(null);
    }
  }

  async function convertQuoteRequest(requestId: string, adminOverride = false) {
    setError(null);
    setMessage(null);
    setConvertingRequestId(requestId);

    try {
      const response = await authorizedFetch(`/api/quote-requests/${encodeURIComponent(requestId)}/convert`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ driverId: quoteDriverIds[requestId] ?? "", internalNotes: quoteDrafts[requestId]?.reviewNotes ?? quoteReviewNotes[requestId] ?? "", adminOverride })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to convert quote request.");

      const convertedShipment = data.shipment as ShipmentRecord;
      setShipments((current) => [
        convertedShipment,
        ...current.filter((shipment) => shipment.tracking_id !== convertedShipment.tracking_id)
      ]);
      setCarrierSelections((current) => ({
        ...current,
        [convertedShipment.tracking_id]: normalizeCarrierProvider(convertedShipment.carrier_provider)
      }));
      setInternalNotesDrafts((current) => ({ ...current, [convertedShipment.tracking_id]: convertedShipment.internal_notes ?? "" }));
      setShipmentEditDrafts((current) => ({ ...current, [convertedShipment.tracking_id]: shipmentEditDraftFromRecord(convertedShipment) }));
      setQuoteRequests((current) =>
        current.map((quote) => (quote.request_id === requestId ? { ...quote, ...data.quote, status: data.quote?.status ?? "CONVERTED_TO_SHIPMENT" } : quote))
      );
      setQuoteDriverIds((current) => {
        const next = { ...current };
        delete next[requestId];
        return next;
      });
      showSuccess("Quote converted", `Quote ${requestId} converted to shipment ${convertedShipment.tracking_id}.`);
    } catch (err) {
      showError("Unable to convert quote", err, "Unable to convert quote request.");
    } finally {
      setConvertingRequestId(null);
    }
  }

  function updateInternalNotesDraft(trackingId: string, value: string) {
    setInternalNotesDrafts((current) => ({ ...current, [trackingId]: value }));
  }

  async function saveInternalNotes(trackingId: string) {
    setSavingNotesTrackingId(trackingId);
    await updateShipment(trackingId, { internalNotes: internalNotesDrafts[trackingId] ?? "" });
    setSavingNotesTrackingId(null);
  }

  function updateCarrierSelection(trackingId: string, provider: CarrierProvider) {
    setCarrierSelections((current) => ({ ...current, [trackingId]: provider }));
  }

  function updateCarrierLinkDraft(trackingId: string, field: keyof CarrierLinkDraft, value: string) {
    setCarrierLinkDrafts((current) => ({
      ...current,
      [trackingId]: {
        ...(current[trackingId] ?? { carrierOrderId: "", carrierTrackingId: "" }),
        [field]: value
      }
    }));
  }

  async function saveCarrierReference(trackingId: string) {
    const draft = carrierLinkDrafts[trackingId] ?? { carrierOrderId: "", carrierTrackingId: "" };
    if (!draft.carrierOrderId.trim() && !draft.carrierTrackingId.trim()) {
      flyError("Carrier reference needed", "Enter an internal carrier reference before saving this manual override.");
      return;
    }
    setSavingCarrierLinkId(trackingId);
    const provider = carrierSelections[trackingId] ?? "internal_fly_logistics";
    await updateShipment(trackingId, {
      carrierOrderId: draft.carrierOrderId.trim(),
      carrierTrackingId: draft.carrierTrackingId.trim() || draft.carrierOrderId.trim(),
      carrierProvider: provider
    });
    setSavingCarrierLinkId(null);
  }

  async function compareCarrierRates(trackingId: string) {
    setError(null);
    setMessage(null);
    setCarrierBusyKey(`${trackingId}:rates`);
    try {
      const selectedProvider = carrierSelections[trackingId] ?? "internal_fly_logistics";
      const response = await authorizedFetch(`/api/shipments/${encodeURIComponent(trackingId)}/carriers/rates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(selectedProvider === "internal_fly_logistics" ? {} : { providers: ["internal_fly_logistics", selectedProvider] })
      });
      const data = await readApiJson<{ rates?: CarrierRateQuote[]; errors?: Record<string, string>; shipment?: ShipmentRecord }>(
        response,
        "Unable to compare carrier rates."
      );
      if (!response.ok) throw new Error("error" in data ? String(data.error) : "Unable to compare carrier rates.");
      setCarrierRates((current) => ({ ...current, [trackingId]: data.rates ?? [] }));
      if (data.shipment) {
        setShipments((current) => current.map((shipment) => (shipment.tracking_id === trackingId ? data.shipment as ShipmentRecord : shipment)));
        setCarrierSelections((current) => ({ ...current, [trackingId]: normalizeCarrierProvider(data.shipment?.carrier_provider) }));
        setCarrierLinkDrafts((current) => ({
          ...current,
          [trackingId]: data.shipment ? carrierLinkDraftFromShipment(data.shipment) : { carrierOrderId: "", carrierTrackingId: "" }
        }));
      }
      const errorText = Object.values(data.errors ?? {}).filter(Boolean).join(" ");
      if (errorText) {
        setMessage(errorText);
        flyInfo("Carrier rate notice", errorText);
      } else {
        showSuccess("Carrier rates refreshed", `Carrier rates refreshed for ${trackingId}.`);
      }
    } catch (err) {
      showError("Unable to compare rates", err, "Unable to compare carrier rates.");
    } finally {
      setCarrierBusyKey(null);
    }
  }

  async function createCarrierFulfilment(trackingId: string, providerOverride?: CarrierProvider) {
    setError(null);
    setMessage(null);
    const provider = providerOverride ?? carrierSelections[trackingId] ?? "internal_fly_logistics";
    setCarrierBusyKey(`${trackingId}:create:${provider}`);
    try {
      setCarrierSelections((current) => ({ ...current, [trackingId]: provider }));
      const response = await authorizedFetch(`/api/shipments/${encodeURIComponent(trackingId)}/carriers/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider })
      });
      const data = await readApiJson<{ shipment?: ShipmentRecord }>(
        response,
        "Unable to create carrier shipment."
      );
      if (!response.ok) {
        if (data.shipment) {
          const fallbackShipment = data.shipment as ShipmentRecord;
          setShipments((current) => current.map((shipment) => (shipment.tracking_id === trackingId ? fallbackShipment : shipment)));
          setCarrierSelections((current) => ({ ...current, [trackingId]: normalizeCarrierProvider(fallbackShipment.carrier_provider) }));
          setCarrierLinkDrafts((current) => ({
            ...current,
            [trackingId]: carrierLinkDraftFromShipment(fallbackShipment)
          }));
        }
        throw new Error(data.error ?? "Unable to create carrier shipment.");
      }
      const updatedShipment = data.shipment as ShipmentRecord;
      setShipments((current) => current.map((shipment) => (shipment.tracking_id === trackingId ? updatedShipment : shipment)));
      setCarrierSelections((current) => ({ ...current, [trackingId]: normalizeCarrierProvider(updatedShipment.carrier_provider) }));
      setCarrierLinkDrafts((current) => ({
        ...current,
        [trackingId]: carrierLinkDraftFromShipment(updatedShipment)
      }));
      showSuccess("Fulfilment provider saved", `${carrierProviderLabels[provider]} fulfilment saved for ${trackingId}.`);
    } catch (err) {
      showError("Unable to create carrier shipment", err, "Unable to create carrier shipment.");
    } finally {
      setCarrierBusyKey(null);
    }
  }

  async function syncCarrierTracking(trackingId: string) {
    setError(null);
    setMessage(null);
    setCarrierBusyKey(`${trackingId}:sync`);
    try {
      const response = await authorizedFetch(`/api/shipments/${encodeURIComponent(trackingId)}/carriers/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: carrierSelections[trackingId] })
      });
      const data = await readApiJson<{ shipment?: ShipmentRecord }>(
        response,
        "Unable to refresh carrier status."
      );
      if (!response.ok) throw new Error(data.error ?? "Unable to refresh carrier status.");
      const updatedShipment = data.shipment as ShipmentRecord;
      setShipments((current) => current.map((shipment) => (shipment.tracking_id === trackingId ? updatedShipment : shipment)));
      setCarrierSelections((current) => ({ ...current, [trackingId]: normalizeCarrierProvider(updatedShipment.carrier_provider) }));
      setCarrierLinkDrafts((current) => ({
        ...current,
        [trackingId]: carrierLinkDraftFromShipment(updatedShipment)
      }));
      showSuccess("Carrier status refreshed", `Carrier status refreshed for ${trackingId}.`);
    } catch (err) {
      showError("Unable to refresh carrier status", err, "Unable to refresh carrier status.");
    } finally {
      setCarrierBusyKey(null);
    }
  }

  async function sendProviderNotification(input: {
    key: string;
    channel?: "whatsapp" | "sms";
    to?: string | null;
    message: string;
    workflow: string;
    entityType: string;
    entityId: string;
  }) {
    if (!input.to) {
      setError("Add a customer phone number before sending this notification.");
      flyError("Customer phone needed", "Add a customer phone number before sending this notification.");
      return;
    }

    setError(null);
    setMessage(null);
    setNotificationSendingId(input.key);

    try {
      const channel = input.channel ?? "whatsapp";
      const response = await authorizedFetch(channel === "sms" ? "/api/notifications/sms" : "/api/notifications/whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: input.to,
          message: channel === "sms" ? input.message.slice(0, 459) : input.message,
          workflow: input.workflow,
          entityType: input.entityType,
          entityId: input.entityId,
          metadata: { source: "admin_dashboard" }
        })
      });
      const data = await response.json();
      const label = channel === "sms" ? "SMS" : "WhatsApp";
      if (!response.ok) throw new Error(data.error ?? `Unable to send ${label} notification.`);
      if (!data.ok) throw new Error(data.reason ?? `${label} provider is not configured.`);
      showSuccess("Notification sent", `${label} ${input.workflow.replaceAll("_", " ")} notification processed via ${data.provider}.`);
    } catch (err) {
      showError("Unable to send notification", err, "Unable to send customer notification.");
    } finally {
      setNotificationSendingId(null);
    }
  }

  const filteredShipments = useMemo(() => {
    const query = shipmentFilters.query.trim().toLowerCase();
    return shipments.filter((shipment) => {
      const matchesQuery = !query || [
        shipment.tracking_id,
        shipment.customer_name,
        shipment.customer_email,
        shipment.recipient_name,
        shipment.pickup_address,
        shipment.delivery_address,
        shipment.package_type,
        shipment.payment_reference
      ].some((value) => searchable(value).includes(query));
      const matchesStatus = shipmentFilters.status === "all" || String(shipment.status ?? "").toUpperCase() === shipmentFilters.status;
      const matchesPayment = shipmentFilters.paymentStatus === "all" || String(shipment.payment_status ?? "UNPAID").toUpperCase() === shipmentFilters.paymentStatus;
      const matchesCarrier = shipmentFilters.carrierProvider === "all" || normalizeCarrierProvider(shipment.carrier_provider) === shipmentFilters.carrierProvider;
      const matchesDelivery = shipmentFilters.deliveryCategory === "all" || String(shipment.delivery_category ?? "") === shipmentFilters.deliveryCategory;
      return matchesQuery && matchesStatus && matchesPayment && matchesCarrier && matchesDelivery;
    });
  }, [shipmentFilters, shipments]);

  const assignableDrivers = useMemo(() => dedupeAssignableDrivers(drivers), [drivers]);

  const filteredQuoteRequests = useMemo(() => {
    const query = quoteFilters.query.trim().toLowerCase();
    return quoteRequests.filter((quote) => {
      const matchesQuery = !query || [
        quote.request_id,
        quote.customer_name,
        quote.customer_email,
        quote.recipient_name,
        quote.pickup_address,
        quote.delivery_address,
        quote.package_type,
        quote.payment_reference
      ].some((value) => searchable(value).includes(query));
      const matchesStatus = quoteFilters.status === "all" || normalizeQuoteStatus(quote.status) === quoteFilters.status;
      const matchesPayment = quoteFilters.paymentStatus === "all" || String(quote.payment_status ?? "UNPAID").toUpperCase() === quoteFilters.paymentStatus;
      const matchesDelivery = quoteFilters.deliveryCategory === "all" || String(quote.delivery_category ?? "") === quoteFilters.deliveryCategory;
      return matchesQuery && matchesStatus && matchesPayment && matchesDelivery;
    });
  }, [quoteFilters, quoteRequests]);

  const carrierFinanceSummary = useMemo(() => {
    const summary = new Map<string, { revenue: number; cost: number; payout: number; profit: number; count: number }>();
    for (const shipment of filteredShipments) {
      const provider = normalizeCarrierProvider(shipment.carrier_provider);
      const current = summary.get(provider) ?? { revenue: 0, cost: 0, payout: 0, profit: 0, count: 0 };
      const finance = shipmentFinanceSnapshot(shipment);
      current.revenue += finance.revenue;
      current.cost += finance.carrierCost;
      current.payout += finance.driverPayout;
      current.profit += finance.profit;
      current.count += 1;
      summary.set(provider, current);
    }
    return Array.from(summary.entries()).map(([provider, values]) => ({ provider: provider as CarrierProvider, ...values }));
  }, [filteredShipments]);

  const quoteAnalytics = filteredQuoteRequests.reduce<Record<string, number>>((current, quote) => {
    const status = normalizeQuoteStatus(quote.status);
    current[status] = (current[status] ?? 0) + 1;
    return current;
  }, {});
  const selectedAdminDeliveryType = deliveryTypeOptions.find((option) => option.value === form.deliveryCategory) ?? deliveryTypeOptions[0];

  return (
    <section className="mt-8 grid gap-6">
      {message && <div className="flex gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-500"><CheckCircle2 className="size-4" />{message}</div>}
      {error && <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}

      {showShipmentTools && (
      <Card className="glass">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <PackagePlus className="size-5 text-primary" />
            Create shipment
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Create registered-customer or guest shipments, assign drivers, update carrier fulfilment, and keep Fly Logistics tracking active.
          </p>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4" onSubmit={createShipment}>
            <div className="rounded-md border border-primary/25 bg-primary/5 p-4">
              <div className="mb-4">
                <h3 className="text-sm font-semibold">1. Select delivery type</h3>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Choose this first so pricing, carrier fulfilment, ETA, and route handling match the shipment type.
                </p>
              </div>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                <div className="grid gap-2 md:col-span-2">
                  <Label htmlFor="adminDeliveryCategory">Delivery type</Label>
                  <select
                    id="adminDeliveryCategory"
                    value={form.deliveryCategory}
                    onChange={(event) => updateDeliveryCategory(event.target.value)}
                    className="h-11 rounded-md border bg-background/70 px-3 text-sm"
                  >
                    {deliveryTypeOptions.map((type) => (
                      <option key={type.value} value={type.value}>{type.label}</option>
                    ))}
                  </select>
                  <p className="text-xs leading-5 text-muted-foreground">{selectedAdminDeliveryType.detail}</p>
                </div>
                <CountryStateSelect
                  idPrefix="admin-pickup"
                  country={form.pickupCountry}
                  state={form.pickupState}
                  onCountryChange={(value) => updateField("pickupCountry", value)}
                  onStateChange={(value) => updateField("pickupState", value)}
                  countryLabel="Origin country"
                  stateLabel="Origin state or province"
                  lockCountry={form.deliveryCategory === "international_import" ? undefined : "Nigeria"}
                />
                <CountryStateSelect
                  idPrefix="admin-destination"
                  country={form.destinationCountry}
                  state={form.destinationState}
                  onCountryChange={(value) => updateField("destinationCountry", value)}
                  onStateChange={(value) => updateField("destinationState", value)}
                  countryLabel="Destination country"
                  stateLabel="Destination state or province"
                  lockCountry={form.deliveryCategory === "international_export" ? undefined : "Nigeria"}
                />
              </div>
            </div>

            <div className="rounded-md border bg-background/35 p-4">
              <div className="mb-4">
                <h3 className="text-sm font-semibold">2. Sender details</h3>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  The sender is the person or business booking the shipment. A registered customer account is not required.
                </p>
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                <div className="grid gap-2">
                  <Label htmlFor="adminCustomerName">Sender name</Label>
                  <Input
                    id="adminCustomerName"
                    value={form.customerName}
                    onChange={(e) => updateField("customerName", e.target.value)}
                    placeholder="Person or business sending"
                    required
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="adminCustomerEmail">Sender email optional</Label>
                  <Input
                    id="adminCustomerEmail"
                    type="email"
                    value={form.customerEmail}
                    onChange={(e) => updateField("customerEmail", e.target.value)}
                    placeholder="sender@example.com"
                  />
                  <p className="text-xs text-muted-foreground">Use the customer account email when available.</p>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="adminCustomerPhone">Sender phone</Label>
                  <Input
                    id="adminCustomerPhone"
                    inputMode="tel"
                    value={form.customerPhone}
                    onChange={(e) => updateField("customerPhone", e.target.value)}
                    placeholder="Main sender contact"
                    required
                  />
                </div>
                <div className="grid gap-2 md:col-span-2">
                  <Label htmlFor="adminPickup">Pickup address</Label>
                  <Input
                    id="adminPickup"
                    value={form.pickupAddress}
                    onChange={(e) => updateField("pickupAddress", e.target.value)}
                    placeholder="Street, landmark, city/state"
                    required
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="adminPickupPhone">Pickup contact phone</Label>
                  <Input
                    id="adminPickupPhone"
                    inputMode="tel"
                    value={form.pickupPhone}
                    onChange={(e) => updateField("pickupPhone", e.target.value)}
                    placeholder="Who the carrier calls at pickup"
                  />
                </div>
              </div>
            </div>

            <div className="rounded-md border bg-background/35 p-4">
              <div className="mb-4">
                <h3 className="text-sm font-semibold">3. Receiver details</h3>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Receiver information is used for fulfilment and delivery confirmation. Public tracking keeps sender private.
                </p>
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                <div className="grid gap-2">
                  <Label htmlFor="adminRecipientName">Recipient name</Label>
                  <Input
                    id="adminRecipientName"
                    value={form.recipientName}
                    onChange={(e) => updateField("recipientName", e.target.value)}
                    placeholder="Person receiving package"
                    required
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="adminDeliveryPhone">Recipient phone</Label>
                  <Input
                    id="adminDeliveryPhone"
                    inputMode="tel"
                    value={form.deliveryPhone}
                    onChange={(e) => updateField("deliveryPhone", e.target.value)}
                    placeholder="Receiver delivery contact"
                    required
                  />
                </div>
                <div className="grid gap-2 md:col-span-3">
                  <Label htmlFor="adminDelivery">Delivery address</Label>
                  <Input
                    id="adminDelivery"
                    value={form.deliveryAddress}
                    onChange={(e) => updateField("deliveryAddress", e.target.value)}
                    placeholder="Street, landmark, city/state"
                    required
                  />
                </div>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-5">
              <div className="grid gap-2 md:col-span-2">
                <Label htmlFor="adminPackage">Package type</Label>
                <Input id="adminPackage" value={form.packageType} onChange={(e) => updateField("packageType", e.target.value)} required />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="adminWeight">Weight kg</Label>
                <Input id="adminWeight" type="number" value={form.weightKg} onChange={(e) => updateField("weightKg", e.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="adminUrgency">Urgency</Label>
                <select id="adminUrgency" value={form.urgency} onChange={(e) => updateField("urgency", e.target.value)} className="h-11 rounded-md border bg-background/70 px-3 text-sm">
                  <option value="standard">Standard</option>
                  <option value="priority">Priority</option>
                  <option value="critical">Critical</option>
                </select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="adminStatus">Initial status</Label>
                <select id="adminStatus" value={form.status} onChange={(e) => updateField("status", e.target.value as ShipmentStatus)} className="h-11 rounded-md border bg-background/70 px-3 text-sm">
                  {adminShipmentStatusOptions.map((status) => <option key={status} value={status}>{shipmentStatusLabel(status)}</option>)}
                </select>
              </div>
            </div>
            <div className="rounded-md border border-primary/20 bg-primary/5 p-4">
              <div className="mb-4">
                <h3 className="text-sm font-semibold">International and customs details</h3>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Required for international import/export shipments. Leave blank for simple local deliveries unless customs value or documentation is needed.
                </p>
              </div>
              <div className="grid gap-4 md:grid-cols-4">
                <div className="grid gap-2">
                  <Label htmlFor="adminFreightMode">Freight mode</Label>
                  <select
                    id="adminFreightMode"
                    value={form.freightMode}
                    onChange={(e) => updateField("freightMode", e.target.value)}
                    className="h-11 rounded-md border bg-background/70 px-3 text-sm"
                  >
                    {freightModeOptions.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="adminQuoteCurrency">Quote currency</Label>
                  <select
                    id="adminQuoteCurrency"
                    value={form.quoteCurrency}
                    onChange={(e) => updateField("quoteCurrency", e.target.value)}
                    className="h-11 rounded-md border bg-background/70 px-3 text-sm"
                  >
                    {supportedCurrencies.map((currency) => (
                      <option key={currency} value={currency}>{currency}</option>
                    ))}
                  </select>
                </div>
                <div className="grid gap-2 md:col-span-2">
                  <Label htmlFor="adminFreightClassification">Freight classification</Label>
                  <select
                    id="adminFreightClassification"
                    value={form.freightClassification}
                    onChange={(e) => updateField("freightClassification", e.target.value)}
                    className="h-11 rounded-md border bg-background/70 px-3 text-sm"
                  >
                    {freightClassificationOptions.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </div>
                <div className="grid gap-2 md:col-span-2">
                  <Label htmlFor="adminCustomsInformation">Customs information (optional)</Label>
                  <Input
                    id="adminCustomsInformation"
                    value={form.customsInformation}
                    onChange={(e) => updateField("customsInformation", e.target.value)}
                    placeholder="HS code, item description, restricted item notes"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="adminPackageValue">Package value</Label>
                  <Input
                    id="adminPackageValue"
                    inputMode="decimal"
                    value={form.packageValue}
                    onChange={(e) => updateField("packageValue", e.target.value)}
                    placeholder="Declared value"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="adminDutiesTaxesAmount">Duties and taxes</Label>
                  <Input
                    id="adminDutiesTaxesAmount"
                    inputMode="decimal"
                    value={form.dutiesTaxesAmount}
                    onChange={(e) => updateField("dutiesTaxesAmount", e.target.value)}
                    placeholder="Estimated duties/taxes"
                  />
                </div>
                <div className="grid gap-2 md:col-span-4">
                  <Label htmlFor="adminExportImportDocuments">Export/import documentation (optional)</Label>
                  <textarea
                    id="adminExportImportDocuments"
                    value={form.exportImportDocuments}
                    onChange={(e) => updateField("exportImportDocuments", e.target.value)}
                    maxLength={2000}
                    placeholder="Commercial invoice, waybill, ID, customs declaration, permits, or document links."
                    className="min-h-20 rounded-md border bg-background/70 px-3 py-2 text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-primary"
                  />
                </div>
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="grid gap-2">
                <Label htmlFor="adminDriver">Driver</Label>
                <select id="adminDriver" value={form.driverId} onChange={(e) => updateField("driverId", e.target.value)} className="h-11 rounded-md border bg-background/70 px-3 text-sm">
                  <option value="">Unassigned</option>
                  {assignableDrivers.map((driver) => (
                    <option key={String(driver.id)} value={String(driver.id)}>
                      {driver.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="adminCarrierProvider">Fulfilment carrier</Label>
                <select
                  id="adminCarrierProvider"
                  value={form.carrierProvider}
                  onChange={(e) => updateField("carrierProvider", e.target.value as CarrierProvider)}
                  className="h-11 rounded-md border bg-background/70 px-3 text-sm"
                >
                  {adminCreateCarrierProviders.map((provider) => (
                    <option key={provider} value={provider}>{carrierProviderLabels[provider]}</option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">External carrier orders are created automatically after the Fly shipment is saved.</p>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="adminEta">ETA</Label>
                <Input id="adminEta" value={form.eta} onChange={(e) => updateField("eta", e.target.value)} placeholder="24h" />
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="grid gap-2">
                <Label htmlFor="adminPaymentAmount">Price engine shipping fee</Label>
                <Input
                  id="adminPaymentAmount"
                  inputMode="decimal"
                  value=""
                  disabled
                  placeholder="Calculated automatically on save"
                />
                <p className="text-xs text-muted-foreground">Fly Logistics calculates this from pickup, destination, delivery type, weight, urgency, and package details.</p>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="adminWalletAdjustmentType">Admin wallet movement</Label>
                <select
                  id="adminWalletAdjustmentType"
                  value={form.walletAdjustmentType}
                  onChange={(e) => updateField("walletAdjustmentType", e.target.value as "credit" | "debit" | "none")}
                  className="h-11 rounded-md border bg-background/70 px-3 text-sm"
                >
                  <option value="credit">Credit admin wallet</option>
                  <option value="debit">Debit admin wallet</option>
                  <option value="none">No wallet movement</option>
                </select>
                <p className="text-xs text-muted-foreground">Use credit for shipping fees received. Use debit for internal adjustments.</p>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="adminWalletAdjustmentAmount">Wallet adjustment amount</Label>
                <Input
                  id="adminWalletAdjustmentAmount"
                  inputMode="decimal"
                  value={form.walletAdjustmentAmount}
                  onChange={(e) => updateField("walletAdjustmentAmount", e.target.value)}
                  placeholder="Leave blank to use shipping fee"
                />
                <p className="text-xs text-muted-foreground">For Fly Logistics fulfilment, adjust the exact amount credited or debited here.</p>
              </div>
            </div>
            <div className="rounded-md border border-primary/20 bg-primary/5 p-4">
              <div className="mb-4">
                <h3 className="text-sm font-semibold">4. Payout, carrier cost, and backdating</h3>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Admin-only finance controls. Drivers only see their payout amount; profit stays inside admin operations.
                </p>
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                <div className="grid gap-2">
                  <Label htmlFor="adminDriverPayoutAmount">Rider/driver payout</Label>
                  <Input id="adminDriverPayoutAmount" inputMode="decimal" value={form.driverPayoutAmount} onChange={(event) => updateField("driverPayoutAmount", event.target.value)} placeholder="Amount to pay driver" />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="adminDriverPayoutStatus">Payout status</Label>
                  <select id="adminDriverPayoutStatus" value={form.driverPayoutStatus} onChange={(event) => updateField("driverPayoutStatus", event.target.value)} className="h-11 rounded-md border bg-background/70 px-3 text-sm">
                    {["UNPAID", "PENDING", "PAID", "CANCELLED"].map((status) => <option key={status} value={status}>{status.replaceAll("_", " ")}</option>)}
                  </select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="adminCarrierCostAmount">Carrier cost override</Label>
                  <Input id="adminCarrierCostAmount" inputMode="decimal" value={form.carrierCostAmount} onChange={(event) => updateField("carrierCostAmount", event.target.value)} placeholder="FEZ/Sendbox/internal cost" />
                </div>
                <div className="grid gap-2 md:col-span-2">
                  <Label htmlFor="adminDriverPayoutNotes">Payout notes</Label>
                  <Input id="adminDriverPayoutNotes" value={form.driverPayoutNotes} onChange={(event) => updateField("driverPayoutNotes", event.target.value)} placeholder="Commission, bonus, manual adjustment, or settlement note" />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="adminBackdatedAt">Backdate shipment</Label>
                  <Input id="adminBackdatedAt" type="datetime-local" value={form.backdatedAt} onChange={(event) => updateField("backdatedAt", event.target.value)} />
                </div>
                <div className="grid gap-2 md:col-span-3">
                  <Label htmlFor="adminBackdateReason">Backdate reason</Label>
                  <Input id="adminBackdateReason" value={form.backdateReason} onChange={(event) => updateField("backdateReason", event.target.value)} placeholder="Why this shipment date is being adjusted" />
                </div>
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="grid gap-2">
                <Label htmlFor="adminBusinessReference">Business reference</Label>
                <Input id="adminBusinessReference" value={form.businessReference} onChange={(e) => updateField("businessReference", e.target.value)} placeholder="PO, invoice, or account ref" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="adminCodAmount">COD amount</Label>
                <Input id="adminCodAmount" inputMode="decimal" value={form.codAmount} onChange={(e) => updateField("codAmount", e.target.value)} placeholder="0" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="adminCodStatus">COD status</Label>
                <select id="adminCodStatus" value={form.codStatus} onChange={(e) => updateField("codStatus", e.target.value)} className="h-11 rounded-md border bg-background/70 px-3 text-sm">
                  {["NOT_APPLICABLE", "PENDING", "COLLECTED", "PARTIALLY_REMITTED", "REMITTED", "DISPUTED"].map((status) => (
                    <option key={status} value={status}>{status.replaceAll("_", " ")}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="adminInternalNotes">Internal notes</Label>
              <textarea
                id="adminInternalNotes"
                value={form.internalNotes}
                onChange={(e) => updateField("internalNotes", e.target.value)}
                maxLength={2000}
                placeholder="Dispatcher notes, payment context, special handling, gate access, or customer commitments."
                className="min-h-24 rounded-md border bg-background/70 px-3 py-2 text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-primary"
              />
            </div>
            <Button disabled={saving} className="w-full sm:w-fit">
              {saving ? <Loader2 className="animate-spin" /> : <PackagePlus />}
              Create shipment
            </Button>
          </form>
        </CardContent>
      </Card>
      )}

      {showQuoteTools && (
      <Card className="glass">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <FileText className="size-5 text-primary" />
              Quote requests
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">Review order requests, assign a driver, and convert approved quotes into live shipments.</p>
          </div>
          <Button variant="outline" onClick={loadQuoteRequests} disabled={quotesLoading} className="w-full sm:w-auto">
            <RefreshCw className={quotesLoading ? "animate-spin" : ""} />
            Refresh
          </Button>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { label: "Pending review", value: quoteAnalytics.PENDING_REVIEW ?? 0 },
              { label: "Quoted", value: quoteAnalytics.QUOTED ?? 0 },
              { label: "Accepted", value: quoteAnalytics.ACCEPTED ?? 0 },
              { label: "Paid", value: quoteAnalytics.PAID ?? 0 },
              { label: "Converted", value: quoteAnalytics.CONVERTED_TO_SHIPMENT ?? 0 },
              { label: "Declined", value: quoteAnalytics.DECLINED ?? 0 },
              { label: "Expired", value: quoteAnalytics.EXPIRED ?? 0 }
            ].map(({ label, value }) => (
              <div key={label} className="rounded-md border bg-background/45 p-3">
                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
                <p className="mt-2 text-2xl font-black">{value}</p>
              </div>
            ))}
          </div>
          <div className="grid gap-3 rounded-md border bg-background/35 p-3 md:grid-cols-2 xl:grid-cols-5">
            <div className="grid gap-1 md:col-span-2 xl:col-span-1">
              <Label htmlFor="quoteSearch">Search quotes</Label>
              <Input
                id="quoteSearch"
                value={quoteFilters.query}
                onChange={(event) => updateQuoteFilter("query", event.target.value)}
                placeholder="Request ID, customer, route"
              />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="quoteStatusFilter">Status</Label>
              <select
                id="quoteStatusFilter"
                value={quoteFilters.status}
                onChange={(event) => updateQuoteFilter("status", event.target.value)}
                className="h-10 rounded-md border bg-background/70 px-3 text-sm"
              >
                {quoteFilterStatusOptions.map((status) => (
                  <option key={status} value={status}>{status === "all" ? "All statuses" : quoteStatusLabel(status)}</option>
                ))}
              </select>
            </div>
            <div className="grid gap-1">
              <Label htmlFor="quotePaymentFilter">Payment</Label>
              <select
                id="quotePaymentFilter"
                value={quoteFilters.paymentStatus}
                onChange={(event) => updateQuoteFilter("paymentStatus", event.target.value)}
                className="h-10 rounded-md border bg-background/70 px-3 text-sm"
              >
                {paymentFilterOptions.map((status) => (
                  <option key={status} value={status}>{status === "all" ? "All payments" : status.replaceAll("_", " ")}</option>
                ))}
              </select>
            </div>
            <div className="grid gap-1">
              <Label htmlFor="quoteDeliveryFilter">Delivery type</Label>
              <select
                id="quoteDeliveryFilter"
                value={quoteFilters.deliveryCategory}
                onChange={(event) => updateQuoteFilter("deliveryCategory", event.target.value)}
                className="h-10 rounded-md border bg-background/70 px-3 text-sm"
              >
                <option value="all">All delivery types</option>
                {deliveryTypeOptions.map((type) => (
                  <option key={type.value} value={type.value}>{type.label}</option>
                ))}
              </select>
            </div>
            <div className="flex items-end text-xs text-muted-foreground">
              Showing {filteredQuoteRequests.length} of {quoteRequests.length}
            </div>
          </div>
          {quotesLoading && <div className="rounded-md border p-4 text-sm text-muted-foreground">Loading quote requests...</div>}
          {!quotesLoading && quoteRequests.length === 0 && <div className="rounded-md border p-4 text-sm text-muted-foreground">No quote requests yet.</div>}
          {!quotesLoading && quoteRequests.length > 0 && filteredQuoteRequests.length === 0 && <div className="rounded-md border p-4 text-sm text-muted-foreground">No quote requests match these filters.</div>}
          {filteredQuoteRequests.map((quote) => {
            const status = normalizeQuoteStatus(quote.status);
            const converted = status === "CONVERTED_TO_SHIPMENT";
            const declined = status === "DECLINED";
            const expired = status === "EXPIRED";
            const reviewBusy = reviewingRequestId === quote.request_id;
            const paid = String(quote.payment_status ?? "UNPAID").toUpperCase() === "PAID";
            const conversionReady = canConvertQuote(quote.status, quote.payment_status);
            const draft = quoteDrafts[quote.request_id] ?? quoteDraftFromRecord(quote);
            const expanded = expandedQuotes[quote.request_id] ?? false;
            return (
              <div key={quote.request_id} className="overflow-hidden rounded-md border bg-background/45">
                <button
                  type="button"
                  onClick={() => toggleQuote(quote.request_id)}
                  className="flex w-full flex-col gap-3 p-4 text-left transition hover:bg-primary/5 lg:flex-row lg:items-center lg:justify-between"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <ArrowRight className={expanded ? "size-4 rotate-90 text-primary transition-transform" : "size-4 text-primary transition-transform"} />
                      <h3 className="font-mono text-lg font-bold">{quote.request_id}</h3>
                      <Badge className={quoteLifecycleTone(quote.status)}>{quoteStatusLabel(quote.status)}</Badge>
                      <PaymentStatusBadge status={quote.payment_status} />
                      <Badge>{quote.urgency}</Badge>
                    </div>
                    <p className="mt-2 truncate text-sm font-medium">{quote.customer_name} - {quote.package_type}</p>
                    <p className="mt-1 truncate text-xs text-muted-foreground">{quote.pickup_address} to {quote.delivery_address}</p>
                  </div>
                  <div className="grid gap-2 text-sm sm:grid-cols-2 lg:min-w-[280px]">
                    <span className="rounded-md border bg-background/55 p-2">
                      <span className="block text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Quoted amount</span>
                      {moneyFormatter.format(quoteDisplayAmount(quote))}
                    </span>
                    <span className="rounded-md border bg-background/55 p-2">
                      <span className="block text-[10px] uppercase tracking-[0.16em] text-muted-foreground">ETA</span>
                      {quoteDisplayEta(quote)}
                    </span>
                  </div>
                </button>
                <div className={`${expanded ? "flex" : "hidden"} flex-col gap-4 border-t p-4 lg:flex-row lg:items-start lg:justify-between`}>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-mono text-lg font-bold">{quote.request_id}</h3>
                      <Badge className={quoteLifecycleTone(quote.status)}>{quoteStatusLabel(quote.status)}</Badge>
                      <PaymentStatusBadge status={quote.payment_status} />
                      <Badge>{quote.urgency}</Badge>
                    </div>
                    <p className="mt-2 text-sm font-medium">{quote.customer_name}</p>
                    <p className="text-sm text-muted-foreground">{quote.customer_email}{quote.customer_phone ? `, ${quote.customer_phone}` : ""}</p>
                    <p className="mt-3 text-sm text-muted-foreground">{quote.pickup_address} to {quote.delivery_address}</p>
                    <div className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
                      <span className="rounded-md border bg-background/50 p-2">
                        <span className="block text-xs text-muted-foreground">Package</span>
                        {quote.package_type}
                      </span>
                      <span className="rounded-md border bg-background/50 p-2">
                        <span className="block text-xs text-muted-foreground">Weight</span>
                        {quote.weight_kg} kg
                      </span>
                      <span className="rounded-md border bg-background/50 p-2">
                        <span className="flex items-center gap-1 text-xs text-muted-foreground"><DollarSign className="size-3" /> Estimate</span>
                        {moneyFormatter.format(Number(quote.estimated_price ?? 0))} / {quote.estimated_eta_hours}h
                      </span>
                      <span className="rounded-md border bg-background/50 p-2">
                        <span className="block text-xs text-muted-foreground">Customer quote</span>
                        {moneyFormatter.format(quoteDisplayAmount(quote))} / {quoteDisplayEta(quote)}
                        <span className="mt-1 block text-xs text-muted-foreground">
                          Valid until {quote.quote_valid_until ? new Date(quote.quote_valid_until).toLocaleDateString() : "operations decides"}
                        </span>
                      </span>
                    </div>
                    {quote.notes && <p className="mt-3 rounded-md border bg-background/35 p-3 text-sm text-muted-foreground">{quote.notes}</p>}
                    {(quote.quote_notes || quote.review_notes) && (
                      <p className="mt-3 rounded-md border border-primary/20 bg-primary/5 p-3 text-sm text-muted-foreground">
                        <span className="font-semibold text-foreground">Quote note:</span> {quote.quote_notes ?? quote.review_notes}
                      </p>
                    )}
                    {!paid && !converted && status === "ACCEPTED" && (
                      <p className="mt-3 rounded-md border border-primary/30 bg-primary/10 p-3 text-xs text-primary">
                        Customer accepted this quote. Payment must clear before conversion unless an admin override is used.
                      </p>
                    )}
                    {!paid && status === "QUOTED" && (
                      <p className="mt-3 rounded-md border border-sky-500/30 bg-sky-500/10 p-3 text-xs text-sky-500">
                        Quote sent. Waiting for the customer to accept or decline in their customer dashboard.
                      </p>
                    )}
                  </div>
                  <div className="grid min-w-0 gap-2 sm:grid-cols-2 lg:min-w-[460px]">
                    <div className="grid gap-1">
                      <Label htmlFor={`${quote.request_id}-price`}>Quoted price</Label>
                      <Input
                        id={`${quote.request_id}-price`}
                        inputMode="decimal"
                        value={draft.quotedPrice}
                        onChange={(event) => updateQuoteDraft(quote.request_id, "quotedPrice", event.target.value)}
                        disabled={converted || reviewBusy}
                      />
                    </div>
                    <div className="grid gap-1">
                      <Label htmlFor={`${quote.request_id}-eta-hours`}>ETA hours</Label>
                      <Input
                        id={`${quote.request_id}-eta-hours`}
                        inputMode="numeric"
                        value={draft.quotedEtaHours}
                        onChange={(event) => updateQuoteDraft(quote.request_id, "quotedEtaHours", event.target.value)}
                        disabled={converted || reviewBusy}
                      />
                    </div>
                    <div className="grid gap-1">
                      <Label htmlFor={`${quote.request_id}-eta-label`}>ETA shown to customer</Label>
                      <Input
                        id={`${quote.request_id}-eta-label`}
                        value={draft.quotedEtaLabel}
                        onChange={(event) => updateQuoteDraft(quote.request_id, "quotedEtaLabel", event.target.value)}
                        disabled={converted || reviewBusy}
                        placeholder="24h or 2 days"
                      />
                    </div>
                    <div className="grid gap-1">
                      <Label htmlFor={`${quote.request_id}-validity`}>Valid until</Label>
                      <Input
                        id={`${quote.request_id}-validity`}
                        type="date"
                        value={draft.quoteValidUntil}
                        onChange={(event) => updateQuoteDraft(quote.request_id, "quoteValidUntil", event.target.value)}
                        disabled={converted || reviewBusy}
                      />
                    </div>
                    <textarea
                      value={draft.quoteNotes}
                      onChange={(event) => updateQuoteDraft(quote.request_id, "quoteNotes", event.target.value)}
                      disabled={converted || reviewBusy}
                      maxLength={2000}
                      placeholder="Customer-facing quote notes, terms, special handling, or delivery conditions"
                      className="min-h-20 rounded-md border bg-background/70 px-3 py-2 text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-primary sm:col-span-2"
                    />
                    <textarea
                      value={draft.reviewNotes}
                      onChange={(event) => updateQuoteReviewNotes(quote.request_id, event.target.value)}
                      disabled={converted || reviewBusy}
                      maxLength={2000}
                      placeholder="Review notes for operations and customer follow-up"
                      className="min-h-20 rounded-md border bg-background/70 px-3 py-2 text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-primary sm:col-span-2"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      disabled={converted || reviewBusy}
                      onClick={() => void reviewQuoteRequest(quote.request_id, "update_quote")}
                      className="w-full"
                    >
                      {reviewBusy ? <Loader2 className="animate-spin" /> : <FileText />}
                      Save draft
                    </Button>
                    <Button
                      type="button"
                      disabled={converted || reviewBusy}
                      onClick={() => void reviewQuoteRequest(quote.request_id, "send_quote")}
                      className="w-full"
                    >
                      {reviewBusy ? <Loader2 className="animate-spin" /> : <Send />}
                      Send Quote
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={converted || reviewBusy}
                      onClick={() => void reviewQuoteRequest(quote.request_id, "decline")}
                      className="w-full"
                    >
                      {reviewBusy ? <Loader2 className="animate-spin" /> : <XCircle />}
                      Decline
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={converted || declined || expired || reviewBusy}
                      onClick={() => void reviewQuoteRequest(quote.request_id, "expire")}
                      className="w-full"
                    >
                      {reviewBusy ? <Loader2 className="animate-spin" /> : <Clock3 />}
                      Expire
                    </Button>
                    <select
                      value={quoteDriverIds[quote.request_id] ?? ""}
                      onChange={(event) => updateQuoteDriver(quote.request_id, event.target.value)}
                      disabled={converted || declined || expired || convertingRequestId === quote.request_id}
                      className="h-10 rounded-md border bg-background/70 px-3 text-sm"
                    >
                      <option value="">Create unassigned</option>
                      {assignableDrivers.map((driver) => (
                        <option key={String(driver.id)} value={String(driver.id)}>
                          {driver.name}
                        </option>
                      ))}
                    </select>
                    <Button
                      type="button"
                      disabled={converted || declined || expired || !conversionReady || convertingRequestId === quote.request_id}
                      onClick={() => void convertQuoteRequest(quote.request_id)}
                      className="w-full"
                    >
                      {convertingRequestId === quote.request_id ? <Loader2 className="animate-spin" /> : <ArrowRight />}
                      {converted ? "Converted" : conversionReady ? "Convert" : "Pay first"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={converted || convertingRequestId === quote.request_id}
                      onClick={() => void convertQuoteRequest(quote.request_id, true)}
                      className="w-full sm:col-span-2"
                    >
                      {convertingRequestId === quote.request_id ? <Loader2 className="animate-spin" /> : <ShieldCheck />}
                      Admin override conversion
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      disabled={deletingRequestId === quote.request_id || reviewingRequestId === quote.request_id || convertingRequestId === quote.request_id}
                      onClick={() => void deleteQuoteRequest(quote.request_id)}
                      className="w-full sm:col-span-2"
                    >
                      {deletingRequestId === quote.request_id ? <Loader2 className="animate-spin" /> : <Trash2 />}
                      Delete quote request
                    </Button>
                    {quote.customer_phone ? (
                      <>
                        <Button
                          type="button"
                          variant="outline"
                          disabled={notificationSendingId === `${quote.request_id}:quote_received`}
                          onClick={() =>
                            void sendProviderNotification({
                              key: `${quote.request_id}:quote_received`,
                              to: quote.customer_phone,
                              message: whatsappMessages.quoteReceived(quote),
                              workflow: "quote_received",
                              entityType: "quote_request",
                              entityId: quote.request_id
                            })
                          }
                          className="w-full sm:col-span-2"
                        >
                          {notificationSendingId === `${quote.request_id}:quote_received` ? <Loader2 className="animate-spin" /> : <BellRing />}
                          Send received notice
                        </Button>
                        <Button asChild type="button" variant="outline" className="w-full sm:col-span-2">
                          <a
                            href={customerWhatsAppUrl(quote.customer_phone, whatsappMessages.quoteReceived(quote))}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <MessageCircle />
                            Open WhatsApp chat
                          </a>
                        </Button>
                      </>
                    ) : (
                      <Button type="button" variant="outline" className="w-full sm:col-span-2" disabled>
                        <MessageCircle />
                        No WhatsApp phone
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
      )}

      {showShipmentTools && (
      <Card className="glass">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>Shipment operations</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">Assign drivers, update status, and attach proof of delivery.</p>
          </div>
          <Button variant="outline" onClick={loadShipments} disabled={loading} className="w-full sm:w-auto">
            <RefreshCw className={loading ? "animate-spin" : ""} />
            Refresh
          </Button>
        </CardHeader>
        <CardContent className="grid gap-4">
          {carrierFinanceSummary.length > 0 && (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {carrierFinanceSummary.map((item) => (
                <div key={item.provider} className="rounded-md border bg-background/45 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold">{carrierProviderLabels[item.provider]}</p>
                    <Badge>{item.count} shipment{item.count === 1 ? "" : "s"}</Badge>
                  </div>
                  <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
                    <span className="rounded-md border bg-background/55 p-2">Revenue <strong className="block text-foreground">{moneyFormatter.format(item.revenue)}</strong></span>
                    <span className="rounded-md border bg-background/55 p-2">Carrier cost <strong className="block text-foreground">{moneyFormatter.format(item.cost)}</strong></span>
                    <span className="rounded-md border bg-background/55 p-2">Rider payout <strong className="block text-foreground">{moneyFormatter.format(item.payout)}</strong></span>
                    <span className={`rounded-md border p-2 ${item.profit >= 0 ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-500" : "border-destructive/30 bg-destructive/10 text-destructive"}`}>Profit <strong className="block">{moneyFormatter.format(item.profit)}</strong></span>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="grid gap-3 rounded-md border bg-background/35 p-3 md:grid-cols-2 xl:grid-cols-6">
            <div className="grid gap-1 md:col-span-2 xl:col-span-2">
              <Label htmlFor="shipmentSearch">Search shipments</Label>
              <Input
                id="shipmentSearch"
                value={shipmentFilters.query}
                onChange={(event) => updateShipmentFilter("query", event.target.value)}
                placeholder="Tracking ID, sender, receiver, route"
              />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="shipmentStatusFilter">Status</Label>
              <select
                id="shipmentStatusFilter"
                value={shipmentFilters.status}
                onChange={(event) => updateShipmentFilter("status", event.target.value)}
                className="h-10 rounded-md border bg-background/70 px-3 text-sm"
              >
                <option value="all">All statuses</option>
                {adminShipmentStatusOptions.map((status) => (
                  <option key={status} value={status}>{shipmentStatusLabel(status)}</option>
                ))}
              </select>
            </div>
            <div className="grid gap-1">
              <Label htmlFor="shipmentPaymentFilter">Payment</Label>
              <select
                id="shipmentPaymentFilter"
                value={shipmentFilters.paymentStatus}
                onChange={(event) => updateShipmentFilter("paymentStatus", event.target.value)}
                className="h-10 rounded-md border bg-background/70 px-3 text-sm"
              >
                {paymentFilterOptions.map((status) => (
                  <option key={status} value={status}>{status === "all" ? "All payments" : status.replaceAll("_", " ")}</option>
                ))}
              </select>
            </div>
            <div className="grid gap-1">
              <Label htmlFor="shipmentCarrierFilter">Carrier</Label>
              <select
                id="shipmentCarrierFilter"
                value={shipmentFilters.carrierProvider}
                onChange={(event) => updateShipmentFilter("carrierProvider", event.target.value)}
                className="h-10 rounded-md border bg-background/70 px-3 text-sm"
              >
                <option value="all">All carriers</option>
                {carrierProviders.map((provider) => (
                  <option key={provider} value={provider}>{carrierProviderLabels[provider]}</option>
                ))}
              </select>
            </div>
            <div className="grid gap-1">
              <Label htmlFor="shipmentDeliveryFilter">Delivery type</Label>
              <select
                id="shipmentDeliveryFilter"
                value={shipmentFilters.deliveryCategory}
                onChange={(event) => updateShipmentFilter("deliveryCategory", event.target.value)}
                className="h-10 rounded-md border bg-background/70 px-3 text-sm"
              >
                <option value="all">All delivery types</option>
                {deliveryTypeOptions.map((type) => (
                  <option key={type.value} value={type.value}>{type.label}</option>
                ))}
              </select>
            </div>
            <div className="flex items-end text-xs text-muted-foreground xl:col-span-6">
              Showing {filteredShipments.length} of {shipments.length}
            </div>
          </div>
          {loading && <div className="rounded-md border p-4 text-sm text-muted-foreground">Loading shipments...</div>}
          {!loading && shipments.length === 0 && <div className="rounded-md border p-4 text-sm text-muted-foreground">No shipments yet. Create the first shipment above.</div>}
          {!loading && shipments.length > 0 && filteredShipments.length === 0 && <div className="rounded-md border p-4 text-sm text-muted-foreground">No shipments match these filters.</div>}
          {filteredShipments.map((shipment) => {
            const selectedCarrier = carrierSelections[shipment.tracking_id] ?? normalizeCarrierProvider(shipment.carrier_provider);
            const carrierBusy = carrierBusyKey?.startsWith(`${shipment.tracking_id}:`) ?? false;
            const carrierCreateBusy = carrierBusyKey?.startsWith(`${shipment.tracking_id}:create`) ?? false;
            const shipmentCarrierProvider = normalizeCarrierProvider(shipment.carrier_provider);
            const carrierCreateFailed = String(shipment.carrier_status ?? "").toLowerCase() === "carrier_create_failed";
            const fezCreateFailed = shipmentCarrierProvider === "fez_logistics" && carrierCreateFailed;
            const rates = carrierRates[shipment.tracking_id] ?? [];
            const expanded = expandedShipments[shipment.tracking_id] ?? false;
            const delivered = shipment.status === "DELIVERED";
            const visibleShipmentStatus = displayShipmentStatus(shipment);
            const editDraft = shipmentEditDrafts[shipment.tracking_id] ?? shipmentEditDraftFromRecord(shipment);
            const carrierLinkDraft = carrierLinkDrafts[shipment.tracking_id] ?? {
              carrierOrderId: carrierOrderReference(shipment),
              carrierTrackingId: carrierTrackingReference(shipment)
            };
            const selectedEditDeliveryType = deliveryTypeOptions.find((option) => option.value === editDraft.deliveryCategory) ?? deliveryTypeOptions[0];
            const finance = shipmentFinanceSnapshot(shipment);
            return (
            <div key={shipment.tracking_id} className="rounded-md border bg-background/45 p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-mono text-lg font-bold">{shipment.tracking_id}</h3>
                    <Badge className="border-primary/40 bg-primary/10 text-primary">{shipmentStatusLabel(visibleShipmentStatus)}</Badge>
                    <PaymentStatusBadge status={shipment.payment_status} />
                    <Badge className="border-muted-foreground/30 bg-background/55 text-muted-foreground">
                      {carrierProviderLabels[normalizeCarrierProvider(shipment.carrier_provider)]}
                    </Badge>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Sender: <span className="text-foreground">{shipment.customer_name ?? "Sender"}</span>
                    {" "}to receiver: <span className="text-foreground">{shipment.recipient_name ?? "Recipient name not recorded"}</span>
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">{shipment.delivery_address}</p>
                  <p className="mt-1 text-sm">{shipment.package_type}</p>
                  <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
                    <Truck className="size-4 text-primary" />
                    {shipment.assigned_driver?.name ?? "No driver assigned"}
                  </div>
                  <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
                    <Clock3 className="size-4 text-primary" />
                    ETA {shipment.eta ?? "pending"}
                  </div>
                  <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
                    <DollarSign className="size-4 text-primary" />
                    Payment {moneyFormatter.format(Number(shipment.payment_amount ?? shipment.quoted_price ?? 0))}
                    {shipment.payment_reference ? <span className="font-mono text-xs">{shipment.payment_reference}</span> : null}
                  </div>
                  {Number(shipment.cod_amount ?? 0) > 0 && (
                    <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
                      <CreditCard className="size-4 text-primary" />
                      COD {moneyFormatter.format(Number(shipment.cod_amount ?? 0))} · {shipment.cod_status ?? "PENDING"}
                    </div>
                  )}
                  {String(shipment.delivery_category ?? shipment.shipment_type ?? "").includes("international") && (
                    <div className="mt-3 grid gap-2 rounded-md border border-primary/20 bg-primary/5 p-3 text-xs sm:grid-cols-2 xl:grid-cols-4">
                      <span>
                        <span className="block uppercase tracking-[0.14em] text-muted-foreground">Freight mode</span>
                        <strong className="text-foreground">{freightModeLabel(shipment.freight_mode)}</strong>
                      </span>
                      <span>
                        <span className="block uppercase tracking-[0.14em] text-muted-foreground">Classification</span>
                        <strong className="text-foreground">{freightClassificationLabel(shipment.freight_classification)}</strong>
                      </span>
                      <span>
                        <span className="block uppercase tracking-[0.14em] text-muted-foreground">Currency</span>
                        <strong className="text-foreground">{shipment.quote_currency ?? "NGN"}</strong>
                      </span>
                      <span>
                        <span className="block uppercase tracking-[0.14em] text-muted-foreground">Tracking mode</span>
                        <strong className="text-foreground">{shipment.international_tracking_mode === "cargo_ship" ? "Cargo ship" : "Cargo plane"}</strong>
                      </span>
                    </div>
                  )}
                  <div className="mt-3 grid gap-2 text-xs sm:grid-cols-4">
                    <span className="rounded-md border bg-background/55 p-2">
                      <span className="block uppercase tracking-[0.14em] text-muted-foreground">Revenue</span>
                      <span className="font-semibold text-foreground">{moneyFormatter.format(finance.revenue)}</span>
                    </span>
                    <span className="rounded-md border bg-background/55 p-2">
                      <span className="block uppercase tracking-[0.14em] text-muted-foreground">Rider payout</span>
                      <span className="font-semibold text-foreground">{finance.driverPayout ? moneyFormatter.format(finance.driverPayout) : "Not set"}</span>
                    </span>
                    <span className="rounded-md border bg-background/55 p-2">
                      <span className="block uppercase tracking-[0.14em] text-muted-foreground">Carrier cost</span>
                      <span className="font-semibold text-foreground">{finance.carrierCost ? moneyFormatter.format(finance.carrierCost) : "Not set"}</span>
                    </span>
                    <span className={`rounded-md border p-2 ${finance.profit >= 0 ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-500" : "border-destructive/30 bg-destructive/10 text-destructive"}`}>
                      <span className="block uppercase tracking-[0.14em]">Profit</span>
                      <span className="font-semibold">{moneyFormatter.format(finance.profit)} ({finance.marginPercent}%)</span>
                    </span>
                  </div>
                  <div className="mt-3 rounded-md border border-primary/20 bg-primary/5 p-3 text-sm text-muted-foreground">
                    <span className="font-semibold text-foreground">Customer message:</span>{" "}
                    {shipment.customer_status_message ?? shipmentCustomerMessage(visibleShipmentStatus)}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => toggleShipment(shipment.tracking_id)}
                    className="mt-3 w-full sm:w-auto"
                  >
                    <ArrowRight className={expanded ? "rotate-90 transition-transform" : "transition-transform"} />
                    {expanded ? "Collapse operations" : "Open operations"}
                  </Button>
                </div>
                <div className={`${expanded ? "grid" : "hidden"} min-w-0 gap-2 sm:grid-cols-2 xl:min-w-[640px] xl:grid-cols-4`}>
                  <select
                    value={shipment.status}
                    onChange={(e) => void updateShipment(shipment.tracking_id, { status: e.target.value as ShipmentStatus })}
                    disabled={updatingTrackingId === shipment.tracking_id}
                    className="h-10 rounded-md border bg-background/70 px-3 text-sm"
                  >
                    {adminShipmentStatusOptions.map((status) => (
                      <option key={status} value={status} disabled={status === "DELIVERED" && !shipment.proof_image_url}>
                        {shipmentStatusLabel(status)}{status === "DELIVERED" && !shipment.proof_image_url ? " (proof required)" : ""}
                      </option>
                    ))}
                  </select>
                  <select
                    value={shipment.driver_id ? String(shipment.driver_id) : ""}
                    onChange={(e) => void updateShipment(shipment.tracking_id, { driverId: e.target.value })}
                    disabled={updatingTrackingId === shipment.tracking_id}
                    className="h-10 rounded-md border bg-background/70 px-3 text-sm"
                  >
                    <option value="">Unassigned</option>
                    {assignableDrivers.map((driver) => (
                      <option key={String(driver.id)} value={String(driver.id)}>
                        {driver.name}
                      </option>
                    ))}
                  </select>
                  <CloudinaryUpload
                    folder="fly-logistics/proof-of-delivery"
                    label={shipment.proof_image_url ? "Replace proof" : "Upload proof and mark delivered"}
                    onUploaded={(asset) => saveProof(shipment.tracking_id, asset)}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    disabled={suggestingTrackingId === shipment.tracking_id || updatingTrackingId === shipment.tracking_id}
                    onClick={() => void suggestDriver(shipment.tracking_id)}
                    className="w-full"
                  >
                    {suggestingTrackingId === shipment.tracking_id ? <Loader2 className="animate-spin" /> : <Sparkles />}
                    Suggest driver
                  </Button>
                  {String(shipment.payment_status ?? "").toUpperCase() === "PAID" ? (
                    <Button asChild type="button" variant="outline" className="w-full">
                      <a href={`/api/admin/receipts/${encodeURIComponent(shipment.payment_reference ?? shipment.tracking_id)}/pdf`} target="_blank" rel="noreferrer">
                        <Download />
                        Receipt
                      </a>
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    variant="destructive"
                    disabled={deletingTrackingId === shipment.tracking_id || updatingTrackingId === shipment.tracking_id || carrierBusy}
                    onClick={() => void deleteShipment(shipment.tracking_id)}
                    className="w-full"
                  >
                    {deletingTrackingId === shipment.tracking_id ? <Loader2 className="animate-spin" /> : <Trash2 />}
                    Delete shipment
                  </Button>
                </div>
              </div>
              <div className={expanded ? "mt-4 grid gap-4" : "hidden"}>
              <div className="grid gap-3 rounded-md border bg-background/40 p-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h4 className="text-sm font-semibold">Edit shipment details</h4>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      Admins can correct sender, receiver, package, ETA, and payment details before delivery is completed.
                    </p>
                  </div>
                  <Badge className={delivered ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-500" : "border-primary/40 bg-primary/10 text-primary"}>
                    {delivered ? "Delivered - locked" : "Editable before delivery"}
                  </Badge>
                </div>
                <div className="grid gap-3 rounded-md border border-primary/20 bg-primary/5 p-3 md:grid-cols-2 xl:grid-cols-5">
                  <div className="grid gap-1 md:col-span-2">
                    <Label htmlFor={`${shipment.tracking_id}-edit-category`}>Delivery type</Label>
                    <select
                      id={`${shipment.tracking_id}-edit-category`}
                      value={editDraft.deliveryCategory}
                      onChange={(event) => updateShipmentEditDraft(shipment.tracking_id, "deliveryCategory", event.target.value)}
                      disabled={delivered}
                      className="h-10 rounded-md border bg-background/70 px-3 text-sm"
                    >
                      {deliveryTypeOptions.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
                    </select>
                    <p className="text-xs leading-5 text-muted-foreground">{selectedEditDeliveryType.detail}</p>
                  </div>
                  <div className="grid gap-1">
                    <Label htmlFor={`${shipment.tracking_id}-edit-origin-country`}>Origin country</Label>
                    <Input id={`${shipment.tracking_id}-edit-origin-country`} value={editDraft.pickupCountry} onChange={(event) => updateShipmentEditDraft(shipment.tracking_id, "pickupCountry", event.target.value)} disabled={delivered} />
                  </div>
                  <div className="grid gap-1">
                    <Label htmlFor={`${shipment.tracking_id}-edit-destination-country`}>Destination country</Label>
                    <Input id={`${shipment.tracking_id}-edit-destination-country`} value={editDraft.destinationCountry} onChange={(event) => updateShipmentEditDraft(shipment.tracking_id, "destinationCountry", event.target.value)} disabled={delivered} />
                  </div>
                  <div className="grid gap-1">
                    <Label htmlFor={`${shipment.tracking_id}-edit-origin-state`}>Origin state</Label>
                    <select id={`${shipment.tracking_id}-edit-origin-state`} value={editDraft.pickupState} onChange={(event) => updateShipmentEditDraft(shipment.tracking_id, "pickupState", event.target.value)} disabled={delivered} className="h-10 rounded-md border bg-background/70 px-3 text-sm">
                      <option value="">Outside Nigeria / not applicable</option>
                      {nigerianStates.map((state) => <option key={state.code} value={state.code}>{state.name}</option>)}
                    </select>
                  </div>
                  <div className="grid gap-1 md:col-start-2">
                    <Label htmlFor={`${shipment.tracking_id}-edit-destination-state`}>Destination state</Label>
                    <select id={`${shipment.tracking_id}-edit-destination-state`} value={editDraft.destinationState} onChange={(event) => updateShipmentEditDraft(shipment.tracking_id, "destinationState", event.target.value)} disabled={delivered} className="h-10 rounded-md border bg-background/70 px-3 text-sm">
                      <option value="">Outside Nigeria / not applicable</option>
                      {nigerianStates.map((state) => <option key={state.code} value={state.code}>{state.name}</option>)}
                    </select>
                  </div>
                </div>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  <div className="grid gap-1">
                    <Label htmlFor={`${shipment.tracking_id}-edit-sender`}>Sender name</Label>
                    <Input id={`${shipment.tracking_id}-edit-sender`} value={editDraft.customerName} onChange={(event) => updateShipmentEditDraft(shipment.tracking_id, "customerName", event.target.value)} disabled={delivered} />
                  </div>
                  <div className="grid gap-1">
                    <Label htmlFor={`${shipment.tracking_id}-edit-sender-email`}>Sender email</Label>
                    <Input id={`${shipment.tracking_id}-edit-sender-email`} type="email" value={editDraft.customerEmail} onChange={(event) => updateShipmentEditDraft(shipment.tracking_id, "customerEmail", event.target.value)} disabled={delivered} />
                  </div>
                  <div className="grid gap-1">
                    <Label htmlFor={`${shipment.tracking_id}-edit-sender-phone`}>Sender phone</Label>
                    <Input id={`${shipment.tracking_id}-edit-sender-phone`} value={editDraft.customerPhone} onChange={(event) => updateShipmentEditDraft(shipment.tracking_id, "customerPhone", event.target.value)} disabled={delivered} />
                  </div>
                  <div className="grid gap-1">
                    <Label htmlFor={`${shipment.tracking_id}-edit-pickup-phone`}>Pickup phone</Label>
                    <Input id={`${shipment.tracking_id}-edit-pickup-phone`} value={editDraft.pickupPhone} onChange={(event) => updateShipmentEditDraft(shipment.tracking_id, "pickupPhone", event.target.value)} disabled={delivered} />
                  </div>
                  <div className="grid gap-1">
                    <Label htmlFor={`${shipment.tracking_id}-edit-recipient`}>Receiver name</Label>
                    <Input
                      id={`${shipment.tracking_id}-edit-recipient`}
                      value={editDraft.recipientName}
                      onChange={(event) => updateShipmentEditDraft(shipment.tracking_id, "recipientName", event.target.value)}
                      disabled={delivered && Boolean(shipment.recipient_name)}
                      required={!shipment.recipient_name}
                    />
                    {delivered && !shipment.recipient_name ? (
                      <p className="text-xs text-amber-500">Legacy record: enter the verified recipient name and save the correction.</p>
                    ) : null}
                  </div>
                  <div className="grid gap-1">
                    <Label htmlFor={`${shipment.tracking_id}-edit-recipient-phone`}>Receiver phone</Label>
                    <Input id={`${shipment.tracking_id}-edit-recipient-phone`} value={editDraft.deliveryPhone} onChange={(event) => updateShipmentEditDraft(shipment.tracking_id, "deliveryPhone", event.target.value)} disabled={delivered} />
                  </div>
                  <div className="grid gap-1 md:col-span-2">
                    <Label htmlFor={`${shipment.tracking_id}-edit-pickup`}>Pickup address</Label>
                    <Input id={`${shipment.tracking_id}-edit-pickup`} value={editDraft.pickupAddress} onChange={(event) => updateShipmentEditDraft(shipment.tracking_id, "pickupAddress", event.target.value)} disabled={delivered} />
                  </div>
                  <div className="grid gap-1 md:col-span-2">
                    <Label htmlFor={`${shipment.tracking_id}-edit-delivery`}>Delivery address</Label>
                    <Input id={`${shipment.tracking_id}-edit-delivery`} value={editDraft.deliveryAddress} onChange={(event) => updateShipmentEditDraft(shipment.tracking_id, "deliveryAddress", event.target.value)} disabled={delivered} />
                  </div>
                  <div className="grid gap-1">
                    <Label htmlFor={`${shipment.tracking_id}-edit-package`}>Package type</Label>
                    <Input id={`${shipment.tracking_id}-edit-package`} value={editDraft.packageType} onChange={(event) => updateShipmentEditDraft(shipment.tracking_id, "packageType", event.target.value)} disabled={delivered} />
                  </div>
                  <div className="grid gap-1">
                    <Label htmlFor={`${shipment.tracking_id}-edit-weight`}>Weight kg</Label>
                    <Input id={`${shipment.tracking_id}-edit-weight`} inputMode="decimal" value={editDraft.weightKg} onChange={(event) => updateShipmentEditDraft(shipment.tracking_id, "weightKg", event.target.value)} disabled={delivered} />
                  </div>
                  <div className="grid gap-1">
                    <Label htmlFor={`${shipment.tracking_id}-edit-package-value`}>Package value</Label>
                    <Input id={`${shipment.tracking_id}-edit-package-value`} inputMode="decimal" value={editDraft.packageValue} onChange={(event) => updateShipmentEditDraft(shipment.tracking_id, "packageValue", event.target.value)} disabled={delivered} />
                  </div>
                  <div className="grid gap-1">
                    <Label htmlFor={`${shipment.tracking_id}-edit-duties`}>Duties and taxes</Label>
                    <Input id={`${shipment.tracking_id}-edit-duties`} inputMode="decimal" value={editDraft.dutiesTaxesAmount} onChange={(event) => updateShipmentEditDraft(shipment.tracking_id, "dutiesTaxesAmount", event.target.value)} disabled={delivered} />
                  </div>
                  <div className="grid gap-1">
                    <Label htmlFor={`${shipment.tracking_id}-edit-freight-mode`}>Freight mode</Label>
                    <select id={`${shipment.tracking_id}-edit-freight-mode`} value={editDraft.freightMode} onChange={(event) => updateShipmentEditDraft(shipment.tracking_id, "freightMode", event.target.value)} disabled={delivered} className="h-10 rounded-md border bg-background/70 px-3 text-sm">
                      {freightModeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                  </div>
                  <div className="grid gap-1">
                    <Label htmlFor={`${shipment.tracking_id}-edit-currency`}>Quote currency</Label>
                    <select id={`${shipment.tracking_id}-edit-currency`} value={editDraft.quoteCurrency} onChange={(event) => updateShipmentEditDraft(shipment.tracking_id, "quoteCurrency", event.target.value)} disabled={delivered} className="h-10 rounded-md border bg-background/70 px-3 text-sm">
                      {supportedCurrencies.map((currency) => <option key={currency} value={currency}>{currency}</option>)}
                    </select>
                  </div>
                  <div className="grid gap-1 md:col-span-2">
                    <Label htmlFor={`${shipment.tracking_id}-edit-classification`}>Freight classification</Label>
                    <select id={`${shipment.tracking_id}-edit-classification`} value={editDraft.freightClassification} onChange={(event) => updateShipmentEditDraft(shipment.tracking_id, "freightClassification", event.target.value)} disabled={delivered} className="h-10 rounded-md border bg-background/70 px-3 text-sm">
                      {freightClassificationOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                  </div>
                  <div className="grid gap-1 md:col-span-2">
                    <Label htmlFor={`${shipment.tracking_id}-edit-customs`}>Customs information</Label>
                    <Input id={`${shipment.tracking_id}-edit-customs`} value={editDraft.customsInformation} onChange={(event) => updateShipmentEditDraft(shipment.tracking_id, "customsInformation", event.target.value)} disabled={delivered} />
                  </div>
                  <div className="grid gap-1 md:col-span-2">
                    <Label htmlFor={`${shipment.tracking_id}-edit-documents`}>Export/import documentation</Label>
                    <Input id={`${shipment.tracking_id}-edit-documents`} value={editDraft.exportImportDocuments} onChange={(event) => updateShipmentEditDraft(shipment.tracking_id, "exportImportDocuments", event.target.value)} disabled={delivered} />
                  </div>
                  <div className="grid gap-1">
                    <Label htmlFor={`${shipment.tracking_id}-edit-urgency`}>Urgency</Label>
                    <select id={`${shipment.tracking_id}-edit-urgency`} value={editDraft.urgency} onChange={(event) => updateShipmentEditDraft(shipment.tracking_id, "urgency", event.target.value)} disabled={delivered} className="h-10 rounded-md border bg-background/70 px-3 text-sm">
                      <option value="standard">Standard</option>
                      <option value="same_day">Same day</option>
                      <option value="express">Express</option>
                      <option value="priority">Priority</option>
                    </select>
                  </div>
                  <div className="grid gap-1">
                    <Label htmlFor={`${shipment.tracking_id}-edit-eta`}>ETA</Label>
                    <Input id={`${shipment.tracking_id}-edit-eta`} value={editDraft.eta} onChange={(event) => updateShipmentEditDraft(shipment.tracking_id, "eta", event.target.value)} disabled={delivered} />
                  </div>
                  <div className="grid gap-1">
                    <Label htmlFor={`${shipment.tracking_id}-edit-payment`}>Payment amount</Label>
                    <Input id={`${shipment.tracking_id}-edit-payment`} inputMode="decimal" value={editDraft.paymentAmount} onChange={(event) => updateShipmentEditDraft(shipment.tracking_id, "paymentAmount", event.target.value)} disabled={delivered} />
                  </div>
                </div>
                <div className="grid gap-3 rounded-md border border-primary/20 bg-primary/5 p-3 md:grid-cols-2 xl:grid-cols-4">
                  <div className="grid gap-1">
                    <Label htmlFor={`${shipment.tracking_id}-edit-payout`}>Rider/driver payout</Label>
                    <Input id={`${shipment.tracking_id}-edit-payout`} inputMode="decimal" value={editDraft.driverPayoutAmount} onChange={(event) => updateShipmentEditDraft(shipment.tracking_id, "driverPayoutAmount", event.target.value)} />
                  </div>
                  <div className="grid gap-1">
                    <Label htmlFor={`${shipment.tracking_id}-edit-payout-status`}>Payout status</Label>
                    <select id={`${shipment.tracking_id}-edit-payout-status`} value={editDraft.driverPayoutStatus} onChange={(event) => updateShipmentEditDraft(shipment.tracking_id, "driverPayoutStatus", event.target.value)} className="h-10 rounded-md border bg-background/70 px-3 text-sm">
                      {["UNPAID", "PENDING", "PAID", "CANCELLED"].map((status) => <option key={status} value={status}>{status.replaceAll("_", " ")}</option>)}
                    </select>
                  </div>
                  <div className="grid gap-1">
                    <Label htmlFor={`${shipment.tracking_id}-edit-carrier-cost`}>Carrier cost</Label>
                    <Input id={`${shipment.tracking_id}-edit-carrier-cost`} inputMode="decimal" value={editDraft.carrierCostAmount} onChange={(event) => updateShipmentEditDraft(shipment.tracking_id, "carrierCostAmount", event.target.value)} />
                  </div>
                  <div className="grid gap-1">
                    <Label htmlFor={`${shipment.tracking_id}-edit-backdate`}>Backdate shipment</Label>
                    <Input id={`${shipment.tracking_id}-edit-backdate`} type="datetime-local" value={editDraft.backdatedAt} onChange={(event) => updateShipmentEditDraft(shipment.tracking_id, "backdatedAt", event.target.value)} />
                  </div>
                  <div className="grid gap-1 md:col-span-2">
                    <Label htmlFor={`${shipment.tracking_id}-edit-payout-notes`}>Payout notes</Label>
                    <Input id={`${shipment.tracking_id}-edit-payout-notes`} value={editDraft.driverPayoutNotes} onChange={(event) => updateShipmentEditDraft(shipment.tracking_id, "driverPayoutNotes", event.target.value)} />
                  </div>
                  <div className="grid gap-1 md:col-span-2">
                    <Label htmlFor={`${shipment.tracking_id}-edit-backdate-reason`}>Backdate reason</Label>
                    <Input id={`${shipment.tracking_id}-edit-backdate-reason`} value={editDraft.backdateReason} onChange={(event) => updateShipmentEditDraft(shipment.tracking_id, "backdateReason", event.target.value)} />
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  disabled={savingShipmentDetailsId === shipment.tracking_id}
                  onClick={() => void saveShipmentDetails(shipment.tracking_id)}
                  className="w-full sm:w-fit"
                >
                  {savingShipmentDetailsId === shipment.tracking_id ? <Loader2 className="animate-spin" /> : <FileText />}
                  {delivered && !shipment.recipient_name
                    ? "Save recipient and finance corrections"
                    : delivered
                      ? "Save finance corrections"
                      : "Save shipment details"}
                </Button>
              </div>
              <div className="mt-4 grid gap-3 rounded-md border border-primary/20 bg-primary/5 p-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h4 className="text-sm font-semibold">Proof-of-delivery details</h4>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      Add recipient, OTP, signature, and location before uploading the proof photo. Public tracking keeps proof media private.
                    </p>
                  </div>
                  {shipment.proof_image_url && (
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className="border-emerald-500/40 bg-emerald-500/10 text-emerald-500">Proof stored</Badge>
                      <Button asChild type="button" size="sm" variant="outline">
                        <a href={optimizedCloudinaryImageUrl(shipment.proof_image_url, 1200)} target="_blank" rel="noreferrer">
                          <ExternalLink />
                          View
                        </a>
                      </Button>
                      <Button asChild type="button" size="sm" variant="outline">
                        <a href={shipment.proof_image_url} download={`Fly-Logistics-proof-${shipment.tracking_id}`} target="_blank" rel="noreferrer">
                          <Download />
                          Download
                        </a>
                      </Button>
                    </div>
                  )}
                </div>
                {shipment.proof_image_url && (
                  <a href={optimizedCloudinaryImageUrl(shipment.proof_image_url, 1200)} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-md border bg-background/60">
                    <Image
                      src={optimizedCloudinaryImageUrl(shipment.proof_image_url, 720)}
                      alt={`Proof of delivery for ${shipment.tracking_id}`}
                      width={720}
                      height={420}
                      className="max-h-72 w-full object-cover"
                      loading="lazy"
                      sizes="(min-width: 1280px) 720px, 100vw"
                    />
                  </a>
                )}
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                  <Input
                    value={proofDrafts[shipment.tracking_id]?.recipientName ?? ""}
                    onChange={(event) => updateProofDraft(shipment.tracking_id, "recipientName", event.target.value)}
                    placeholder="Recipient name"
                  />
                  <Input
                    value={proofDrafts[shipment.tracking_id]?.deliveryOtp ?? ""}
                    onChange={(event) => updateProofDraft(shipment.tracking_id, "deliveryOtp", event.target.value)}
                    placeholder="Delivery OTP"
                  />
                  <Input
                    inputMode="decimal"
                    value={proofDrafts[shipment.tracking_id]?.proofLat ?? ""}
                    onChange={(event) => updateProofDraft(shipment.tracking_id, "proofLat", event.target.value)}
                    placeholder="Latitude"
                  />
                  <Input
                    inputMode="decimal"
                    value={proofDrafts[shipment.tracking_id]?.proofLng ?? ""}
                    onChange={(event) => updateProofDraft(shipment.tracking_id, "proofLng", event.target.value)}
                    placeholder="Longitude"
                  />
                  <CloudinaryUpload
                    folder="fly-logistics/proof-of-delivery/signatures"
                    label={proofDrafts[shipment.tracking_id]?.recipientSignatureUrl ? "Replace signature" : "Upload signature"}
                    onUploaded={(asset) => updateProofDraft(shipment.tracking_id, "recipientSignatureUrl", asset.secureUrl)}
                  />
                </div>
              </div>
              <div className="mt-4 rounded-md border bg-background/40 p-3">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="text-sm font-semibold">Fulfilment provider</h4>
                      <Badge className="border-primary/30 bg-primary/10 text-primary">
                        {carrierProviderLabels[shipmentCarrierProvider]}
                      </Badge>
                      <Badge className="border-muted-foreground/30 bg-background/55 text-muted-foreground">
                        {carrierStatusLabel(shipment.carrier_status)}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      Keep this shipment internal, create the selected carrier order, or retry fulfilment after a carrier failure. Customer tracking remains Fly Logistics branded.
                    </p>
                    <div className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-4">
                      <span className="rounded-md border bg-background/55 p-2">
                        <span className="block font-medium text-foreground">Internal carrier order</span>
                        {carrierOrderReference(shipment) || "Not created"}
                      </span>
                      <span className="rounded-md border bg-background/55 p-2">
                        <span className="block font-medium text-foreground">Internal carrier reference</span>
                        {carrierTrackingReference(shipment) || "Not linked"}
                      </span>
                      <span className="rounded-md border bg-background/55 p-2">
                        <span className="block font-medium text-foreground">Carrier rate</span>
                        {shipment.carrier_rate_amount ? moneyFormatter.format(Number(shipment.carrier_rate_amount)) : "Not set"}
                      </span>
                      <span className="rounded-md border bg-background/55 p-2">
                        <span className="block font-medium text-foreground">Label</span>
                        {shipment.carrier_label_url ? (
                          <a href={shipment.carrier_label_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary">
                            Open label <ExternalLink className="size-3" />
                          </a>
                        ) : "Not created"}
                      </span>
                    </div>
                    <div className="mt-3 grid gap-2 rounded-md border bg-background/35 p-3 md:grid-cols-[1fr_1fr_auto]">
                      <div className="grid gap-1">
                        <Label htmlFor={`carrierOrder-${shipment.tracking_id}`} className="text-xs">Internal carrier order number</Label>
                        <Input
                          id={`carrierOrder-${shipment.tracking_id}`}
                          value={carrierLinkDraft.carrierOrderId}
                          onChange={(event) => updateCarrierLinkDraft(shipment.tracking_id, "carrierOrderId", event.target.value)}
                          placeholder="Auto-filled after carrier sync"
                          className="h-10"
                        />
                      </div>
                      <div className="grid gap-1">
                        <Label htmlFor={`carrierTracking-${shipment.tracking_id}`} className="text-xs">Internal carrier reference ID</Label>
                        <Input
                          id={`carrierTracking-${shipment.tracking_id}`}
                          value={carrierLinkDraft.carrierTrackingId}
                          onChange={(event) => updateCarrierLinkDraft(shipment.tracking_id, "carrierTrackingId", event.target.value)}
                          placeholder="Optional; defaults to order number"
                          className="h-10"
                        />
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        disabled={savingCarrierLinkId === shipment.tracking_id || carrierBusy}
                        onClick={() => void saveCarrierReference(shipment.tracking_id)}
                        className="self-end"
                      >
                        {savingCarrierLinkId === shipment.tracking_id ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
                        Save reference
                      </Button>
                    </div>
                  </div>
                  <div className="grid min-w-0 gap-2 sm:grid-cols-2 lg:min-w-[420px]">
                    <select
                      value={selectedCarrier}
                      onChange={(event) => updateCarrierSelection(shipment.tracking_id, event.target.value as CarrierProvider)}
                      disabled={carrierBusy}
                      className="h-10 rounded-md border bg-background/70 px-3 text-sm sm:col-span-2"
                    >
                      {carrierProviders.map((provider) => (
                        <option key={provider} value={provider}>{carrierProviderLabels[provider]}</option>
                      ))}
                    </select>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={carrierBusy}
                      onClick={() => void compareCarrierRates(shipment.tracking_id)}
                      className="w-full"
                    >
                      {carrierBusyKey === `${shipment.tracking_id}:rates` ? <Loader2 className="animate-spin" /> : <DollarSign />}
                      Compare rates
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={carrierBusy}
                      onClick={() => void createCarrierFulfilment(shipment.tracking_id)}
                      className="w-full"
                    >
                      {carrierCreateBusy ? <Loader2 className="animate-spin" /> : <Truck />}
                      Create / retry selected carrier
                    </Button>
                    {carrierCreateFailed && (
                      <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs leading-5 text-amber-200 sm:col-span-2">
                        <p className="font-semibold text-amber-100">
                          {carrierProviderLabels[shipmentCarrierProvider]} fulfilment did not complete for this shipment.
                        </p>
                        <p className="mt-1 text-amber-100/80">
                          Select any available provider above and click Create / retry selected carrier. The shipment stays active under Fly Logistics while you retry.
                        </p>
                        {fezCreateFailed && (
                          <Button
                            type="button"
                            variant="outline"
                            disabled={carrierBusy}
                            onClick={() => void createCarrierFulfilment(shipment.tracking_id, "sendbox")}
                            className="mt-3 w-full border-amber-500/40 bg-background/40 text-amber-100 hover:bg-amber-500/10"
                          >
                            {carrierBusyKey === `${shipment.tracking_id}:create:sendbox` ? <Loader2 className="animate-spin" /> : <Truck />}
                            Try Sendbox instead
                          </Button>
                        )}
                      </div>
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      disabled={carrierBusy}
                      onClick={() => void syncCarrierTracking(shipment.tracking_id)}
                      className="w-full sm:col-span-2"
                    >
                      {carrierBusyKey === `${shipment.tracking_id}:sync` ? <Loader2 className="animate-spin" /> : <RefreshCw />}
                      Refresh carrier status
                    </Button>
                  </div>
                </div>
                {rates.length > 0 && (
                  <div className="mt-3 grid gap-2 md:grid-cols-3">
                    {rates.map((rate, index) => (
                      <div key={`${shipment.tracking_id}-${rate.provider}-${rate.rateId ?? index}`} className="rounded-md border bg-background/55 p-3 text-sm">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold">{carrierProviderLabels[rate.provider]}</span>
                          <Badge>{rate.currency}</Badge>
                        </div>
                        <p className="mt-2 text-xs text-muted-foreground">{rate.serviceName}</p>
                        <p className="mt-2 text-lg font-bold">{rate.amount ? moneyFormatter.format(rate.amount) : "Rate pending"}</p>
                        {rate.etaLabel && <p className="text-xs text-muted-foreground">{rate.etaLabel}</p>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {dispatchRecommendations[shipment.tracking_id] && (
                <div className="mt-4 rounded-md border border-primary/30 bg-primary/10 p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge className="border-primary/40 bg-primary/10 text-primary">
                          <Bot className="mr-1 size-3" />
                          AI dispatch
                        </Badge>
                        <Badge>{dispatchRecommendations[shipment.tracking_id].mode === "groq" ? "AI recommendation" : "Operations fallback"}</Badge>
                        <Badge>{dispatchRecommendations[shipment.tracking_id].confidence}% confidence</Badge>
                      </div>
                      <h4 className="mt-3 text-lg font-bold">
                        Recommend {dispatchRecommendations[shipment.tracking_id].recommendedDriver.name}
                      </h4>
                      <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
                        {dispatchRecommendations[shipment.tracking_id].reason}
                      </p>
                      {dispatchRecommendations[shipment.tracking_id].routeRecommendation && (
                        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                          {[
                            ["ETA", dispatchRecommendations[shipment.tracking_id].routeRecommendation?.etaLabel],
                            ["Route", `${dispatchRecommendations[shipment.tracking_id].routeRecommendation?.distanceKm} km`],
                            ["Vehicle", dispatchRecommendations[shipment.tracking_id].routeRecommendation?.vehicleType],
                            ["Traffic", dispatchRecommendations[shipment.tracking_id].routeRecommendation?.trafficAssumption]
                          ].map(([label, value]) => (
                            <div key={label} className="rounded-md border bg-background/50 p-2">
                              <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
                              <p className="mt-1 text-sm font-semibold capitalize">{value}</p>
                            </div>
                          ))}
                          <p className="sm:col-span-2 lg:col-span-4 text-xs leading-5 text-muted-foreground">
                            {dispatchRecommendations[shipment.tracking_id].routeRecommendation?.routeSummary}
                          </p>
                        </div>
                      )}
                      <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                        {dispatchRecommendations[shipment.tracking_id].recommendedDriver.signals.map((signal) => (
                          <span key={signal} className="rounded-md border bg-background/50 px-2 py-1">{signal}</span>
                        ))}
                      </div>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2 lg:min-w-64 lg:grid-cols-1">
                      <Button
                        type="button"
                        disabled={updatingTrackingId === shipment.tracking_id}
                        onClick={() => void approveDispatchRecommendation(shipment.tracking_id)}
                        className="w-full"
                      >
                        {updatingTrackingId === shipment.tracking_id ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
                        Approve assignment
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full"
                        onClick={() =>
                          setDispatchRecommendations((current) => {
                            const next = { ...current };
                            delete next[shipment.tracking_id];
                            return next;
                          })
                        }
                      >
                        Keep manual assignment
                      </Button>
                    </div>
                  </div>
                </div>
              )}
              <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_360px]">
                <div className="rounded-md border bg-background/40 p-3">
                  <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
                    <CheckSquare2 className="size-4 text-primary" />
                    Operations checklist
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {shipmentOperationsChecklist(shipment).map((item) => (
                      <div key={item.key} className="rounded-md border bg-background/45 p-3 text-sm">
                        <div className="flex items-start gap-2">
                          {item.complete ? (
                            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-500" />
                          ) : (
                            <Clock3 className="mt-0.5 size-4 shrink-0 text-primary" />
                          )}
                          <span>
                            <span className="block font-medium">{item.label}</span>
                            <span className="mt-1 block text-xs leading-5 text-muted-foreground">{item.detail}</span>
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="rounded-md border bg-background/40 p-3">
                  <h4 className="text-sm font-semibold">Internal notes</h4>
                  <textarea
                    value={internalNotesDrafts[shipment.tracking_id] ?? shipment.internal_notes ?? ""}
                    onChange={(event) => updateInternalNotesDraft(shipment.tracking_id, event.target.value)}
                    maxLength={2000}
                    placeholder="Dispatcher notes, warehouse instructions, customer commitments, access codes, or risk flags."
                    className="mt-3 min-h-28 w-full rounded-md border bg-background/70 px-3 py-2 text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-primary"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    disabled={savingNotesTrackingId === shipment.tracking_id || updatingTrackingId === shipment.tracking_id}
                    onClick={() => void saveInternalNotes(shipment.tracking_id)}
                    className="mt-3 w-full"
                  >
                    {savingNotesTrackingId === shipment.tracking_id ? <Loader2 className="animate-spin" /> : <FileText />}
                    Save notes
                  </Button>
                </div>
              </div>
              <div className="mt-4 rounded-md border bg-background/40 p-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h4 className="text-sm font-semibold">Customer phone notifications</h4>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Send branded WhatsApp or SMS updates. Local Nigerian numbers are normalized with +234 automatically.
                    </p>
                  </div>
                  <Badge>{shipment.customer_phone ? "Customer phone ready" : "Phone required"}</Badge>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {[
                    { label: "Shipment confirmed", workflow: "shipment_confirmed", message: whatsappMessages.shipmentConfirmed(shipment), icon: CheckCircle2 },
                    { label: "Driver assigned", workflow: "driver_assigned", message: whatsappMessages.driverAssigned(shipment), icon: Truck },
                    { label: "Picked up", workflow: "shipment_picked_up", message: whatsappMessages.shipmentPickedUp(shipment), icon: PackagePlus },
                    { label: "In transit", workflow: "in_transit_update", message: whatsappMessages.inTransitUpdate(shipment), icon: Send },
                    { label: "Delivered", workflow: "delivered_confirmation", message: whatsappMessages.deliveredConfirmation(shipment), icon: CheckCircle2 },
                    { label: "Payment confirmed", workflow: "payment_confirmation", message: whatsappMessages.paymentConfirmation(shipment), icon: DollarSign }
                  ].map((notification) => {
                    const whatsAppKey = `${shipment.tracking_id}:${notification.workflow}:whatsapp`;
                    const smsKey = `${shipment.tracking_id}:${notification.workflow}:sms`;
                    return (
                      <div key={notification.workflow} className="grid grid-cols-[1fr_auto] gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          disabled={!shipment.customer_phone || notificationSendingId === whatsAppKey}
                          onClick={() =>
                            void sendProviderNotification({
                              key: whatsAppKey,
                              channel: "whatsapp",
                              to: shipment.customer_phone,
                              message: notification.message,
                              workflow: notification.workflow,
                              entityType: "shipment",
                              entityId: shipment.tracking_id
                            })
                          }
                          className="w-full justify-start"
                        >
                          {notificationSendingId === whatsAppKey ? <Loader2 className="animate-spin" /> : <notification.icon />}
                          {notification.label}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          disabled={!shipment.customer_phone || notificationSendingId === smsKey}
                          onClick={() =>
                            void sendProviderNotification({
                              key: smsKey,
                              channel: "sms",
                              to: shipment.customer_phone,
                              message: notification.message,
                              workflow: notification.workflow,
                              entityType: "shipment",
                              entityId: shipment.tracking_id
                            })
                          }
                          aria-label={`Send ${notification.label} by SMS`}
                        >
                          {notificationSendingId === smsKey ? <Loader2 className="animate-spin" /> : <MessageCircle />}
                          SMS
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="mt-4 grid gap-2 sm:grid-cols-3">
                {shipment.customer_phone ? (
                  <>
                    <Button asChild type="button" variant="outline" className="w-full">
                      <a href={customerWhatsAppUrl(shipment.customer_phone, whatsappMessages.notifyCustomer(shipment))} target="_blank" rel="noreferrer">
                        <BellRing />
                        Notify customer
                      </a>
                    </Button>
                    <Button asChild type="button" variant="outline" className="w-full">
                      <a href={customerWhatsAppUrl(shipment.customer_phone, whatsappMessages.sendTrackingId(shipment))} target="_blank" rel="noreferrer">
                        <Send />
                        Send tracking ID
                      </a>
                    </Button>
                    <Button asChild type="button" variant="outline" className="w-full">
                      <a href={customerWhatsAppUrl(shipment.customer_phone, whatsappMessages.deliveryUpdate(shipment))} target="_blank" rel="noreferrer">
                        <MessageCircle />
                        Send delivery update
                      </a>
                    </Button>
                  </>
                ) : (
                  <div className="rounded-md border bg-background/40 p-3 text-sm text-muted-foreground sm:col-span-3">
                    Add a customer phone number to enable WhatsApp notifications for this shipment.
                  </div>
                )}
              </div>
              <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_360px]">
                <div className="rounded-md border bg-background/40 p-3">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <h4 className="text-sm font-semibold">Shipment timeline</h4>
                    {updatingTrackingId === shipment.tracking_id && <Loader2 className="size-4 animate-spin text-primary" />}
                  </div>
                  <div className="grid gap-2">
                    {sortShipmentTimelineLatestFirst(shipment.timeline?.length ? shipment.timeline : [{ label: "Shipment created", location: shipment.pickup_address, completed: true }]).map((event, index) => (
                      <div key={`${shipment.tracking_id}-${event.label}-${index}`} className="flex flex-col gap-3 rounded-md border bg-background/55 p-3 text-sm sm:flex-row sm:items-start sm:justify-between">
                        <span className="flex min-w-0 items-start gap-2">
                          <MapPin className="mt-0.5 size-4 shrink-0 text-primary" />
                          <span>
                            <span className="block font-medium">{event.label}</span>
                            <span className="text-xs text-muted-foreground">{event.location ?? "Network event"}{event.occurred_at ? ` - ${new Date(event.occurred_at).toLocaleString()}` : ""}</span>
                          </span>
                        </span>
                        <Badge className={event.completed ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-500" : "border-primary/40 bg-primary/10 text-primary"}>
                          {event.completed ? "Done" : "Pending"}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="rounded-md border bg-background/40 p-3">
                  <h4 className="text-sm font-semibold">Add event</h4>
                  <div className="mt-3 grid gap-2">
                    <Input
                      value={eventDrafts[shipment.tracking_id]?.label ?? ""}
                      onChange={(event) => updateEventDraft(shipment.tracking_id, "label", event.target.value)}
                      placeholder="Arrived at Lagos hub"
                    />
                    <Input
                      value={eventDrafts[shipment.tracking_id]?.location ?? ""}
                      onChange={(event) => updateEventDraft(shipment.tracking_id, "location", event.target.value)}
                      placeholder="Location"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      disabled={updatingTrackingId === shipment.tracking_id || !eventDrafts[shipment.tracking_id]?.label?.trim()}
                      onClick={() => void addTimelineEvent(shipment.tracking_id)}
                    >
                      {updatingTrackingId === shipment.tracking_id ? <Loader2 className="animate-spin" /> : <Clock3 />}
                      Add timeline event
                    </Button>
                  </div>
                </div>
              </div>
            </div>
            </div>
            );
          })}
        </CardContent>
      </Card>
      )}
    </section>
  );
}
