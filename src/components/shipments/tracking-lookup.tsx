"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Loader2,
  MapPin,
  MessageCircle,
  Navigation,
  PackageCheck,
  PhoneCall,
  Search,
  ShieldCheck,
  Truck
} from "lucide-react";
import { getWhatsAppUrl } from "@/lib/contact";
import { getSupabaseBrowser } from "@/lib/supabase";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";

type TrackingResult = {
  trackingId: string;
  status: string;
  eta: string;
  confidence: number;
  pickupAddress: string;
  deliveryAddress: string;
  packageType: string;
  urgency: string;
  customerName?: string | null;
  proofImageUrl?: string | null;
  packageImageUrl?: string | null;
  assignedDriver: {
    id: string | number;
    name: string;
    status?: string | null;
    phone?: string | null;
    photoUrl?: string | null;
  } | null;
  vehicle: { id: string; lat: number; lng: number; speedKph: number };
  events: { label: string; location?: string; completed: boolean; occurred_at?: string }[];
};

const demoTrackingId = "FLY-2026-88912";

const trackingHighlights = [
  { icon: PackageCheck, title: "Shipment details", text: "Package type, pickup, delivery, and urgency." },
  { icon: Truck, title: "Driver visibility", text: "Assigned driver, status, and contact if available." },
  { icon: ShieldCheck, title: "Delivery proof", text: "Proof image appears after admin upload." }
] as const;

function formatStatus(status: string) {
  return status.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDate(value?: string) {
  if (!value) return null;
  return new Date(value).toLocaleString();
}

export function TrackingLookup() {
  const [trackingId, setTrackingId] = useState("");
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

  const truckPosition = useMemo(() => {
    if (!result) return { left: "58%", top: "43%" };
    const latOffset = Math.abs(result.vehicle.lat * 13) % 46;
    const lngOffset = Math.abs(result.vehicle.lng * 17) % 48;
    return {
      left: `${24 + lngOffset}%`,
      top: `${22 + latOffset}%`
    };
  }, [result]);

  const visibleStatus = result ? formatStatus(result.status) : "Awaiting lookup";

  return (
    <div className="grid gap-8 lg:grid-cols-[0.78fr_1.22fr]">
      <div className="grid content-start gap-6">
        <div>
          <Badge className="border-primary/40 bg-primary/10 text-primary">Customer tracking</Badge>
          <h1 className="mt-5 text-5xl font-black tracking-normal text-balance">Track your shipment from pickup to proof.</h1>
          <p className="mt-4 text-muted-foreground">
            Enter your Fly Logistics tracking ID to see the shipment status, delivery route, timeline, assigned driver, ETA, and proof of delivery when available.
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
                <Button type="button" variant="outline" size="sm" onClick={() => void lookupShipment(demoTrackingId)} disabled={loading}>
                  Try demo
                </Button>
                <Button asChild variant="outline" size="sm">
                  <Link href="/quote">
                    Book shipment
                  </Link>
                </Button>
                <Button asChild variant="outline" size="sm">
                  <a href={getWhatsAppUrl("Hi Fly Logistics, I need urgent help tracking a shipment.")} target="_blank" rel="noreferrer">
                    <MessageCircle />
                    WhatsApp support
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

        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
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
        <div className="relative h-72 bg-black sm:h-80">
          <div className="absolute inset-0 grid-field opacity-60" />
          <div className="orange-line absolute left-8 right-8 top-1/2 h-px" />
          <Truck className="absolute size-10 text-primary transition-all duration-700 ease-out" style={truckPosition} />
          <MapPin className="absolute left-[18%] top-[56%] size-8 text-white" />
          <Navigation className="absolute right-[18%] top-[30%] size-8 text-white" />
          <div className="absolute bottom-4 left-4 right-4 rounded-md border border-white/15 bg-black/70 px-4 py-3 text-xs text-white backdrop-blur">
            {result ? (
              <span className="font-mono">{result.vehicle.lat.toFixed(4)}, {result.vehicle.lng.toFixed(4)} - {result.vehicle.speedKph} kph</span>
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
                {result ? `${result.pickupAddress} to ${result.deliveryAddress}` : "Customer tracking is connected to real Supabase shipment records."}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge className="w-fit border-primary/40 bg-primary/10 text-primary">{visibleStatus}</Badge>
              {result && <Badge className="w-fit border-emerald-500/40 bg-emerald-500/10 text-emerald-500">Live updates on</Badge>}
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid gap-5">
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              ["ETA", result?.eta ?? "Pending"],
              ["Confidence", `${result?.confidence ?? 0}%`],
              ["Package", result?.packageType ?? "Awaiting lookup"]
            ].map(([label, value]) => (
              <div key={label} className="rounded-md border bg-background/40 p-3 text-sm">
                <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{label}</div>
                <div className="mt-2 font-semibold">{value}</div>
              </div>
            ))}
          </div>

          <Progress value={result?.confidence ?? 0} />

          {result && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-md border bg-background/40 p-3 text-sm">
                <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Pickup</div>
                <div className="mt-2 font-medium">{result.pickupAddress}</div>
              </div>
              <div className="rounded-md border bg-background/40 p-3 text-sm">
                <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Delivery</div>
                <div className="mt-2 font-medium">{result.deliveryAddress}</div>
              </div>
            </div>
          )}

          {result?.assignedDriver ? (
            <div className="flex flex-col gap-3 rounded-md border bg-background/40 p-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <div className="relative size-14 overflow-hidden rounded-md border bg-black">
                  {result.assignedDriver.photoUrl ? (
                    <Image src={result.assignedDriver.photoUrl} alt={`${result.assignedDriver.name} driver photo`} width={112} height={112} className="h-full w-full object-cover" />
                  ) : (
                    <Truck className="m-4 size-6 text-primary" />
                  )}
                </div>
                <div>
                  <div className="font-semibold">{result.assignedDriver.name}</div>
                  <div className="text-xs text-muted-foreground">{result.assignedDriver.status ?? "Assigned driver"}</div>
                </div>
              </div>
              {result.assignedDriver.phone && (
                <Button asChild variant="outline" size="sm">
                  <a href={`tel:${result.assignedDriver.phone}`}>
                    <PhoneCall />
                    Call driver
                  </a>
                </Button>
              )}
            </div>
          ) : result ? (
            <div className="rounded-md border bg-background/40 p-3 text-sm text-muted-foreground">A driver has not been assigned yet.</div>
          ) : null}

          {result?.proofImageUrl && (
            <div className="overflow-hidden rounded-md border">
              <div className="flex items-center gap-2 border-b bg-background/60 px-3 py-2 text-sm font-semibold">
                <CheckCircle2 className="size-4 text-emerald-500" />
                Proof of delivery
              </div>
              <Image src={result.proofImageUrl} alt="Proof of delivery" width={840} height={520} className="h-56 w-full object-cover" />
            </div>
          )}

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
