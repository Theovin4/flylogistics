"use client";

import { useEffect, useMemo, useState } from "react";
import { MapContainer, Marker, Popup, TileLayer } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { getSupabaseBrowser } from "@/lib/supabase";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { missingDriverColumn, transportationMarkerKind, transportationTypeLabel } from "@/lib/driver-data";

type Driver = {
  id: number;
  latitude: number | null;
  longitude: number | null;
  current_latitude?: number | null;
  current_longitude?: number | null;
  is_online?: boolean | null;
  last_location_at?: string | null;
  status: string | null;
  approval_status?: string | null;
  vehicle_type?: string | null;
};

const driverExtendedSelect =
  "id,status,latitude,longitude,current_latitude,current_longitude,is_online,last_location_at,vehicle_type,approval_status";

const driverBaseSelect = "id,status,latitude,longitude";

function normalizeStatus(status?: string | null) {
  return status?.trim().toLowerCase() || "unknown";
}

function isDriverOnline(status?: string | null) {
  const normalized = normalizeStatus(status);
  return !normalized.includes("offline") && !normalized.includes("inactive");
}

function isVisibleOnlineDriver(driver: Driver) {
  const statusOnline = isDriverOnline(driver.status);
  if (!statusOnline) return false;
  return Boolean(driver.is_online || statusOnline);
}

function driverCoordinates(driver: Driver) {
  const lat = driver.current_latitude ?? driver.latitude;
  const lng = driver.current_longitude ?? driver.longitude;
  return typeof lat === "number" && Number.isFinite(lat) && typeof lng === "number" && Number.isFinite(lng)
    ? { lat, lng }
    : null;
}

function normalizeDriverForMap(driver: Driver): Driver {
  const currentLatitude = driver.current_latitude ?? driver.latitude ?? null;
  const currentLongitude = driver.current_longitude ?? driver.longitude ?? null;
  const status = driver.status ?? "offline";
  return {
    ...driver,
    status,
    vehicle_type: driver.vehicle_type ?? "bike",
    is_online: isDriverOnline(status) || driver.is_online === true,
    latitude: currentLatitude,
    longitude: currentLongitude
  };
}

function DriverStatusBadge({ status }: { status?: string | null }) {
  const normalized = normalizeStatus(status);
  const className =
    normalized.includes("available") || normalized.includes("active") || normalized.includes("online")
      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-500"
      : normalized.includes("busy") || normalized.includes("delivery") || normalized.includes("transit")
        ? "border-primary/40 bg-primary/10 text-primary"
        : normalized.includes("offline")
          ? "border-zinc-500/40 bg-zinc-500/10 text-muted-foreground"
          : "border-sky-500/40 bg-sky-500/10 text-sky-500";

  return <Badge className={className}>{status?.replaceAll("_", " ") || "Unknown"}</Badge>;
}

function vehicleLabel(driver: Driver) {
  return transportationTypeLabel(driver.vehicle_type);
}

function publicFleetLabel(driver: Driver) {
  return `Fly Rider ${String(driver.id).padStart(3, "0")}`;
}

function lastLocationLabel(value?: string | null) {
  if (!value) return "Live location ready";
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return "Live location ready";
  const minutes = Math.max(0, Math.round((Date.now() - timestamp) / 60000));
  if (minutes < 1) return "Updated just now";
  if (minutes === 1) return "Updated 1 min ago";
  if (minutes < 60) return `Updated ${minutes} mins ago`;
  return "Live position synced";
}

function vehicleMarkerKind(driver: Driver) {
  const vehicle = String(driver.vehicle_type ?? "").toLowerCase();
  if (vehicle.includes("warehouse") || vehicle.includes("hub")) return "hub";
  return transportationMarkerKind(vehicle);
}

