"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  AlertTriangle,
  Bike,
  Bus,
  Car,
  Clock3,
  Loader2,
  MapPin,
  MessageCircle,
  Navigation,
  PackageCheck,
  Route,
  Search,
  ShieldCheck,
  Truck
} from "lucide-react";
import { getWhatsAppUrl, whatsappMessages } from "@/lib/contact";
import { normalizeTransportationType, transportationTypeLabel } from "@/lib/driver-data";
import { getSupabaseBrowser } from "@/lib/supabase";
import { trackConversion } from "@/lib/analytics";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { inferStateCodeFromAddress, isInternationalDelivery, isNigeriaCountry, normalizeStateCode } from "@/lib/pricing";

type TrackingResult = {
  trackingId: string;
  status: string;
  eta: string;
  confidence: number;
  etaConfidence?: number | string | null;
  etaHours?: number | string | null;
  routeDistanceKm?: number | string | null;
  trafficAssumption?: string | null;
  vehicleType?: string | null;
  pickupAddress: string;
  deliveryAddress: string;
  pickupState?: string | null;
  destinationState?: string | null;
  deliveryCategory?: string | null;
  shipmentType?: string | null;
  pickupCountry?: string | null;
  destinationCountry?: string | null;
  customsInformation?: string | null;
  packageValue?: number | string | null;
  dutiesTaxesAmount?: number | string | null;
  exportImportDocuments?: string | null;
  packageType: string;
  urgency: string;
  customerName?: string | null;
  recipientName?: string | null;
  customerStatusMessage?: string | null;
  packageImageUrl?: string | null;
  assignedDriver: {
    id: string | number;
    name: string;
    status?: string | null;
    photoUrl?: string | null;
    vehicleType?: string | null;
    isOnline?: boolean | null;
    lastLocationAt?: string | null;
  } | null;
  vehicle: { id: string; lat: number | null; lng: number | null; speedKph: number; type?: string | null };
  events: { label: string; location?: string; completed: boolean; occurred_at?: string }[];
  operationsChecklist?: { key: string; label: string; complete: boolean; detail: string }[];
};

const trackingHighlights = [
  { icon: PackageCheck, title: "Shipment progress", text: "Pickup, delivery stage, and Fly Logistics updates." },
  { icon: Truck, title: "Operations monitoring", text: "Delivery progress is monitored by Fly Logistics." },
  { icon: ShieldCheck, title: "Secure completion", text: "Delivery completion is verified privately by operations." }
] as const;

