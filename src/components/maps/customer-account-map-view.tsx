"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Bike, MapPinned } from "lucide-react";
import { MapContainer, Marker, Popup, TileLayer } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { getSupabaseBrowser } from "@/lib/supabase";
import type { DriverSummary, ShipmentRecord } from "@/lib/shipments";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function activeShipment(shipment: ShipmentRecord) {
  return !["DELIVERED", "CANCELLED"].includes(String(shipment.status).toUpperCase());
}

function driverCoordinates(driver?: DriverSummary | null) {
  const lat = driver?.current_latitude ?? driver?.latitude;
  const lng = driver?.current_longitude ?? driver?.longitude;
  return typeof lat === "number" && Number.isFinite(lat) && typeof lng === "number" && Number.isFinite(lng)
    ? { lat, lng }
    : null;
}

function vehicleKind(driver?: DriverSummary | null, shipment?: ShipmentRecord) {
  const vehicle = String(driver?.vehicle_type ?? shipment?.vehicle_type ?? "bike").toLowerCase();
  if (vehicle.includes("truck") || vehicle.includes("lorry")) return "truck";
  if (vehicle.includes("van") || vehicle.includes("car")) return "van";
  return "bike";
}

function vehicleIcon(driver?: DriverSummary | null, shipment?: ShipmentRecord) {
  const kind = vehicleKind(driver, shipment);
  const iconHtml = kind === "truck" ? "&#128666;" : kind === "van" ? "&#128656;" : "&#128757;";
  return L.divIcon({
    html: `<span class="fly-driver-marker-icon">${iconHtml}</span>`,
    className: `fly-driver-marker fly-driver-marker-${kind} fly-driver-marker-online`,
    iconSize: [40, 40],
    iconAnchor: [20, 20],
    popupAnchor: [0, -20]
  });
}

function mergeDriverUpdate(shipments: ShipmentRecord[], driver: DriverSummary) {
  return shipments.map((shipment) =>
    String(shipment.driver_id ?? shipment.assigned_driver?.id ?? "") === String(driver.id)
      ? { ...shipment, assigned_driver: { ...(shipment.assigned_driver ?? driver), ...driver } }
      : shipment
  );
}

export default function CustomerAccountMapView({ shipments: initialShipments }: { shipments: ShipmentRecord[] }) {
  const [shipments, setShipments] = useState(initialShipments);

  useEffect(() => {
    setShipments(initialShipments);
  }, [initialShipments]);

  const authHeaders = useCallback(async (): Promise<Record<string, string>> => {
    const supabase = getSupabaseBrowser();
    const { data } = supabase ? await supabase.auth.getSession() : { data: { session: null } };
    return data.session?.access_token ? { Authorization: `Bearer ${data.session.access_token}` } : {};
  }, []);

  const visibleShipments = useMemo(
    () => shipments.filter((shipment) => activeShipment(shipment) && driverCoordinates(shipment.assigned_driver)),
    [shipments]
  );
  const assignedDriverKey = useMemo(
    () =>
      Array.from(new Set(shipments.map((shipment) => String(shipment.driver_id ?? shipment.assigned_driver?.id ?? "")).filter(Boolean)))
        .sort()
        .join(","),
    [shipments]
  );

  useEffect(() => {
    const assignedDriverIds = assignedDriverKey ? assignedDriverKey.split(",").slice(0, 25) : [];
    let mounted = true;

    async function refreshOwnShipments() {
      try {
        const headers = new Headers(await authHeaders());
        const response = await fetch("/api/customer/overview", { headers, cache: "no-store" });
        const data = await response.json();
        if (mounted && response.ok) setShipments(data.shipments ?? []);
      } catch {
        // Realtime remains primary; polling is best-effort.
      }
    }

    const polling = window.setInterval(refreshOwnShipments, 25000);
    const supabase = getSupabaseBrowser();
    if (!supabase) {
      return () => {
        mounted = false;
        window.clearInterval(polling);
      };
    }

    if (assignedDriverIds.length === 0) {
      return () => {
        mounted = false;
        window.clearInterval(polling);
      };
    }

    let channel = supabase.channel(`customer-assigned-driver-map-${assignedDriverIds.join("-")}`);
    for (const driverId of assignedDriverIds) {
      channel = channel.on("postgres_changes", { event: "*" as const, schema: "public", table: "drivers", filter: `id=eq.${driverId}` }, (payload) => {
        const driver = payload.new as DriverSummary;
        setShipments((current) => mergeDriverUpdate(current, driver));
      });
    }
    channel.subscribe();

    return () => {
      mounted = false;
      window.clearInterval(polling);
      void supabase.removeChannel(channel);
    };
  }, [assignedDriverKey, authHeaders]);

  const center = driverCoordinates(visibleShipments[0]?.assigned_driver) ?? { lat: 6.5244, lng: 3.3792 };

  return (
    <Card id="customer-live-map" className="glass scroll-mt-24 overflow-hidden">
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <MapPinned className="size-5 text-primary" />
              Live map
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">Only your active shipments and assigned rider locations are shown here.</p>
          </div>
          <Badge className="border-primary/40 bg-primary/10 text-primary">{visibleShipments.length} live</Badge>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4 p-0 lg:grid-cols-[320px_1fr]">
        <div className="grid max-h-[420px] gap-2 overflow-y-auto border-t p-4 lg:border-r lg:border-t-0">
          {visibleShipments.length === 0 && (
            <div className="rounded-md border bg-background/35 p-4 text-sm text-muted-foreground">
              Assigned riders appear once operations links a driver and the rider shares live location.
            </div>
          )}
          {visibleShipments.map((shipment) => (
            <div key={shipment.tracking_id} className="rounded-md border bg-background/35 p-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono font-semibold">{shipment.tracking_id}</span>
                <Badge>{shipment.status}</Badge>
              </div>
              <p className="mt-2 text-muted-foreground">{shipment.assigned_driver?.name ?? "Assigned rider"}</p>
              <p className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                <Bike className="size-3 text-primary" />
                {vehicleKind(shipment.assigned_driver, shipment)} location
              </p>
            </div>
          ))}
        </div>
        <div className="relative h-[420px]">
          <MapContainer center={[center.lat, center.lng]} zoom={11} className="h-full w-full">
            <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            {visibleShipments.map((shipment) => {
              const coordinates = driverCoordinates(shipment.assigned_driver);
              if (!coordinates) return null;
              return (
                <Marker key={shipment.tracking_id} position={[coordinates.lat, coordinates.lng]} icon={vehicleIcon(shipment.assigned_driver, shipment)}>
                  <Popup>
                    <div className="min-w-52">
                      <strong>{shipment.assigned_driver?.name ?? "Assigned rider"}</strong>
                      <div className="mt-1 text-xs opacity-80">{shipment.tracking_id}</div>
                      <div className="mt-2 rounded-md border border-white/15 p-2 text-xs">
                        {shipment.pickup_address} to {shipment.delivery_address}
                      </div>
                    </div>
                  </Popup>
                </Marker>
              );
            })}
          </MapContainer>
        </div>
      </CardContent>
    </Card>
  );
}
