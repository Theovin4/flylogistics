"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { MapContainer, Marker, Popup, TileLayer } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Loader2, MapPinned, PackageCheck, Truck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { transportationMarkerKind, transportationTypeLabel } from "@/lib/driver-data";
import { getSupabaseBrowser } from "@/lib/supabase";
import type { DriverSummary, ShipmentRecord } from "@/lib/shipments";

function coordinates(driver: DriverSummary) {
  const lat = driver.current_latitude ?? driver.latitude;
  const lng = driver.current_longitude ?? driver.longitude;
  return typeof lat === "number" && Number.isFinite(lat) && typeof lng === "number" && Number.isFinite(lng)
    ? { lat, lng }
    : null;
}

function activeShipment(shipment: ShipmentRecord) {
  return !["DELIVERED", "CANCELLED"].includes(String(shipment.status).toUpperCase());
}

function isOnline(driver: DriverSummary) {
  const status = String(driver.status ?? "").toLowerCase();
  return driver.is_online === true || (!status.includes("offline") && !status.includes("inactive") && !status.includes("suspended"));
}

function vehicleKind(driver: DriverSummary) {
  return transportationTypeLabel(driver.vehicle_type);
}

function vehicleIcon(driver: DriverSummary) {
  const kind = transportationMarkerKind(driver.vehicle_type);
  const iconHtml = kind === "truck" ? "&#128666;" : kind === "van" ? "&#128656;" : "&#128757;";
  return L.divIcon({
    html: `<span class="fly-driver-marker-icon">${iconHtml}</span>`,
    className: `fly-driver-marker fly-driver-marker-${kind} ${isOnline(driver) ? "fly-driver-marker-online" : "fly-driver-marker-offline"}`,
    iconSize: [40, 40],
    iconAnchor: [20, 20],
    popupAnchor: [0, -20]
  });
}

