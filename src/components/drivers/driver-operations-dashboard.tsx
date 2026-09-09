"use client";

import Link from "next/link";
import Image from "next/image";
import type { Route as NextRoute } from "next";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  Clock3,
  Headphones,
  History,
  Loader2,
  LocateFixed,
  MapPinned,
  MessageCircle,
  Navigation,
  PackageCheck,
  PackageX,
  Phone,
  RefreshCw,
  Route,
  ShieldCheck,
  Star,
  Timer,
  Truck,
  Wifi,
  WifiOff
} from "lucide-react";
import { AccountControl } from "@/components/auth/account-control";
import { AccountPasswordPanel } from "@/components/auth/account-password-panel";
import { RoleGate } from "@/components/auth/role-gate";
import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/brand/theme-toggle";
import { CloudinaryUpload } from "@/components/cloudinary/cloudinary-upload";
import { DriverKycPanel } from "@/components/drivers/driver-kyc-panel";
import { AccountSupportCenter } from "@/components/support/account-support-center";
import { flyError, flySuccess } from "@/components/feedback/fly-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { getSupabaseBrowser } from "@/lib/supabase";
import {
  normalizeShipmentStatus,
  shipmentStatusLabel,
  sortShipmentTimelineLatestFirst,
  type DriverSummary,
  type ShipmentRecord
} from "@/lib/shipments";
import type { UploadedAsset } from "@/lib/cloudinary";
import { buildWhatsAppUrl } from "@/lib/whatsapp";
import { optimizedCloudinaryImageUrl } from "@/lib/cloudinary-url";

type DriverOverview = {
  driver: DriverSummary | null;
  shipments: ShipmentRecord[];
  stats: {
    completedDeliveries: number;
    activeDeliveries: number;
    failedDeliveries: number;
    acceptedAssignments: number;
    rejectedAssignments: number;
    acceptanceRate: number;
    deliverySuccessRate: number;
    performanceScore: number;
    performanceGrade: string;
    rating: number;
    onlineDurationSeconds: number;
    payoutTotal: number;
    averageCompletionHours: number | null;
    averageEtaHours: number | null;
    activeRouteStates: string[];
    routeFocus: string;
  };
  message?: string;
};

const statusSteps = [
  { status: "PICKED_UP", label: "Picked up", icon: PackageCheck },
  { status: "IN_TRANSIT", label: "In transit", icon: Navigation },
  { status: "ARRIVED", label: "Arrived", icon: MapPinned }
] as const;

const activeStatusSet = new Set(["PENDING", "CONFIRMED", "DRIVER_ASSIGNED", "PICKED_UP", "IN_TRANSIT", "ARRIVED"]);

const moneyFormatter = new Intl.NumberFormat("en-NG", {
  currency: "NGN",
  maximumFractionDigits: 0,
  style: "currency"
});

type DriverSection = "overview" | "assignments" | "location" | "kyc" | "history" | "support" | "security";

const driverNav = [
  { label: "Overview", href: "/driver", section: "overview", icon: ShieldCheck },
  { label: "Assignments", href: "/driver#driver-assignments", section: "assignments", icon: ClipboardList },
  { label: "Live location", href: "/driver#driver-location", section: "location", icon: LocateFixed },
  { label: "KYC", href: "/driver#driver-kyc", section: "kyc", icon: ShieldCheck },
  { label: "History", href: "/driver#driver-history", section: "history", icon: History },
  { label: "Support", href: "/driver#driver-support", section: "support", icon: Headphones },
  { label: "Security", href: "/driver#driver-security", section: "security", icon: ShieldCheck }
] as const;

function driverSectionFromHash(hash: string): DriverSection {
  switch (hash.replace("#", "")) {
    case "driver-assignments":
      return "assignments";
    case "driver-location":
      return "location";
    case "driver-kyc":
      return "kyc";
    case "driver-history":
      return "history";
    case "driver-support":
      return "support";
    case "driver-security":
      return "security";
    default:
      return "overview";
  }
}

function statusBadgeClass(status?: string | null) {
  const normalized = normalizeShipmentStatus(status);
  if (normalized === "DELIVERED") return "border-emerald-500/40 bg-emerald-500/10 text-emerald-500";
  if (normalized === "CANCELLED") return "border-destructive/40 bg-destructive/10 text-destructive";
  if (normalized === "IN_TRANSIT" || normalized === "ARRIVED") return "border-primary/40 bg-primary/10 text-primary";
  return "border-muted-foreground/30 bg-background/60 text-muted-foreground";
}

function approvalBadgeClass(status?: string | null) {
  if (status === "approved") return "border-emerald-500/40 bg-emerald-500/10 text-emerald-500";
  if (status === "rejected" || status === "suspended") return "border-destructive/40 bg-destructive/10 text-destructive";
  return "border-primary/40 bg-primary/10 text-primary";
}