function driverIconFor(driver: Driver) {
  const kind = vehicleMarkerKind(driver);
  const iconHtml = kind === "truck" ? "&#128666;" : kind === "van" ? "&#128656;" : kind === "hub" ? "&#127970;" : "&#128757;";
  return L.divIcon({
    html: `<span class="fly-driver-marker-icon">${iconHtml}</span>`,
    className: `fly-driver-marker fly-driver-marker-${kind} ${isVisibleOnlineDriver(driver) ? "fly-driver-marker-online" : "fly-driver-marker-offline"}`,
    iconSize: [40, 40],
    iconAnchor: [20, 20],
    popupAnchor: [0, -20]
  });
}

export default function MapView() {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [scopeReady, setScopeReady] = useState(false);

  const visibleDrivers = useMemo(
    () => drivers.filter((driver) => isVisibleOnlineDriver(driver) && driverCoordinates(driver)),
    [drivers]
  );
  const missingLocationCount = drivers.filter((driver) => isVisibleOnlineDriver(driver) && !driverCoordinates(driver)).length;
  const onlineDrivers = visibleDrivers.length;

  useEffect(() => {
    let mounted = true;
    fetch("/api/realtime/scope?public=1")
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { companyId?: string | null } | null) => {
        if (mounted) setCompanyId(data?.companyId ?? null);
      })
      .catch(() => {
        if (mounted) setCompanyId(null);
      })
      .finally(() => {
        if (mounted) setScopeReady(true);
      });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!scopeReady) return;

    let mounted = true;

    async function fetchFleet(options?: { silent?: boolean }) {
      const supabase = getSupabaseBrowser();
      if (!supabase) {
        setError("Live map service is temporarily unavailable.");
        setLoading(false);
        return;
      }
      if (!options?.silent) setLoading(true);
      setError(null);

      let driversQuery = supabase.from("drivers").select(driverExtendedSelect).order("id", { ascending: true }).limit(500);
      if (companyId) driversQuery = driversQuery.eq("company_id", companyId);
      const driversResult = await driversQuery;

      if (!mounted) return;

      let driverRows = driversResult.data as Driver[] | null;
      let driverError = driversResult.error;
      if (driverError && missingDriverColumn(driverError)) {
        const fallbackDrivers = await supabase.from("drivers").select(driverBaseSelect).order("id", { ascending: true }).limit(500);
        driverRows = fallbackDrivers.data as Driver[] | null;
        driverError = fallbackDrivers.error;
      }

      if (driverError) {
        setError(driverError.message);
      } else {
        setDrivers(((driverRows ?? []) as Driver[]).map(normalizeDriverForMap));
      }

      if (!options?.silent) setLoading(false);
    }

    void fetchFleet();
    const fallbackPolling = window.setInterval(() => {
      void fetchFleet({ silent: true });
    }, 20000);

    const supabase = getSupabaseBrowser();
    if (!supabase) {
      return () => {
        mounted = false;
        window.clearInterval(fallbackPolling);
      };
    }

    const driverChangeFilter = companyId
      ? { event: "*" as const, schema: "public", table: "drivers", filter: `company_id=eq.${companyId}` }
      : { event: "*" as const, schema: "public", table: "drivers" };

    const channel = supabase
      .channel("fleet-live")
      .on("postgres_changes", driverChangeFilter, (payload) => {
        if (payload.eventType === "DELETE") {
          const oldDriver = payload.old as Pick<Driver, "id">;
          setDrivers((current) => current.filter((driver) => driver.id !== oldDriver.id));
          return;
        }

        const nextDriver = normalizeDriverForMap(payload.new as Driver);
        setDrivers((current) => {
          const exists = current.some((driver) => driver.id === nextDriver.id);
          if (exists) return current.map((driver) => (driver.id === nextDriver.id ? nextDriver : driver));
          return [...current, nextDriver].sort((a, b) => a.id - b.id);
        });
      })
      .subscribe();

    return () => {
      mounted = false;
      window.clearInterval(fallbackPolling);
      void supabase.removeChannel(channel);
    };
  }, [companyId, scopeReady]);

  return (
    <section className="grid gap-4 xl:grid-cols-[360px_1fr]">
      <Card className="glass order-2 xl:order-1 xl:max-h-[calc(100vh-9rem)] xl:overflow-y-auto">
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle>Active rider network</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">Online Fly Logistics riders currently sharing live position.</p>
            </div>
            <DriverStatusBadge status={`${onlineDrivers} live`} />
          </div>
        </CardHeader>
        <CardContent className="grid gap-3">
          {loading &&
            Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="rounded-md border p-4">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="mt-3 h-3 w-28" />
              </div>
            ))}

          {error && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
              Live rider updates are temporarily unavailable. Please refresh shortly.
            </div>
          )}

          {!loading && !error && visibleDrivers.length === 0 && (
            <div className="rounded-md border p-4 text-sm text-muted-foreground">
              No online riders with live coordinates are visible yet. Riders appear here once they are online and sharing location.
              {missingLocationCount > 0 ? ` ${missingLocationCount} online rider${missingLocationCount === 1 ? "" : "s"} still need a location sync.` : ""}
            </div>
          )}

          {visibleDrivers.map((driver) => {
            const coordinates = driverCoordinates(driver);
            if (!coordinates) return null;
            const displayName = publicFleetLabel(driver);
            return (
              <div key={driver.id} className="rounded-md border bg-background/45 p-4 transition hover:border-primary/40">
                <div className="flex items-start gap-3">
                  <div className="grid size-12 shrink-0 place-items-center rounded-md border bg-black text-sm font-black text-primary">
                    FL
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="truncate font-semibold">{displayName}</h3>
                        <p className="mt-1 text-xs text-muted-foreground">{vehicleLabel(driver)}</p>
                      </div>
                      <DriverStatusBadge status={driver.status} />
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Badge className="border-emerald-500/40 bg-emerald-500/10 text-emerald-500">Live position</Badge>
                      <Badge className="border-muted-foreground/25 bg-background/60 text-muted-foreground">{lastLocationLabel(driver.last_location_at)}</Badge>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card className="glass order-1 overflow-hidden xl:order-2">
        <div className="relative h-[58vh] min-h-[360px] sm:h-[64vh] sm:min-h-[460px] lg:h-[68vh] lg:min-h-[520px]">
          <MapContainer center={[6.5244, 3.3792]} zoom={11} className="h-full w-full">
            <TileLayer
              attribution="&copy; OpenStreetMap contributors"
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            {visibleDrivers.map((driver) => {
              const coordinates = driverCoordinates(driver);
              if (!coordinates) return null;
              const displayName = publicFleetLabel(driver);
              return (
                <Marker key={driver.id} position={[coordinates.lat, coordinates.lng]} icon={driverIconFor(driver)}>
                  <Popup>
                    <div className="min-w-52">
                      <strong>{displayName}</strong>
                      <div className="mt-2 text-xs opacity-80">{driver.status?.replaceAll("_", " ") ?? "unknown"}</div>
                      <div className="mt-3 rounded-md border border-white/15 p-2 text-xs">
                        <div className="font-semibold">{vehicleLabel(driver)}</div>
                        <div className="mt-1 opacity-70">{lastLocationLabel(driver.last_location_at)}</div>
                      </div>
                    </div>
                  </Popup>
                </Marker>
              );
            })}
          </MapContainer>
          <div className="pointer-events-none absolute left-3 right-3 top-3 rounded-md border border-white/15 bg-black/70 px-3 py-2 text-white shadow-2xl backdrop-blur sm:left-4 sm:right-auto sm:px-4 sm:py-3">
            <div className="text-xs uppercase tracking-[0.22em] text-primary">Live Rider Map</div>
            <div className="mt-1 text-sm font-semibold">Fly Logistics delivery coverage</div>
            <div className="mt-2 text-xs text-white/65">{visibleDrivers.length} online rider{visibleDrivers.length === 1 ? "" : "s"} visible</div>
          </div>
        </div>
      </Card>
    </section>
  );
}