function formatStatus(status: string) {
  return status.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDate(value?: string) {
  if (!value) return null;
  return new Date(value).toLocaleString();
}

function routeMode(result: TrackingResult) {
  const category = String(result.deliveryCategory ?? "").toLowerCase();
  if (category.includes("international") || category.includes("import") || category.includes("export")) return "International lane";

  const pickupCountry = String(result.pickupCountry ?? "").trim();
  const destinationCountry = String(result.destinationCountry ?? "").trim();
  if ((pickupCountry || destinationCountry) && (!isNigeriaCountry(pickupCountry) || !isNigeriaCountry(destinationCountry))) {
    return "International lane";
  }

  const pickupState = normalizeStateCode(result.pickupState) ?? inferStateCodeFromAddress(result.pickupAddress);
  const destinationState = normalizeStateCode(result.destinationState) ?? inferStateCodeFromAddress(result.deliveryAddress);
  if (pickupState && destinationState) return pickupState === destinationState ? "Local delivery lane" : "Interstate lane";

  if (isInternationalDelivery({
    shipmentType: result.shipmentType,
    deliveryCategory: result.deliveryCategory,
    pickupCountry: result.pickupCountry,
    destinationCountry: result.destinationCountry
  })) return "International lane";
  return "Fly Logistics delivery lane";
}

function confidenceCopy(result: TrackingResult) {
  const confidence = Number(result.etaConfidence ?? result.confidence ?? 0);
  if (!Number.isFinite(confidence) || confidence <= 0) return "Route confidence is being calculated.";
  if (confidence >= 90) return "High confidence ETA based on the latest movement signals.";
  if (confidence >= 70) return "Steady ETA with operations monitoring the route.";
  return "ETA is under closer operations review.";
}

function vehicleIconFor(value: unknown) {
  const normalized = normalizeTransportationType(value);
  if (normalized === "bus") return Bus;
  if (normalized === "car" || normalized === "van" || normalized === "tricycle") return Car;
  if (normalized === "truck" || normalized === "lorry") return Truck;
  return Bike;
}

type TrackingLookupProps = {
  initialTrackingId?: string;
};

export function TrackingLookup({ initialTrackingId = "" }: TrackingLookupProps) {
  const normalizedInitialTrackingId = initialTrackingId.trim().toUpperCase();
  const [trackingId, setTrackingId] = useState(normalizedInitialTrackingId);
  const [result, setResult] = useState<TrackingResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lookupShipment = useCallback(async (id: string, options?: { silent?: boolean }) => {
    const normalizedId = id.trim().toUpperCase();
    if (!normalizedId) return;

    setTrackingId(normalizedId);
    if (!options?.silent) setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/shipments/track/${encodeURIComponent(normalizedId)}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Tracking lookup failed.");
      setResult(data);
      if (!options?.silent) {
        trackConversion("tracking_lookup", {
          tracking_id: normalizedId,
          status: data.status ?? null,
          has_driver: Boolean(data.assignedDriver)
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Tracking lookup failed.");
      if (!options?.silent) setResult(null);
    } finally {
      if (!options?.silent) setLoading(false);
    }
  }, []);

  async function trackShipment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await lookupShipment(trackingId);
  }

  useEffect(() => {
    if (normalizedInitialTrackingId) void lookupShipment(normalizedInitialTrackingId);
  }, [lookupShipment, normalizedInitialTrackingId]);

  useEffect(() => {
    if (!result?.trackingId) return;
    const supabase = getSupabaseBrowser();
    if (!supabase) return;

    const channel = supabase
      .channel(`tracking-live-${result.trackingId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "shipments", filter: `tracking_id=eq.${result.trackingId}` }, () => {
        void lookupShipment(result.trackingId, { silent: true });
      });

    if (result.assignedDriver?.id) {
      channel.on("postgres_changes", { event: "*", schema: "public", table: "drivers", filter: `id=eq.${result.assignedDriver.id}` }, () => {
        void lookupShipment(result.trackingId, { silent: true });
      });
    }

    channel.subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [lookupShipment, result?.assignedDriver?.id, result?.trackingId]);

  useEffect(() => {
    if (!result?.trackingId) return;

    const interval = window.setInterval(() => {
      void lookupShipment(result.trackingId, { silent: true });
    }, 20000);

    return () => window.clearInterval(interval);
  }, [lookupShipment, result?.trackingId]);

  const truckPosition = useMemo(() => {
    if (!result || typeof result.vehicle.lat !== "number" || typeof result.vehicle.lng !== "number") {
      return { left: "58%", top: "43%" };
    }
    const latOffset = Math.abs(result.vehicle.lat * 13) % 46;
    const lngOffset = Math.abs(result.vehicle.lng * 17) % 48;
    return {
      left: `${24 + lngOffset}%`,
      top: `${22 + latOffset}%`
    };
  }, [result]);

  const isInternationalResult = result
    ? isInternationalDelivery({
        shipmentType: result.shipmentType,
        deliveryCategory: result.deliveryCategory,
        pickupCountry: result.pickupCountry,
        destinationCountry: result.destinationCountry
      })
    : false;
  const visibleVehicleType = result?.assignedDriver?.vehicleType ?? result?.vehicle.type ?? result?.vehicleType ?? "bike";
  const visibleVehicleLabel = transportationTypeLabel(visibleVehicleType);
  const VehicleMarkerIcon = vehicleIconFor(visibleVehicleType);
  const isMoving = Boolean(result && !["DELIVERED", "CANCELLED"].includes(String(result.status).toUpperCase()) && Number(result.vehicle.speedKph) > 0);

  const visibleStatus = result ? formatStatus(result.status) : "Awaiting lookup";
  const supportMessage = result
    ? whatsappMessages.trackingStatus({
        trackingId: result.trackingId,
        status: result.status,
        eta: result.eta,
        pickupAddress: result.pickupAddress,
        deliveryAddress: result.deliveryAddress,
        assignedDriver: result.assignedDriver
      })
    : whatsappMessages.trackingHelp(trackingId);

  return (
    <div className="grid gap-6 lg:grid-cols-[0.78fr_1.22fr] lg:gap-8">
      <div className="grid content-start gap-6">
        <div>
          <Badge className="border-primary/40 bg-primary/10 text-primary">Customer tracking</Badge>
          <h1 className="mt-5 text-4xl font-black tracking-normal text-balance sm:text-5xl">Track your shipment from pickup to delivery.</h1>
          <p className="mt-4 text-muted-foreground">
            Enter your Fly Logistics tracking ID to see the shipment status, delivery route, timeline, assigned driver, and ETA.
          </p>
        </div>

        <Card className="glass">
          <CardContent className="p-4 sm:p-5">
            <form className="grid gap-3" onSubmit={trackShipment}>
              <div className="flex flex-col gap-3 sm:flex-row">
                <Input
                  value={trackingId}
                  onChange={(event) => setTrackingId(event.target.value.toUpperCase())}
                  placeholder="FLY-2026-88912"
                  aria-label="Tracking ID"
                  className="font-mono"
                />
                <Button disabled={loading || !trackingId.trim()}>
                  {loading ? <Loader2 className="animate-spin" /> : <Search />}
                  Track
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button asChild variant="outline" size="sm">
                  <Link href="/customer/register">
                    Book shipment
                  </Link>
                </Button>
                <Button asChild variant="outline" size="sm">
                  <a href={getWhatsAppUrl(supportMessage)} target="_blank" rel="noreferrer">
                    <MessageCircle />
                    Chat on WhatsApp
                  </a>
                </Button>
              </div>
            </form>

            {error && (
              <div className="mt-4 flex gap-3 rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
                <AlertTriangle className="size-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-1">
          {trackingHighlights.map((item) => (
            <div key={item.title} className="rounded-md border bg-background/45 p-4 text-sm">
              <item.icon className="size-5 text-primary" />
              <div className="mt-3 font-semibold">{item.title}</div>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">{item.text}</p>
            </div>
          ))}
        </div>
      </div>

      <Card className="glass overflow-hidden">
        <div className="relative h-64 bg-black sm:h-80">
          <div className="absolute inset-0 grid-field opacity-60" />
          <div className="orange-line absolute left-8 right-8 top-1/2 h-px" />
          <VehicleMarkerIcon
            className={`absolute size-10 text-primary transition-all duration-700 ease-out ${isMoving ? "fly-tracking-vehicle-moving" : ""}`}
            style={truckPosition}
          />
          <MapPin className="absolute left-[18%] top-[56%] size-8 text-white" />
          <Navigation className="absolute right-[18%] top-[30%] size-8 text-white" />
          <div className="absolute bottom-4 left-4 right-4 rounded-md border border-white/15 bg-black/70 px-4 py-3 text-xs text-white backdrop-blur">
            {result ? (
              <span className="font-mono">
                {typeof result.vehicle.lat === "number" && typeof result.vehicle.lng === "number"
                  ? `${result.vehicle.lat.toFixed(4)}, ${result.vehicle.lng.toFixed(4)} - ${isMoving ? `${result.vehicle.speedKph} kph` : "stopped"}`
                  : "Live location details are private"}
              </span>
            ) : (
              <span>Live position appears after lookup</span>
            )}
          </div>
        </div>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle>{result ? result.trackingId : "Enter tracking ID for live status"}</CardTitle>
              <p className="mt-2 text-sm text-muted-foreground">
                {result ? `${result.customerName ?? "Sender"} to ${result.recipientName ?? "recipient"}` : "Customer tracking shows real Fly Logistics shipment updates."}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge className="w-fit border-primary/40 bg-primary/10 text-primary">{visibleStatus}</Badge>
              {result && <Badge className="w-fit border-emerald-500/40 bg-emerald-500/10 text-emerald-500">Live updates on</Badge>}
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid gap-5">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["ETA", result?.eta ?? "Pending"],
              ["Confidence", `${result?.confidence ?? 0}%`],
              ["Package", result?.packageType ?? "Awaiting lookup"],
              ["Transportation", result ? visibleVehicleLabel : "Awaiting assignment"]
            ].map(([label, value]) => (
              <div key={label} className="rounded-md border bg-background/40 p-3 text-sm">
                <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{label}</div>
                <div className="mt-2 font-semibold">{value}</div>
              </div>
            ))}
          </div>

          <Progress value={result?.confidence ?? 0} />

          {result && (
            <div className="grid gap-3 rounded-md border border-primary/20 bg-primary/5 p-4 sm:grid-cols-3">
              <div className="sm:col-span-3">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Route className="size-4 text-primary" />
                  Route intelligence
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  Fly Logistics keeps this shipment on a branded tracking lane from pickup to delivery.
                </p>
              </div>
              <span className="rounded-md border bg-background/45 p-3">
                <span className="block text-xs uppercase tracking-[0.18em] text-muted-foreground">Lane</span>
                <span className="mt-2 block font-semibold">{routeMode(result)}</span>
              </span>
              <span className="rounded-md border bg-background/45 p-3">
                <span className="block text-xs uppercase tracking-[0.18em] text-muted-foreground">Distance</span>
                <span className="mt-2 block font-semibold">
                  {result.routeDistanceKm ? `${Number(result.routeDistanceKm).toLocaleString()} km` : "Calculated by operations"}
                </span>
              </span>
              <span className="rounded-md border bg-background/45 p-3">
                <span className="block text-xs uppercase tracking-[0.18em] text-muted-foreground">ETA signal</span>
                <span className="mt-2 block font-semibold">{confidenceCopy(result)}</span>
              </span>
            </div>
          )}

          {result?.customerStatusMessage && (
            <div className="rounded-md border border-primary/25 bg-primary/10 p-4 text-sm">
              <div className="font-semibold text-foreground">Fly Logistics update</div>
              <p className="mt-1 leading-6 text-muted-foreground">{result.customerStatusMessage}</p>
            </div>
          )}

          {result && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-md border bg-background/40 p-3 text-sm">
                <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Sender</div>
                <div className="mt-2 font-medium">{result.customerName ?? "Sender details protected"}</div>
                <p className="mt-1 text-xs text-muted-foreground">Pickup contact and address are private.</p>
              </div>
              <div className="rounded-md border bg-background/40 p-3 text-sm">
                <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Delivery</div>
                <div className="mt-2 font-medium">{result.deliveryAddress}</div>
              </div>
            </div>
          )}

          {result && isInternationalResult && (
            <div className="grid gap-3 rounded-md border border-primary/25 bg-primary/10 p-4 text-sm sm:grid-cols-2">
              <div className="sm:col-span-2">
                <div className="font-semibold text-foreground">International shipment</div>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Import/export checks are handled by Fly Logistics operations. Private documents are not shown on public tracking.
                </p>
              </div>
              <span className="rounded-md border bg-background/45 p-3">
                <span className="block text-xs uppercase tracking-[0.16em] text-muted-foreground">Origin</span>
                <span className="mt-1 block font-medium">{result.pickupCountry ?? "Pending"}</span>
              </span>
              <span className="rounded-md border bg-background/45 p-3">
                <span className="block text-xs uppercase tracking-[0.16em] text-muted-foreground">Destination</span>
                <span className="mt-1 block font-medium">{result.destinationCountry ?? "Pending"}</span>
              </span>
              <span className="rounded-md border bg-background/45 p-3">
                <span className="block text-xs uppercase tracking-[0.16em] text-muted-foreground">Declared value</span>
                <span className="mt-1 block font-medium">{result.packageValue ? `NGN ${Number(result.packageValue).toLocaleString()}` : "Under review"}</span>
              </span>
              <span className="rounded-md border bg-background/45 p-3">
                <span className="block text-xs uppercase tracking-[0.16em] text-muted-foreground">Customs</span>
                <span className="mt-1 block font-medium">{result.customsInformation ? "Details received" : "Pending review"}</span>
              </span>
            </div>
          )}

          {result?.assignedDriver ? (
            <div className="flex flex-col gap-3 rounded-md border bg-background/40 p-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <div className="relative size-14 overflow-hidden rounded-md border bg-black">
                  {result.assignedDriver.photoUrl ? (
                    <Image src={result.assignedDriver.photoUrl} alt={`${result.assignedDriver.name} driver photo`} width={112} height={112} className="h-full w-full object-cover" />
                  ) : (
                    <VehicleMarkerIcon className="m-4 size-6 text-primary" />
                  )}
                </div>
                <div>
                  <div className="font-semibold">{result.assignedDriver.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {result.assignedDriver.status ?? "Assigned rider"}
                    {result.assignedDriver.isOnline ? " - live" : ""}
                  </div>
                  <div className="mt-1 text-xs font-semibold uppercase tracking-[0.16em] text-primary">{visibleVehicleLabel}</div>
                </div>
              </div>
            </div>
          ) : result ? (
            <div className="rounded-md border bg-background/40 p-3 text-sm text-muted-foreground">A driver has not been assigned yet.</div>
          ) : null}

          {result && (
            <div className="grid gap-3">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold">Shipment timeline</h2>
                <Badge>{result.events.length} events</Badge>
              </div>
              {result.events.map((item, index) => (
                <div key={`${item.label}-${item.location}-${item.occurred_at ?? index}`} className="flex flex-col gap-2 rounded-md border bg-background/35 p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                  <span className="flex min-w-0 items-start gap-2">
                    <Clock3 className="mt-0.5 size-4 shrink-0 text-primary" />
                    <span>
                      <span className="block font-medium">{item.label}</span>
                      <span className="text-xs text-muted-foreground">{item.location ?? "Fly Logistics network"}{formatDate(item.occurred_at) ? ` - ${formatDate(item.occurred_at)}` : ""}</span>
                    </span>
                  </span>
                  <Badge className={item.completed ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-500" : "border-primary/40 bg-primary/10 text-primary"}>
                    {item.completed ? "Complete" : "Pending"}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
