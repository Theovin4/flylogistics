"use client";

import { FormEvent, useState } from "react";
import { AlertTriangle, Loader2, MapPin, Navigation, ShieldCheck, Truck } from "lucide-react";
import { SiteFooter } from "@/components/brand/site-footer";
import { SiteHeader } from "@/components/brand/site-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { MediaUploadPanel } from "@/components/cloudinary/media-upload-panel";

type TrackingResult = {
  trackingId: string;
  status: string;
  eta: string;
  confidence: number;
  vehicle: { id: string; lat: number; lng: number; speedKph: number };
  events: { label: string; location: string; completed: boolean }[];
};

export default function TrackingPage() {
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
      const response = await fetch(`/api/tracking/${encodeURIComponent(id)}`);
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

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <Badge className="border-primary/40 bg-primary/10 text-primary">Real-time tracking</Badge>
        <div className="mt-6 grid gap-8 lg:grid-cols-[0.8fr_1.2fr]">
          <div>
            <h1 className="text-5xl font-black tracking-normal text-balance">Track a shipment across the live logistics graph.</h1>
            <p className="mt-4 text-muted-foreground">Enter a tracking ID to retrieve vehicle telemetry, event history, ETA, and delivery confidence.</p>
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
          </div>
          <Card className="glass overflow-hidden">
            <div className="relative h-80 bg-black">
              <div className="absolute inset-0 grid-field opacity-60" />
              <div className="orange-line absolute left-10 right-10 top-1/2 h-px" />
              <Truck className="absolute left-[58%] top-[43%] size-10 text-primary" />
              <MapPin className="absolute left-[18%] top-[56%] size-8 text-white" />
              <Navigation className="absolute right-[18%] top-[30%] size-8 text-white" />
            </div>
            <CardHeader>
              <CardTitle>
                {result ? `${result.vehicle.id} - ETA ${result.eta}` : "Atlanta to Newark - ETA 4h 20m"}
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <Progress value={result?.confidence ?? 68} />
              <div className="grid gap-3 sm:grid-cols-3">
                {[
                  result ? result.status.replaceAll("_", " ") : "68% complete",
                  `${result?.confidence ?? 97}% confidence`,
                  result ? `${result.vehicle.speedKph} kph live speed` : "Geofence verified"
                ].map((item) => (
                  <div key={item} className="rounded-md border p-3 text-sm"><ShieldCheck className="mb-2 size-4 text-primary" />{item}</div>
                ))}
              </div>
              {result && (
                <div className="grid gap-3">
                  {result.events.map((item) => (
                    <div key={`${item.label}-${item.location}`} className="flex items-center justify-between rounded-md border p-3 text-sm">
                      <span>{item.label} - {item.location}</span>
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
        <section className="mt-8">
          <MediaUploadPanel />
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