function formatDuration(seconds: number) {
  if (!seconds) return "0m";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function formatDate(value?: string | null) {
  if (!value) return "Not recorded";
  return new Date(value).toLocaleString();
}

function driverCustomerMessage(shipment: ShipmentRecord, driverName?: string | null) {
  return [
    `Hello ${shipment.customer_name ?? "there"}, this is ${driverName ?? "your Fly Logistics rider"}.`,
    `I am handling shipment ${shipment.tracking_id}.`,
    shipment.eta ? `Current ETA: ${shipment.eta}.` : "I will keep you updated on the delivery ETA.",
    "Thank you for choosing Fly Logistics."
  ].join("\n");
}

export function DriverOperationsDashboard() {
  const [overview, setOverview] = useState<DriverOverview | null>(null);
  const [activeSection, setActiveSection] = useState<DriverSection>("overview");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [updatingKey, setUpdatingKey] = useState<string | null>(null);
  const [locationDraft, setLocationDraft] = useState({ latitude: "", longitude: "" });
  const [sharingLocation, setSharingLocation] = useState(false);
  const [etaDrafts, setEtaDrafts] = useState<Record<string, string>>({});
  const [rejectReasons, setRejectReasons] = useState<Record<string, string>>({});
  const [assignmentFilters, setAssignmentFilters] = useState({ query: "", status: "all", urgency: "all" });
  const [historyFilters, setHistoryFilters] = useState({ query: "", status: "all" });
  const [proofDrafts, setProofDrafts] = useState<Record<string, { deliveryOtp: string; recipientName: string; recipientSignatureUrl: string; proofLat: string; proofLng: string }>>({});

  const driver = overview?.driver ?? null;
  const driverId = driver?.id;
  const driverLatitude = driver?.latitude;
  const driverLongitude = driver?.longitude;
  const driverApproved = driver?.approval_status === "approved";
  const driverOnline = driverApproved && !String(driver?.status ?? "offline").toLowerCase().includes("offline");
  const locationWatchRef = useRef<number | null>(null);

  useEffect(() => {
    const syncHash = () => setActiveSection(driverSectionFromHash(window.location.hash));
    syncHash();
    window.addEventListener("hashchange", syncHash);
    return () => window.removeEventListener("hashchange", syncHash);
  }, []);

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

  const showSuccess = useCallback((nextMessage: string) => {
    setMessage(nextMessage);
    flySuccess("Driver operation updated", nextMessage);
  }, []);

  const showError = useCallback((title: string, err: unknown, fallback: string) => {
    const nextError = err instanceof Error ? err.message : fallback;
    setError(nextError);
    flyError(title, nextError);
  }, []);

  const loadOverview = useCallback(async (quiet = false) => {
    if (quiet) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      const response = await authorizedFetch("/api/driver/operations");
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to load driver operations.");
      const nextOverview = data as DriverOverview;
      setOverview(nextOverview);
      setEtaDrafts((current) => ({
        ...Object.fromEntries(nextOverview.shipments.map((shipment) => [shipment.tracking_id, shipment.eta ?? ""])),
        ...current
      }));
      setProofDrafts((current) => ({
        ...Object.fromEntries(
          nextOverview.shipments.map((shipment) => [
            shipment.tracking_id,
            {
              deliveryOtp: shipment.delivery_otp ?? "",
              recipientName: shipment.recipient_name ?? "",
              recipientSignatureUrl: shipment.recipient_signature_url ?? "",
              proofLat: shipment.proof_lat !== undefined && shipment.proof_lat !== null ? String(shipment.proof_lat) : "",
              proofLng: shipment.proof_lng !== undefined && shipment.proof_lng !== null ? String(shipment.proof_lng) : ""
            }
          ])
        ),
        ...current
      }));
    } catch (err) {
      showError("Unable to load driver dashboard", err, "Unable to load driver operations.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [authorizedFetch, showError]);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  useEffect(() => {
    if (!driverId) return;
    setLocationDraft({
      latitude: String(driverLatitude ?? "6.5244"),
      longitude: String(driverLongitude ?? "3.3792")
    });
  }, [driverId, driverLatitude, driverLongitude]);

  useEffect(() => {
    if (!driverId) return;
    const supabase = getSupabaseBrowser();
    if (!supabase) return;

    const channel = supabase
      .channel(`driver-operations-${driverId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "drivers", filter: `id=eq.${driverId}` }, () => {
        void loadOverview(true);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "shipments", filter: `driver_id=eq.${driverId}` }, () => {
        void loadOverview(true);
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [driverId, loadOverview]);

  const activeShipments = useMemo(
    () => (overview?.shipments ?? []).filter((shipment) => activeStatusSet.has(normalizeShipmentStatus(shipment.status))),
    [overview?.shipments]
  );

  const shipmentHistory = useMemo(
    () => (overview?.shipments ?? []).filter((shipment) => !activeStatusSet.has(normalizeShipmentStatus(shipment.status))),
    [overview?.shipments]
  );

  const filteredActiveShipments = useMemo(() => {
    const query = assignmentFilters.query.trim().toLowerCase();
    return activeShipments.filter((shipment) => {
      const matchesQuery = !query || [
        shipment.tracking_id,
        shipment.package_type,
        shipment.pickup_address,
        shipment.delivery_address,
        shipment.customer_name
      ].some((value) => String(value ?? "").toLowerCase().includes(query));
      const matchesStatus = assignmentFilters.status === "all" || normalizeShipmentStatus(shipment.status) === assignmentFilters.status;
      const matchesUrgency = assignmentFilters.urgency === "all" || String(shipment.urgency ?? "standard").toLowerCase() === assignmentFilters.urgency;
      return matchesQuery && matchesStatus && matchesUrgency;
    });
  }, [activeShipments, assignmentFilters]);

  const filteredShipmentHistory = useMemo(() => {
    const query = historyFilters.query.trim().toLowerCase();
    return shipmentHistory.filter((shipment) => {
      const matchesQuery = !query || [
        shipment.tracking_id,
        shipment.package_type,
        shipment.pickup_address,
        shipment.delivery_address,
        shipment.customer_name
      ].some((value) => String(value ?? "").toLowerCase().includes(query));
      const matchesStatus = historyFilters.status === "all" || normalizeShipmentStatus(shipment.status) === historyFilters.status;
      return matchesQuery && matchesStatus;
    });
  }, [historyFilters, shipmentHistory]);

  const readinessItems = useMemo(
    () => [
      {
        label: "Driver profile",
        complete: Boolean(driver),
        detail: driver ? "Profile linked to this account." : "Waiting for operations to link your profile."
      },
      {
        label: "Admin approval",
        complete: driverApproved,
        detail: driverApproved ? "Approved for delivery operations." : `Current approval status: ${driver?.approval_status ?? "unlinked"}.`
      },
      {
        label: "Availability",
        complete: driverOnline,
        detail: driverOnline ? "Online for dispatch." : "Go online when you are ready for assignments."
      },
      {
        label: "Live location",
        complete: Boolean(driverLatitude && driverLongitude),
        detail: driverLatitude && driverLongitude ? "Location coordinates are available." : "Sync device location before pickup."
      },
      {
        label: "Assigned shipment",
        complete: activeShipments.length > 0,
        detail: activeShipments.length > 0 ? `${activeShipments.length} active delivery${activeShipments.length === 1 ? "" : "ies"}.` : "New assignments will appear here."
      }
    ],
    [activeShipments.length, driver, driverApproved, driverLatitude, driverLongitude, driverOnline]
  );

  async function updateAvailability(online: boolean) {
    setUpdatingKey("availability");
    setError(null);
    setMessage(null);
    try {
      const response = await authorizedFetch("/api/driver/operations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: online ? "available" : "offline" })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to update availability.");
      setOverview((current) => (current ? { ...current, driver: data } : current));
      showSuccess(online ? "You are online and available for dispatch." : "You are offline.");
    } catch (err) {
      showError("Unable to update availability", err, "Unable to update availability.");
    } finally {
      setUpdatingKey(null);
    }
  }

  async function syncLocation(next?: { latitude: string; longitude: string; status?: string }, options?: { silent?: boolean }) {
    if (!driver) return;
    const latitude = Number(next?.latitude ?? locationDraft.latitude);
    const longitude = Number(next?.longitude ?? locationDraft.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      setError("Latitude and longitude must be valid numbers.");
      flyError("Invalid location", "Latitude and longitude must be valid numbers.");
      return;
    }

    if (!options?.silent) setUpdatingKey("location");
    setError(null);
    if (!options?.silent) setMessage(null);
    try {
      const response = await authorizedFetch(`/api/drivers/${encodeURIComponent(String(driver.id))}/location`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ latitude, longitude, status: next?.status ?? (driverOnline ? "in_transit" : "available") })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to sync location.");
      setOverview((current) => (current ? { ...current, driver: data.driver } : current));
      if (!options?.silent) {
        showSuccess(`Location synced. ${data.updatedShipments?.length ?? 0} assigned shipment positions updated.`);
      }
    } catch (err) {
      showError("Unable to sync location", err, "Unable to sync location.");
    } finally {
      if (!options?.silent) setUpdatingKey(null);
    }
  }

  function useDeviceLocation() {
    if (!navigator.geolocation) {
      setError("Geolocation is not available in this browser.");
      flyError("Geolocation unavailable", "Geolocation is not available in this browser.");
      return;
    }

    setUpdatingKey("location");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const next = {
          latitude: position.coords.latitude.toFixed(6),
          longitude: position.coords.longitude.toFixed(6)
        };
        setLocationDraft(next);
        void syncLocation({ ...next, status: "in_transit" });
      },
      (locationError) => {
        setUpdatingKey(null);
        setError(locationError.message);
        flyError("Unable to read device location", locationError.message);
      },
      { enableHighAccuracy: true, maximumAge: 15000, timeout: 10000 }
    );
  }

  function stopLocationSharing() {
    if (locationWatchRef.current !== null && navigator.geolocation) {
      navigator.geolocation.clearWatch(locationWatchRef.current);
    }
    locationWatchRef.current = null;
    setSharingLocation(false);
    showSuccess("Live location sharing stopped.");
  }

  function startLocationSharing() {
    if (!navigator.geolocation) {
      setError("Geolocation is not available in this browser.");
      flyError("Geolocation unavailable", "Geolocation is not available in this browser.");
      return;
    }

    if (!driverApproved) {
      setError("Driver account must be approved before sharing live location.");
      flyError("Approval required", "Driver account must be approved before sharing live location.");
      return;
    }

    if (locationWatchRef.current !== null) return;

    setError(null);
    showSuccess("Live location sharing started. Keep this page open while delivering.");
    setSharingLocation(true);
    locationWatchRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const next = {
          latitude: position.coords.latitude.toFixed(6),
          longitude: position.coords.longitude.toFixed(6)
        };
        setLocationDraft(next);
        void syncLocation({ ...next, status: "in_transit" }, { silent: true });
      },
      (locationError) => {
        stopLocationSharing();
        setError(locationError.message);
        flyError("Live location stopped", locationError.message);
      },
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 }
    );
  }

  useEffect(() => {
    return () => {
      if (locationWatchRef.current !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(locationWatchRef.current);
      }
    };
  }, []);

  async function respondToAssignment(trackingId: string, action: "accept" | "reject") {
    setUpdatingKey(`${trackingId}:${action}`);
    setError(null);
    setMessage(null);
    try {
      const response = await authorizedFetch(`/api/driver/shipments/${encodeURIComponent(trackingId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, reason: rejectReasons[trackingId] ?? "" })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to update assignment.");
      setOverview((current) =>
        current
          ? {
              ...current,
              shipments: action === "reject"
                ? current.shipments.filter((shipment) => shipment.tracking_id !== trackingId)
                : current.shipments.map((shipment) => (shipment.tracking_id === trackingId ? data : shipment))
            }
          : current
      );
      showSuccess(action === "accept" ? `Accepted ${trackingId}.` : `Rejected ${trackingId}. Dispatch will reassign it.`);
    } catch (err) {
      showError("Unable to update assignment", err, "Unable to update assignment.");
    } finally {
      setUpdatingKey(null);
    }
  }

  async function updateShipment(trackingId: string, updates: Record<string, unknown>, success: string) {
    setUpdatingKey(trackingId);
    setError(null);
    setMessage(null);
    try {
      const response = await authorizedFetch(`/api/shipments/${encodeURIComponent(trackingId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates)
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to update shipment.");
      setOverview((current) =>
        current ? { ...current, shipments: current.shipments.map((shipment) => (shipment.tracking_id === trackingId ? data : shipment)) } : current
      );
      showSuccess(success);
    } catch (err) {
      showError("Unable to update shipment", err, "Unable to update shipment.");
    } finally {
      setUpdatingKey(null);
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
    if (!response.ok) throw new Error(data.error ?? "Unable to save proof of delivery.");
    setOverview((current) =>
      current ? { ...current, shipments: current.shipments.map((shipment) => (shipment.tracking_id === trackingId ? data : shipment)) } : current
    );
    showSuccess(`Proof saved and ${trackingId} marked delivered.`);
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

  function applyLiveLocationForProof(trackingId: string) {
    setProofDrafts((current) => ({
      ...current,
      [trackingId]: {
        ...(current[trackingId] ?? { deliveryOtp: "", recipientName: "", recipientSignatureUrl: "", proofLat: "", proofLng: "" }),
        proofLat: String(driverLatitude ?? locationDraft.latitude ?? ""),
        proofLng: String(driverLongitude ?? locationDraft.longitude ?? "")
      }
    }));
  }

  return (
    <RoleGate allowedRoles={["driver"]}>
      <main className="min-h-screen bg-background">
        <header className="sticky top-0 z-30 border-b bg-background/88 backdrop-blur-xl">
          <div className="mx-auto flex min-h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6">
            <Logo />
            <div className="flex items-center gap-2">
              <Button asChild variant="outline" size="sm" className="hidden sm:inline-flex">
                <Link href={"/map" as NextRoute}>
                  <MapPinned />
                  Live map
                </Link>
              </Button>
              <AccountControl />
              <ThemeToggle />
            </div>
          </div>
        </header>

        <section className="mx-auto grid max-w-7xl gap-5 px-4 py-5 sm:px-6 sm:py-8">
          <div className="grid gap-4 lg:grid-cols-[1fr_380px] lg:items-start">
            <div>
              <Badge className="border-primary/40 bg-primary/10 text-primary">Driver operations</Badge>
              <h1 className="mt-3 text-3xl font-black tracking-normal sm:text-4xl">Driver dashboard</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
                Manage assignments, location, and delivery updates.
              </p>
            </div>
            <Card className="glass">
              <CardContent className="flex items-center justify-between gap-3 p-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Availability</p>
                  <p className="mt-1 text-lg font-bold">{driverOnline ? "Online" : "Offline"}</p>
                </div>
                <div className="flex items-center gap-3">
                  {updatingKey === "availability" ? <Loader2 className="size-5 animate-spin text-primary" /> : driverOnline ? <Wifi className="size-5 text-emerald-500" /> : <WifiOff className="size-5 text-muted-foreground" />}
                  <Switch checked={driverOnline} disabled={!driverApproved || updatingKey === "availability"} onCheckedChange={(checked) => void updateAvailability(Boolean(checked))} />
                </div>
              </CardContent>
            </Card>
          </div>

          <nav className="flex gap-2 overflow-x-auto rounded-lg border bg-background/55 p-2">
            {driverNav.map((item) => (
              <Link
                key={item.href}
                href={item.href as NextRoute}
                onClick={() => setActiveSection(item.section)}
                className={`flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold transition ${
                  activeSection === item.section ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground"
                }`}
              >
                <item.icon className="size-4" />
                {item.label}
              </Link>
            ))}
          </nav>

          {message && (
            <div className="flex gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-500">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
              {message}
            </div>
          )}
          {error && (
            <div className="flex gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              {error}
            </div>
          )}

          {loading ? (
            <Card className="glass">
              <CardContent className="flex items-center gap-3 p-6 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin text-primary" />
                Loading assigned deliveries...
              </CardContent>
            </Card>
        ) : (
          <>
              <section id="driver-overview" className={`grid gap-4 scroll-mt-24 ${activeSection === "overview" ? "" : "hidden"}`}>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {[
                  { label: "Active deliveries", value: overview?.stats.activeDeliveries ?? 0, icon: Truck },
                  { label: "Completed", value: overview?.stats.completedDeliveries ?? 0, icon: PackageCheck },
                  { label: "Acceptance", value: `${overview?.stats.acceptanceRate ?? 100}%`, icon: CheckCircle2 },
                  { label: "Success rate", value: `${overview?.stats.deliverySuccessRate ?? 100}%`, icon: ShieldCheck },
                  { label: "Performance", value: `${overview?.stats.performanceScore ?? 95}%`, icon: Star },
                  { label: "Payout total", value: moneyFormatter.format(overview?.stats.payoutTotal ?? 0), icon: PackageCheck },
                  { label: "Avg delivery", value: overview?.stats.averageCompletionHours ? `${overview.stats.averageCompletionHours}h` : "Building", icon: Clock3 },
                  { label: "Online duration", value: formatDuration(overview?.stats.onlineDurationSeconds ?? 0), icon: Timer }
                ].map((item) => (
                  <Card key={item.label} className="glass">
                    <CardContent className="flex items-center justify-between gap-3 p-4">
                      <div>
                        <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{item.label}</p>
                        <p className="mt-2 font-mono text-2xl font-black">{item.value}</p>
                      </div>
                      <item.icon className="size-5 text-primary" />
                    </CardContent>
                  </Card>
                ))}
              </div>

              <Card className="glass">
                <CardContent className="grid gap-4 p-4 lg:grid-cols-[1.2fr_1fr_1fr]">
                  <div>
                    <div className="flex items-center gap-2">
                      <Star className="size-5 text-primary" />
                      <h3 className="font-semibold">Performance intelligence</h3>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      Current grade: <span className="font-semibold text-foreground">{overview?.stats.performanceGrade ?? "Excellent"}</span>
                    </p>
                  </div>
                  <div className="rounded-md border bg-background/45 p-3">
                    <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Route focus</p>
                    <p className="mt-2 font-semibold">{overview?.stats.routeFocus ?? "No active route"}</p>
                  </div>
                  <div className="rounded-md border bg-background/45 p-3">
                    <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">ETA discipline</p>
                    <p className="mt-2 font-semibold">{overview?.stats.averageEtaHours ? `${overview.stats.averageEtaHours}h average ETA` : "ETA data building"}</p>
                  </div>
                </CardContent>
              </Card>

              <Card className="glass">
                <CardContent className="grid gap-4 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-xl font-black">{driver?.name ?? "Driver profile pending"}</h2>
                        <Badge className={approvalBadgeClass(driver?.approval_status)}>{driver?.approval_status ?? "unlinked"}</Badge>
                        <Badge className={driverOnline ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-500" : "border-muted-foreground/30 bg-background/60 text-muted-foreground"}>
                          {driver?.status ?? "offline"}
                        </Badge>
                      </div>
                      <p className="mt-2 text-sm text-muted-foreground">
                        Last seen {formatDate(driver?.last_seen_at)}. Customer tracking updates from your live location.
                      </p>
                    </div>
                    <Button type="button" variant="outline" onClick={() => void loadOverview(true)} disabled={refreshing}>
                      <RefreshCw className={refreshing ? "animate-spin" : ""} />
                      Refresh
                    </Button>
                  </div>

                  {!driver && (
                    <div className="rounded-md border border-primary/30 bg-primary/10 p-4 text-sm text-muted-foreground">
                      {overview?.message ?? "Your driver profile is waiting for operations to link it."}
                    </div>
                  )}
                  {driver && !driverApproved && (
                    <div className="flex gap-2 rounded-md border border-primary/30 bg-primary/10 p-4 text-sm text-muted-foreground">
                      <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
                      Your driver profile is {driver.approval_status}. Operations must approve it before you can update location or delivery status.
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="glass">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2">
                    <ShieldCheck className="size-5 text-primary" />
                    Rider readiness
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                  {readinessItems.map((item) => (
                    <div key={item.label} className="rounded-md border bg-background/45 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold">{item.label}</p>
                        {item.complete ? <CheckCircle2 className="size-4 text-emerald-500" /> : <Clock3 className="size-4 text-primary" />}
                      </div>
                      <p className="mt-2 text-xs leading-5 text-muted-foreground">{item.detail}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>
              </section>

              <section id="driver-kyc" className={`scroll-mt-24 ${activeSection === "kyc" ? "" : "hidden"}`}>
                <DriverKycPanel />
              </section>

              <Card id="driver-location" className={`glass scroll-mt-24 ${activeSection === "location" ? "" : "hidden"}`}>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2">
                    <LocateFixed className="size-5 text-primary" />
                    Live location
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4">
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_auto]">
                    <div className="grid gap-2">
                      <Label htmlFor="driverLiveLatitude">Latitude</Label>
                      <Input id="driverLiveLatitude" inputMode="decimal" value={locationDraft.latitude} onChange={(event) => setLocationDraft((current) => ({ ...current, latitude: event.target.value }))} />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="driverLiveLongitude">Longitude</Label>
                      <Input id="driverLiveLongitude" inputMode="decimal" value={locationDraft.longitude} onChange={(event) => setLocationDraft((current) => ({ ...current, longitude: event.target.value }))} />
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2 lg:flex lg:items-end">
                      <Button type="button" onClick={() => void syncLocation()} disabled={!driverApproved || updatingKey === "location"} className="w-full">
                        {updatingKey === "location" ? <Loader2 className="animate-spin" /> : <LocateFixed />}
                        Sync
                      </Button>
                      <Button type="button" variant="outline" onClick={useDeviceLocation} disabled={!driverApproved || updatingKey === "location"} className="w-full">
                        <Wifi />
                        Device
                      </Button>
                    </div>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Button type="button" variant={sharingLocation ? "outline" : "default"} onClick={startLocationSharing} disabled={!driverApproved || sharingLocation}>
                      <Wifi />
                      Start live sharing
                    </Button>
                    <Button type="button" variant="outline" onClick={stopLocationSharing} disabled={!sharingLocation}>
                      <WifiOff />
                      Stop sharing
                    </Button>
                  </div>
                  <p className="text-xs leading-5 text-muted-foreground">Location sharing updates active shipment tracking.</p>
                </CardContent>
              </Card>

              <section id="driver-assignments" className={`grid gap-4 scroll-mt-24 ${activeSection === "assignments" ? "" : "hidden"}`}>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <h2 className="text-2xl font-black tracking-normal">Assigned shipments</h2>
                  </div>
                  <Badge>{filteredActiveShipments.length} shown / {activeShipments.length} active</Badge>
                </div>
                <div className="grid gap-3 rounded-md border bg-background/35 p-3 md:grid-cols-3">
                  <div className="grid gap-1">
                    <Label htmlFor="driverAssignmentSearch">Search</Label>
                    <Input
                      id="driverAssignmentSearch"
                      value={assignmentFilters.query}
                      onChange={(event) => setAssignmentFilters((current) => ({ ...current, query: event.target.value }))}
                      placeholder="Tracking, route, package"
                    />
                  </div>
                  <div className="grid gap-1">
                    <Label htmlFor="driverAssignmentStatus">Status</Label>
                    <select
                      id="driverAssignmentStatus"
                      value={assignmentFilters.status}
                      onChange={(event) => setAssignmentFilters((current) => ({ ...current, status: event.target.value }))}
                      className="h-10 rounded-md border bg-background/70 px-3 text-sm"
                    >
                      {["all", "PENDING", "CONFIRMED", "DRIVER_ASSIGNED", "PICKED_UP", "IN_TRANSIT", "ARRIVED"].map((status) => (
                        <option key={status} value={status}>{status === "all" ? "All active statuses" : shipmentStatusLabel(status)}</option>
                      ))}
                    </select>
                  </div>
                  <div className="grid gap-1">
                    <Label htmlFor="driverAssignmentUrgency">Urgency</Label>
                    <select
                      id="driverAssignmentUrgency"
                      value={assignmentFilters.urgency}
                      onChange={(event) => setAssignmentFilters((current) => ({ ...current, urgency: event.target.value }))}
                      className="h-10 rounded-md border bg-background/70 px-3 text-sm"
                    >
                      {["all", "standard", "express", "same_day", "urgent"].map((urgency) => (
                        <option key={urgency} value={urgency}>{urgency === "all" ? "All urgency" : urgency.replaceAll("_", " ")}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {activeShipments.length === 0 && (
                  <Card className="glass">
                    <CardContent className="grid place-items-center gap-3 p-8 text-center text-sm text-muted-foreground">
                      <Truck className="size-8 text-primary" />
                      No active assigned shipments yet.
                    </CardContent>
                  </Card>
                )}
                {activeShipments.length > 0 && filteredActiveShipments.length === 0 && (
                  <Card className="glass">
                    <CardContent className="grid place-items-center gap-3 p-8 text-center text-sm text-muted-foreground">
                      <Truck className="size-8 text-primary" />
                      No assigned shipments match these filters.
                    </CardContent>
                  </Card>
                )}

                {filteredActiveShipments.map((shipment) => {
                  const normalizedStatus = normalizeShipmentStatus(shipment.status);
                  const canRespond = ["PENDING", "CONFIRMED", "DRIVER_ASSIGNED"].includes(normalizedStatus);
                  return (
                    <Card key={shipment.tracking_id} className="glass overflow-hidden">
                      <CardContent className="grid gap-4 p-4 sm:p-5">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="font-mono text-lg font-black">{shipment.tracking_id}</h3>
                              <Badge className={statusBadgeClass(shipment.status)}>{shipmentStatusLabel(shipment.status)}</Badge>
                              <Badge>{shipment.urgency ?? "standard"}</Badge>
                            </div>
                            <p className="mt-2 text-sm text-muted-foreground">{shipment.package_type}</p>
                          </div>
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Clock3 className="size-4 text-primary" />
                            ETA {shipment.eta ?? "pending"}
                          </div>
                          <div className="rounded-md border border-primary/25 bg-primary/5 px-3 py-2 text-sm">
                            <span className="block text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Your payout</span>
                            <span className="mt-1 block font-semibold text-foreground">
                              {Number(shipment.driver_payout_amount ?? 0) > 0 ? moneyFormatter.format(Number(shipment.driver_payout_amount)) : "Pending admin payout"}
                            </span>
                            <span className="mt-1 block text-xs text-muted-foreground">{shipment.driver_payout_status ?? "UNPAID"}</span>
                          </div>
                        </div>

                        <div className="grid gap-3 md:grid-cols-2">
                          <div className="rounded-md border bg-background/45 p-3">
                            <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Pickup</p>
                            <p className="mt-2 text-sm">{shipment.pickup_address}</p>
                          </div>
                          <div className="rounded-md border bg-background/45 p-3">
                            <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Delivery</p>
                            <p className="mt-2 text-sm">{shipment.delivery_address}</p>
                          </div>
                        </div>

                        {shipment.customer_phone && (
                          <div className="grid gap-2 rounded-md border bg-background/45 p-3 sm:grid-cols-2 lg:flex">
                            <Button asChild type="button" variant="outline" className="w-full lg:w-auto">
                              <a href={`tel:${shipment.customer_phone}`}>
                                <Phone />
                                Call customer
                              </a>
                            </Button>
                            <Button asChild type="button" variant="outline" className="w-full lg:w-auto">
                              <a
                                href={buildWhatsAppUrl({
                                  phone: shipment.customer_phone,
                                  message: driverCustomerMessage(shipment, driver?.name)
                                })}
                                target="_blank"
                                rel="noreferrer"
                              >
                                <MessageCircle />
                                WhatsApp customer
                              </a>
                            </Button>
                          </div>
                        )}

                        {canRespond && (
                          <div className="grid gap-3 rounded-md border border-primary/25 bg-primary/5 p-3 lg:grid-cols-[1fr_auto]">
                            <Input
                              value={rejectReasons[shipment.tracking_id] ?? ""}
                              onChange={(event) => setRejectReasons((current) => ({ ...current, [shipment.tracking_id]: event.target.value }))}
                              placeholder="Optional rejection reason for dispatch"
                            />
                            <div className="grid gap-2 sm:grid-cols-2">
                              <Button type="button" onClick={() => void respondToAssignment(shipment.tracking_id, "accept")} disabled={!driverApproved || updatingKey === `${shipment.tracking_id}:accept`}>
                                {updatingKey === `${shipment.tracking_id}:accept` ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
                                Accept
                              </Button>
                              <Button type="button" variant="outline" onClick={() => void respondToAssignment(shipment.tracking_id, "reject")} disabled={!driverApproved || updatingKey === `${shipment.tracking_id}:reject`}>
                                {updatingKey === `${shipment.tracking_id}:reject` ? <Loader2 className="animate-spin" /> : <PackageX />}
                                Reject
                              </Button>
                            </div>
                          </div>
                        )}

                        <div className="grid gap-2 sm:grid-cols-3">
                          {statusSteps.map((step) => (
                            <Button
                              key={step.status}
                              type="button"
                              variant={normalizedStatus === step.status ? "default" : "outline"}
                              disabled={!driverApproved || updatingKey === shipment.tracking_id || normalizedStatus === "DELIVERED"}
                              onClick={() => void updateShipment(shipment.tracking_id, { status: step.status }, `${shipment.tracking_id} marked ${step.label.toLowerCase()}.`)}
                              className="w-full"
                            >
                              {updatingKey === shipment.tracking_id ? <Loader2 className="animate-spin" /> : <step.icon />}
                              {step.label}
                            </Button>
                          ))}
                        </div>

                        <div className="grid gap-3">
                          <div className="grid gap-2">
                            <Label htmlFor={`eta-${shipment.tracking_id}`}>ETA update</Label>
                            <Input
                              id={`eta-${shipment.tracking_id}`}
                              value={etaDrafts[shipment.tracking_id] ?? ""}
                              onChange={(event) => setEtaDrafts((current) => ({ ...current, [shipment.tracking_id]: event.target.value }))}
                              placeholder="Example: 45 minutes"
                            />
                          </div>
                          <div className="grid gap-2 sm:grid-cols-2">
                            <Button
                              type="button"
                              variant="outline"
                              disabled={!driverApproved || updatingKey === shipment.tracking_id}
                              onClick={() => void updateShipment(shipment.tracking_id, { eta: etaDrafts[shipment.tracking_id] ?? "" }, `ETA updated for ${shipment.tracking_id}.`)}
                              className="w-full"
                            >
                              <Timer />
                              Save ETA
                            </Button>
                          </div>
                        </div>

                        <div className="grid gap-3 rounded-md border border-primary/20 bg-primary/5 p-3">
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                            <div>
                              <p className="font-semibold">Proof of delivery</p>
                              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                                Capture recipient, OTP, signature, location, and photo before completion.
                              </p>
                            </div>
                            {shipment.proof_image_url && <Badge className="border-emerald-500/40 bg-emerald-500/10 text-emerald-500">Proof uploaded</Badge>}
                          </div>
                          {shipment.proof_image_url && (
                            <a href={optimizedCloudinaryImageUrl(shipment.proof_image_url, 1200)} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-md border bg-background/60">
                              <Image
                                src={optimizedCloudinaryImageUrl(shipment.proof_image_url, 720)}
                                alt={`Proof of delivery for ${shipment.tracking_id}`}
                                width={720}
                                height={420}
                                className="max-h-64 w-full object-cover"
                                loading="lazy"
                                sizes="(min-width: 1024px) 720px, 100vw"
                              />
                            </a>
                          )}
                          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                            <div className="grid gap-2">
                              <Label htmlFor={`recipient-${shipment.tracking_id}`}>Recipient name</Label>
                              <Input
                                id={`recipient-${shipment.tracking_id}`}
                                value={proofDrafts[shipment.tracking_id]?.recipientName ?? ""}
                                onChange={(event) => updateProofDraft(shipment.tracking_id, "recipientName", event.target.value)}
                                placeholder="Receiver name"
                              />
                            </div>
                            <div className="grid gap-2">
                              <Label htmlFor={`otp-${shipment.tracking_id}`}>Delivery OTP</Label>
                              <Input
                                id={`otp-${shipment.tracking_id}`}
                                value={proofDrafts[shipment.tracking_id]?.deliveryOtp ?? ""}
                                onChange={(event) => updateProofDraft(shipment.tracking_id, "deliveryOtp", event.target.value)}
                                placeholder="Optional OTP"
                              />
                            </div>
                            <div className="grid gap-2">
                              <Label htmlFor={`proof-lat-${shipment.tracking_id}`}>Proof latitude</Label>
                              <Input
                                id={`proof-lat-${shipment.tracking_id}`}
                                inputMode="decimal"
                                value={proofDrafts[shipment.tracking_id]?.proofLat ?? ""}
                                onChange={(event) => updateProofDraft(shipment.tracking_id, "proofLat", event.target.value)}
                              />
                            </div>
                            <div className="grid gap-2">
                              <Label htmlFor={`proof-lng-${shipment.tracking_id}`}>Proof longitude</Label>
                              <Input
                                id={`proof-lng-${shipment.tracking_id}`}
                                inputMode="decimal"
                                value={proofDrafts[shipment.tracking_id]?.proofLng ?? ""}
                                onChange={(event) => updateProofDraft(shipment.tracking_id, "proofLng", event.target.value)}
                              />
                            </div>
                          </div>
                          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                            <Button type="button" variant="outline" onClick={() => applyLiveLocationForProof(shipment.tracking_id)}>
                              <LocateFixed />
                              Use live location
                            </Button>
                            <CloudinaryUpload
                              folder="fly-logistics/proof-of-delivery/signatures"
                              label={proofDrafts[shipment.tracking_id]?.recipientSignatureUrl ? "Replace signature" : "Upload signature"}
                              onUploaded={(asset) => updateProofDraft(shipment.tracking_id, "recipientSignatureUrl", asset.secureUrl)}
                            />
                            <CloudinaryUpload
                              folder="fly-logistics/proof-of-delivery"
                              label={shipment.proof_image_url ? "Replace proof" : "Upload proof and mark delivered"}
                              onUploaded={(asset) => saveProof(shipment.tracking_id, asset)}
                            />
                          </div>
                          {proofDrafts[shipment.tracking_id]?.recipientSignatureUrl && (
                            <p className="text-xs text-emerald-500">Recipient signature uploaded and ready for final proof save.</p>
                          )}
                        </div>

                        <div className="rounded-md border bg-background/45 p-3">
                          <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
                            <Route className="size-4 text-primary" />
                            Timeline
                          </div>
                          <div className="grid gap-2">
                            {sortShipmentTimelineLatestFirst(shipment.timeline?.length ? shipment.timeline : [{ label: "Shipment created", location: shipment.pickup_address, completed: true }]).map((event, index) => (
                              <div key={`${shipment.tracking_id}-${event.label}-${index}`} className="flex items-start justify-between gap-3 rounded-md border bg-background/50 p-2 text-xs">
                                <span>
                                  <span className="block font-semibold">{event.label}</span>
                                  <span className="text-muted-foreground">{event.location ?? "Network event"}</span>
                                </span>
                                <Badge className={event.completed ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-500" : "border-primary/40 bg-primary/10 text-primary"}>
                                  {event.completed ? "Done" : "Open"}
                                </Badge>
                              </div>
                            ))}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </section>

              <Card id="driver-history" className={`glass scroll-mt-24 ${activeSection === "history" ? "" : "hidden"}`}>
                <CardHeader>
                  <CardTitle>Shipment history</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-3">
                  <div className="grid gap-3 rounded-md border bg-background/35 p-3 md:grid-cols-2">
                    <div className="grid gap-1">
                      <Label htmlFor="driverHistorySearch">Search history</Label>
                      <Input
                        id="driverHistorySearch"
                        value={historyFilters.query}
                        onChange={(event) => setHistoryFilters((current) => ({ ...current, query: event.target.value }))}
                        placeholder="Tracking, route, package"
                      />
                    </div>
                    <div className="grid gap-1">
                      <Label htmlFor="driverHistoryStatus">Status</Label>
                      <select
                        id="driverHistoryStatus"
                        value={historyFilters.status}
                        onChange={(event) => setHistoryFilters((current) => ({ ...current, status: event.target.value }))}
                        className="h-10 rounded-md border bg-background/70 px-3 text-sm"
                      >
                        {["all", "DELIVERED", "CANCELLED", "FAILED", "EXCEPTION"].map((status) => (
                          <option key={status} value={status}>{status === "all" ? "All closed statuses" : shipmentStatusLabel(status)}</option>
                        ))}
                      </select>
                    </div>
                    <p className="text-xs text-muted-foreground md:col-span-2">Showing {filteredShipmentHistory.length} of {shipmentHistory.length} historical shipments.</p>
                  </div>
                  {shipmentHistory.length === 0 && <p className="text-sm text-muted-foreground">Completed and cancelled shipments will appear here.</p>}
                  {shipmentHistory.length > 0 && filteredShipmentHistory.length === 0 && <p className="text-sm text-muted-foreground">No shipment history matches these filters.</p>}
                  {filteredShipmentHistory.map((shipment) => (
                    <div key={shipment.tracking_id} className="flex flex-col gap-2 rounded-md border bg-background/45 p-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="font-mono font-bold">{shipment.tracking_id}</p>
                        <p className="mt-1 text-sm text-muted-foreground">{shipment.delivery_address}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Payout: {Number(shipment.driver_payout_amount ?? 0) > 0 ? moneyFormatter.format(Number(shipment.driver_payout_amount)) : "Pending"} ({shipment.driver_payout_status ?? "UNPAID"})
                        </p>
                      </div>
                      <Badge className={statusBadgeClass(shipment.status)}>{shipmentStatusLabel(shipment.status)}</Badge>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <section id="driver-security" className={`scroll-mt-24 ${activeSection === "security" ? "" : "hidden"}`}>
                <AccountPasswordPanel
                  title="Rider account security"
                  description="Change your signed-in rider password securely. Your phone number still remains the admin-managed fallback for rider access."
                  successTitle="Rider password updated"
                  successDescription="Use your new password or admin-managed phone password the next time you sign in."
                />
              </section>
              <section id="driver-support" className={`scroll-mt-24 ${activeSection === "support" ? "" : "hidden"}`}>
                <AccountSupportCenter accountLabel="driver" portal="driver" />
              </section>
            </>
          )}
        </section>
      </main>
    </RoleGate>
  );
}
