"use client";

import { FormEvent, useState } from "react";
import Image from "next/image";
import { AlertTriangle, Loader2, MapPin, Navigation, PackageCheck, ShieldCheck, Truck } from "lucide-react";
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
  events: { label: string; location?: string; completed: boolean }[];
};

export function TrackingLookup() {
  const [trackingId, setTrackingId] = useState("FLY-2026-88912");
  const [result, setResult] = useState<TrackingResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function trackShipment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const id = trackingId.trim();
    if (!id) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/shipments/track/${encodeURIComponent(id)}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Tracking lookup failed.");
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Tracking lookup failed.");
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  const visibleStatus = result?.status.replaceAll("_", " ") ?? "Awaiting lookup";

  return (
    <div className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr]">
      <div>
        <h1 className="text-5xl font-black tracking-normal text-balance">Track a shipment across the live logistics graph.</h1>
        <p className="mt-4 text-muted-foreground">
          Enter a tracking ID to see shipment status, pickup, delivery address, driver, package type, timeline, and map position.
        </p>
        <form className="mt-8 flex flex-col gap-3 sm:flex-row" onSubmit={trackShipment}>
          <Input value={trackingId} onChange={(event) => setTrackingId(event.target.value)} placeholder="FLY-2026-88912" aria-label="Tracking number" />
          <Button disabled={loading || !trackingId.trim()}>
            {loading ? <Loader2 className="animate-spin" /> : <Navigation />}
            Track
          </Button>
        </form>
        {error && (
          <div className="mt-4 flex gap-3 rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
            <AlertTriangle className="size-4 shrink-0" />
            {error}
          </div>
        )}

        {result && (
          <Card className="glass mt-6">
            <CardHeader>
              <CardTitle className="text-xl">{result.packageType}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 text-sm">
              <div className="grid gap-3">
                <div className="rounded-md border p-3">
                  <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Pickup</div>
                  <div className="mt-1 font-medium">{result.pickupAddress}</div>
                </div>
                <div className="rounded-md border p-3">
                  <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Delivery</div>
                  <div className="mt-1 font-medium">{result.deliveryAddress}</div>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge className="border-primary/40 bg-primary/10 text-primary">{result.urgency}</Badge>
                <Badge>{visibleStatus}</Badge>
                <Badge>{result.eta}</Badge>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <Card className="glass overflow-hidden">
        <div className="relative h-80 bg-black">
          <div className="absolute inset-0 grid-field opacity-60" />
          <div className="orange-line absolute left-10 right-10 top-1/2 h-px" />
          <Truck className="absolute left-[58%] top-[43%] size-10 text-primary" />
          <MapPin className="absolute left-[18%] top-[56%] size-8 text-white" />
          <Navigation className="absolute right-[18%] top-[30%] size-8 text-white" />
          {result && (
            <div className="absolute bottom-4 left-4 rounded-md border border-white/15 bg-black/70 px-4 py-3 text-xs text-white backdrop-blur">
              {result.vehicle.lat.toFixed(4)}, {result.vehicle.lng.toFixed(4)}
            </div>
          )}
        </div>
        <CardHeader>
          <CardTitle>{result ? `${result.trackingId} - ${visibleStatus}` : "Enter tracking ID for live status"}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <Progress value={result?.confidence ?? 25} />
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              result ? visibleStatus : "Status pending",
              `${result?.confidence ?? 0}% confidence`,
              result ? `${result.vehicle.speedKph} kph live speed` : "Map position pending"
            ].map((item) => (
              <div key={item} className="rounded-md border p-3 text-sm">
                <ShieldCheck className="mb-2 size-4 text-primary" />
                {item}
              </div>
            ))}
          </div>

          {result?.assignedDriver && (
            <div className="flex items-center gap-3 rounded-md border p-3">
              <div className="relative size-12 overflow-hidden rounded-md border bg-black">
                {result.assignedDriver.photoUrl ? (
                  <Image src={result.assignedDriver.photoUrl} alt={`${result.assignedDriver.name} driver photo`} width={96} height={96} className="h-full w-full object-cover" />
                ) : (
                  <Truck className="m-3 size-6 text-primary" />
                )}
              </div>
              <div>
                <div className="font-semibold">{result.assignedDriver.name}</div>
                <div className="text-xs text-muted-foreground">{result.assignedDriver.status ?? "Assigned driver"}</div>
              </div>
            </div>
          )}

          {result?.proofImageUrl && (
            <div className="overflow-hidden rounded-md border">
              <Image src={result.proofImageUrl} alt="Proof of delivery" width={720} height={420} className="h-48 w-full object-cover" />
            </div>
          )}

          {result && (
            <div className="grid gap-3">
              {result.events.map((item) => (
                <div key={`${item.label}-${item.location}`} className="flex items-center justify-between rounded-md border p-3 text-sm">
                  <span className="flex items-center gap-2">
                    <PackageCheck className="size-4 text-primary" />
                    {item.label}{item.location ? ` - ${item.location}` : ""}
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