export default function AdminOperationsMapView() {
  const [drivers, setDrivers] = useState<DriverSummary[]>([]);
  const [shipments, setShipments] = useState<ShipmentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [scopeReady, setScopeReady] = useState(false);

  const authHeaders = useCallback(async (): Promise<Record<string, string>> => {
    const supabase = getSupabaseBrowser();
    const { data } = supabase ? await supabase.auth.getSession() : { data: { session: null } };
    return data.session?.access_token ? { Authorization: `Bearer ${data.session.access_token}` } : {};
  }, []);

  const loadMapData = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) setLoading(true);
    setError(null);
    try {
      const headers = new Headers(await authHeaders());
      const [driverResponse, shipmentResponse] = await Promise.all([
        fetch("/api/drivers", { headers, cache: "no-store" }),
        fetch("/api/shipments", { headers, cache: "no-store" })
      ]);
      const [driverData, shipmentData] = await Promise.all([driverResponse.json(), shipmentResponse.json()]);
      if (!driverResponse.ok) throw new Error(driverData.error ?? "Unable to load drivers.");
      if (!shipmentResponse.ok) throw new Error(shipmentData.error ?? "Unable to load shipments.");
      setDrivers(driverData);
      setShipments(shipmentData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load operations map.");
    } finally {
      if (!options?.silent) setLoading(false);
    }
  }, [authHeaders]);

  useEffect(() => {
    let mounted = true;
    async function loadScope() {
      try {
        const headers = new Headers(await authHeaders());
        const response = await fetch("/api/realtime/scope", { headers, cache: "no-store" });
        const data = response.ok ? await response.json() : null;
        if (mounted) setCompanyId(data?.companyId ?? null);
      } catch {
        if (mounted) setCompanyId(null);
      } finally {
        if (mounted) setScopeReady(true);
      }
    }
    void loadScope();
    return () => {
      mounted = false;
    };
  }, [authHeaders]);

  useEffect(() => {
    if (!scopeReady) return;

    void loadMapData();
    const polling = window.setInterval(() => void loadMapData({ silent: true }), 25000);
    const supabase = getSupabaseBrowser();
    if (!supabase) return () => window.clearInterval(polling);

    const driverChangeFilter = companyId
      ? { event: "*" as const, schema: "public", table: "drivers", filter: `company_id=eq.${companyId}` }
      : { event: "*" as const, schema: "public", table: "drivers" };
    const shipmentChangeFilter = companyId
      ? { event: "*" as const, schema: "public", table: "shipments", filter: `company_id=eq.${companyId}` }
      : { event: "*" as const, schema: "public", table: "shipments" };

    const driverChannel = supabase
      .channel("admin-operations-map-drivers")
      .on("postgres_changes", driverChangeFilter, () => void loadMapData({ silent: true }))
      .on("postgres_changes", shipmentChangeFilter, () => void loadMapData({ silent: true }))
      .subscribe();

    return () => {
      window.clearInterval(polling);
      void supabase.removeChannel(driverChannel);
    };
  }, [companyId, loadMapData, scopeReady]);

  const activeShipments = useMemo(() => shipments.filter(activeShipment), [shipments]);
  const visibleDrivers = useMemo(() => drivers.filter((driver) => coordinates(driver)), [drivers]);
  const center = coordinates(visibleDrivers[0] ?? {} as DriverSummary) ?? { lat: 6.5244, lng: 3.3792 };

  return (
    <Card className="glass mt-8 overflow-hidden">
      <CardHeader>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <MapPinned className="size-5 text-primary" />
              Live operations map
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Admin view of active riders, online status, active shipments, and driver assignments.
            </p>
          </div>
          <Button variant="outline" onClick={() => void loadMapData()} disabled={loading}>
            {loading ? <Loader2 className="animate-spin" /> : <MapPinned />}
            Refresh map
          </Button>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4 p-0 xl:grid-cols-[360px_1fr]">
        <div className="grid max-h-[560px] gap-3 overflow-y-auto border-t p-4 xl:border-r xl:border-t-0">
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-md border bg-background/35 p-3 text-sm">
              <span className="block text-xs text-muted-foreground">Drivers</span>
              <span className="font-mono text-xl font-black">{drivers.length}</span>
            </div>
            <div className="rounded-md border bg-background/35 p-3 text-sm">
              <span className="block text-xs text-muted-foreground">Online</span>
              <span className="font-mono text-xl font-black">{drivers.filter(isOnline).length}</span>
            </div>
            <div className="rounded-md border bg-background/35 p-3 text-sm">
              <span className="block text-xs text-muted-foreground">Active</span>
              <span className="font-mono text-xl font-black">{activeShipments.length}</span>
            </div>
          </div>
          {error && <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
          {visibleDrivers.map((driver) => {
            const assigned = activeShipments.filter((shipment) => String(shipment.driver_id ?? "") === String(driver.id));
            return (
              <div key={String(driver.id)} className="rounded-md border bg-background/35 p-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold">{driver.name}</span>
                  <Badge className={isOnline(driver) ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-500" : "border-muted-foreground/30 bg-background/55 text-muted-foreground"}>
                    {isOnline(driver) ? "Online" : "Offline"}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{vehicleKind(driver)} • {assigned.length} active shipment{assigned.length === 1 ? "" : "s"}</p>
              </div>
            );
          })}
        </div>
        <div className="relative h-[560px]">
          <MapContainer center={[center.lat, center.lng]} zoom={11} className="h-full w-full">
            <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            {visibleDrivers.map((driver) => {
              const point = coordinates(driver);
              if (!point) return null;
              const assigned = activeShipments.filter((shipment) => String(shipment.driver_id ?? "") === String(driver.id));
              return (
                <Marker key={String(driver.id)} position={[point.lat, point.lng]} icon={vehicleIcon(driver)}>
                  <Popup>
                    <div className="min-w-56">
                      <strong>{driver.name}</strong>
                      <div className="mt-1 text-xs opacity-80">{driver.status ?? "status pending"} • {vehicleKind(driver)}</div>
                      <div className="mt-3 grid gap-2">
                        {assigned.length === 0 && <div className="rounded-md border border-white/15 p-2 text-xs">No active shipment assigned.</div>}
                        {assigned.slice(0, 4).map((shipment) => (
                          <div key={shipment.tracking_id} className="rounded-md border border-white/15 p-2 text-xs">
                            <div className="font-semibold">{shipment.tracking_id}</div>
                            <div className="mt-1 opacity-70">{shipment.status} • {shipment.package_type}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </Popup>
                </Marker>
              );
            })}
          </MapContainer>
          <div className="pointer-events-none absolute left-3 right-3 top-3 rounded-md border border-white/15 bg-black/75 p-3 text-white shadow-2xl backdrop-blur sm:right-auto">
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.22em] text-primary">
              <Truck className="size-4" />
              Admin Map
            </div>
            <div className="mt-1 text-sm font-semibold">{activeShipments.length} active shipments monitored</div>
            <div className="mt-1 flex items-center gap-2 text-xs text-white/65">
              <PackageCheck className="size-3" />
              Bike, van, and truck markers by vehicle type
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
