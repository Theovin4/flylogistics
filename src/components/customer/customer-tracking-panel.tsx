"use client";

import { useMemo, useState } from "react";
import { Clock3, MapPin, Navigation, PackageCheck, Route, Search, ShieldCheck, Truck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { transportationTypeLabel } from "@/lib/driver-data";
import { isInternationalDelivery, isNigeriaCountry } from "@/lib/pricing";
import { publicShipmentTimeline, type ShipmentRecord } from "@/lib/shipments";

function statusLabel(value: string | null | undefined) {
  return String(value ?? "pending").replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDate(value?: string) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString() : null;
}

function statusClass(status?: string | null) {
  const normalized = String(status ?? "").toUpperCase();
  if (normalized === "DELIVERED") return "border-emerald-500/40 bg-emerald-500/10 text-emerald-500";
  if (normalized === "CANCELLED" || normalized === "FAILED") return "border-destructive/40 bg-destructive/10 text-destructive";
  return "border-primary/40 bg-primary/10 text-primary";
}

function routeMode(shipment: ShipmentRecord) {
  const category = String(shipment.delivery_category ?? "").toLowerCase();
  if (category.includes("international") || category.includes("import") || category.includes("export")) return "International lane";

  const pickupCountry = String(shipment.pickup_country ?? "").trim();
  const destinationCountry = String(shipment.destination_country ?? "").trim();
  if ((pickupCountry || destinationCountry) && (!isNigeriaCountry(pickupCountry) || !isNigeriaCountry(destinationCountry))) {
    return "International lane";
  }

  if (shipment.pickup_state && shipment.destination_state) {
    return shipment.pickup_state === shipment.destination_state ? "Local delivery lane" : "Interstate lane";
  }

  if (isInternationalDelivery({
    shipmentType: shipment.shipment_type,
    deliveryCategory: shipment.delivery_category,
    pickupCountry: shipment.pickup_country,
    destinationCountry: shipment.destination_country
  })) return "International lane";
  return "Local delivery lane";
}

function confidenceLabel(value?: number | string | null) {
  const confidence = Number(value ?? 0);
  if (!Number.isFinite(confidence) || confidence <= 0) return "Building route confidence";
  if (confidence >= 90) return `${confidence}% high confidence`;
  if (confidence >= 70) return `${confidence}% steady confidence`;
  return `${confidence}% under operations review`;
}

export function CustomerTrackingPanel({ shipments }: { shipments: ShipmentRecord[] }) {
  const [trackingId, setTrackingId] = useState("");
  const activeShipments = useMemo(
    () => shipments.filter((shipment) => !["DELIVERED", "CANCELLED"].includes(String(shipment.status).toUpperCase())),
    [shipments]
  );
  const selectedShipment = useMemo(() => {
    const normalized = trackingId.trim().toUpperCase();
    if (normalized) return shipments.find((shipment) => shipment.tracking_id.toUpperCase() === normalized) ?? null;
    return activeShipments[0] ?? shipments[0] ?? null;
  }, [activeShipments, shipments, trackingId]);
  const selectedTimeline = useMemo(() => {
    if (!selectedShipment) return [];
    return publicShipmentTimeline(selectedShipment);
  }, [selectedShipment]);

  return (
    <Card id="customer-tracking" className="glass scroll-mt-24">
      <CardHeader>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <PackageCheck className="size-5 text-primary" />
              Track shipment in your account
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Search your own tracking IDs and view status, ETA, timeline, driver, and delivery context without leaving your customer dashboard.
            </p>
          </div>
          <Badge className="border-primary/40 bg-primary/10 text-primary">{shipments.length} linked</Badge>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            value={trackingId}
            onChange={(event) => setTrackingId(event.target.value)}
            placeholder="Enter your tracking ID"
            className="font-mono"
          />
          <Button type="button" variant="outline" className="sm:w-auto">
            <Search />
            Search
          </Button>
        </div>

        {!selectedShipment && (
          <div className="rounded-md border bg-background/35 p-4 text-sm text-muted-foreground">
            No shipments are linked to this account yet. Once operations creates a tracking ID, it will appear here.
          </div>
        )}

        {selectedShipment && (
          <div className="grid gap-4">
            <div className="rounded-md border bg-background/45 p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-mono text-xl font-black">{selectedShipment.tracking_id}</h3>
                    <Badge className={statusClass(selectedShipment.status)}>{statusLabel(selectedShipment.status)}</Badge>
                    <Badge>{selectedShipment.eta ?? "ETA pending"}</Badge>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {selectedShipment.pickup_address} to {selectedShipment.delivery_address}
                  </p>
                </div>
                <div className="grid gap-2 text-sm sm:grid-cols-2 lg:min-w-72">
                  <span className="rounded-md border bg-background/45 p-3">
                    <span className="block text-xs uppercase tracking-[0.18em] text-muted-foreground">Driver</span>
                    <span className="mt-1 flex items-center gap-2 font-semibold">
                      <Truck className="size-4 text-primary" />
                      {selectedShipment.assigned_driver?.name ?? "Unassigned"}
                    </span>
                  </span>
                  <span className="rounded-md border bg-background/45 p-3">
                    <span className="block text-xs uppercase tracking-[0.18em] text-muted-foreground">Transportation</span>
                    <span className="mt-1 block font-semibold">{transportationTypeLabel(selectedShipment.assigned_driver?.vehicle_type ?? selectedShipment.vehicle_type)}</span>
                  </span>
                  <span className="rounded-md border bg-background/45 p-3">
                    <span className="block text-xs uppercase tracking-[0.18em] text-muted-foreground">Package</span>
                    <span className="mt-1 block font-semibold">{selectedShipment.package_type}</span>
                  </span>
                </div>
              </div>
              {selectedShipment.customer_status_message && (
                <div className="mt-4 rounded-md border border-primary/25 bg-primary/10 p-3 text-sm">
                  <span className="font-semibold">Fly Logistics update:</span>{" "}
                  <span className="text-muted-foreground">{selectedShipment.customer_status_message}</span>
                </div>
              )}
            </div>

            <div className="grid gap-3 rounded-md border border-primary/20 bg-primary/5 p-4 lg:grid-cols-3">
              <div className="lg:col-span-3">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Route className="size-4 text-primary" />
                  Route intelligence
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  Fly Logistics is monitoring this lane, ETA, and delivery progress from your account.
                </p>
              </div>
              <span className="rounded-md border bg-background/45 p-3">
                <span className="flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-muted-foreground">
                  <MapPin className="size-3 text-primary" />
                  Route type
                </span>
                <span className="mt-2 block font-semibold">{routeMode(selectedShipment)}</span>
              </span>
              <span className="rounded-md border bg-background/45 p-3">
                <span className="flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-muted-foreground">
                  <Navigation className="size-3 text-primary" />
                  Distance
                </span>
                <span className="mt-2 block font-semibold">
                  {selectedShipment.route_distance_km ? `${Number(selectedShipment.route_distance_km).toLocaleString()} km` : "Calculated by operations"}
                </span>
              </span>
              <span className="rounded-md border bg-background/45 p-3">
                <span className="flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-muted-foreground">
                  <ShieldCheck className="size-3 text-primary" />
                  ETA guidance
                </span>
                <span className="mt-2 block font-semibold">{confidenceLabel(selectedShipment.eta_confidence)}</span>
              </span>
            </div>

            <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
              <div className="grid gap-2">
                <h4 className="text-sm font-semibold">Timeline</h4>
                {selectedTimeline.map((event, index) => (
                  <div key={`${selectedShipment.tracking_id}-${event.label}-${index}`} className="flex flex-col gap-2 rounded-md border bg-background/35 p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                    <span className="flex min-w-0 items-start gap-2">
                      <MapPin className="mt-0.5 size-4 shrink-0 text-primary" />
                      <span>
                        <span className="block font-medium">{event.label}</span>
                        <span className="text-xs text-muted-foreground">
                          {event.location || "Fly Logistics network"}{formatDate(event.occurred_at) ? ` - ${formatDate(event.occurred_at)}` : ""}
                        </span>
                      </span>
                    </span>
                    <Badge className={event.completed ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-500" : "border-primary/40 bg-primary/10 text-primary"}>
                      {event.completed ? "Complete" : "Pending"}
                    </Badge>
                  </div>
                ))}
              </div>

              <div className="grid gap-3">
                <div className="rounded-md border bg-background/40 p-3">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <Clock3 className="size-4 text-primary" />
                    ETA and driver
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {selectedShipment.assigned_driver?.name ? `${selectedShipment.assigned_driver.name} is assigned.` : "Driver assignment will appear after dispatch."}
                  </p>
                </div>
                <div className="rounded-md border bg-background/40 p-3">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <ShieldCheck className="size-4 text-primary" />
                    Delivery confirmation
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {String(selectedShipment.status).toUpperCase() === "DELIVERED"
                      ? "Delivery completion has been securely recorded by Fly Logistics operations. Private delivery records are only available to authorized operations users."
                      : "Delivery completion will be securely reviewed by Fly Logistics operations when the shipment is delivered."}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
