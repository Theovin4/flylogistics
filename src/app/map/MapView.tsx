"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { supabase } from "@/lib/supabase";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { CloudinaryUpload } from "@/components/cloudinary/cloudinary-upload";
import type { UploadedAsset } from "@/lib/cloudinary";

type Driver = {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  status: string;
  photo_url?: string | null;
};

function normalizeStatus(status: string) {
  return status?.trim().toLowerCase() || "unknown";
}

function DriverStatusBadge({ status }: { status: string }) {
  const normalized = normalizeStatus(status);
  const className =
    normalized.includes("available") || normalized.includes("active")
      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-500"
      : normalized.includes("busy") || normalized.includes("delivery") || normalized.includes("transit")
        ? "border-primary/40 bg-primary/10 text-primary"
        : normalized.includes("offline")
          ? "border-zinc-500/40 bg-zinc-500/10 text-muted-foreground"
          : "border-sky-500/40 bg-sky-500/10 text-sky-500";

  return <Badge className={className}>{status || "Unknown"}</Badge>;
}

export default function MapView() {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [photoSavingDriverId, setPhotoSavingDriverId] = useState<number | null>(null);

  const driverIcon = useMemo(
    () =>
      L.divIcon({
        html: "<span>FL</span>",
        className: "fly-driver-marker",
        iconSize: [38, 38],
        iconAnchor: [19, 19],
        popupAnchor: [0, -20]
      }),
    []
  );

  async function saveDriverPhoto(driverId: number, asset: UploadedAsset) {
    setPhotoSavingDriverId(driverId);
    const { data, error } = await supabase
      .from("drivers")
      .update({ photo_url: asset.secureUrl })
      .eq("id", driverId)
      .select("*")
      .single();

    setPhotoSavingDriverId(null);

    if (error) {
      throw new Error(error.message);
    }

    if (data) {
      setDrivers((current) => current.map((driver) => (driver.id === driverId ? (data as Driver) : driver)));
    }
  }

  useEffect(() => {
    let mounted = true;

    async function fetchDrivers() {
      setLoading(true);
      setError(null);
      const { data, error } = await supabase.from("drivers").select("*").order("id", { ascending: true });

      if (!mounted) return;

      if (error) {
        setError(error.message);
      } else {
        setDrivers((data as Driver[]).filter((driver) => Number.isFinite(driver.latitude) && Number.isFinite(driver.longitude)));
      }
      setLoading(false);
    }

    fetchDrivers();

    const channel = supabase
      .channel("drivers-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "drivers" }, (payload) => {
        if (payload.eventType === "DELETE") {
          const oldDriver = payload.old as Pick<Driver, "id">;
          setDrivers((current) => current.filter((driver) => driver.id !== oldDriver.id));
          return;
        }

        const nextDriver = payload.new as Driver;
        if (!Number.isFinite(nextDriver.latitude) || !Number.isFinite(nextDriver.longitude)) return;
        setDrivers((current) => {
          const exists = current.some((driver) => driver.id === nextDriver.id);
          if (exists) return current.map((driver) => (driver.id === nextDriver.id ? nextDriver : driver));
          return [...current, nextDriver].sort((a, b) => a.id - b.id);
        });
      })
      .subscribe();

    return () => {
      mounted = false;
      void supabase.removeChannel(channel);
    };
  }, []);

  return (
    <section className="grid gap-5 lg:grid-cols-[360px_1fr]">
      <Card className="glass order-2 lg:order-1">
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle>Driver network</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">Realtime Supabase fleet updates</p>
            </div>
            <DriverStatusBadge status={`${drivers.length} live`} />
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
              Could not load drivers: {error}
            </div>
          )}

          {!loading && !error && drivers.length === 0 && (
            <div className="rounded-md border p-4 text-sm text-muted-foreground">
              No drivers found. Add rows to the `drivers` table with `name`, `latitude`, `longitude`, and `status`.
            </div>
          )}

          {drivers.map((driver) => (
            <div key={driver.id} className="rounded-md border bg-background/45 p-4 transition hover:border-primary/40">
              <div className="flex items-start gap-3">
                <div className="relative size-12 overflow-hidden rounded-md border bg-black">
                  {driver.photo_url ? (
                    <Image src={driver.photo_url} alt={`${driver.name} profile photo`} width={96} height={96} className="h-full w-full object-cover" />
                  ) : (
                    <div className="grid h-full w-full place-items-center text-sm font-black text-primary">FL</div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="truncate font-semibold">{driver.name}</h3>
                      <p className="mt-1 font-mono text-xs text-muted-foreground">
                        {driver.latitude.toFixed(4)}, {driver.longitude.toFixed(4)}
                      </p>
                    </div>
                    <DriverStatusBadge status={driver.status} />
                  </div>
                  <div className="mt-3">
                    <CloudinaryUpload
                      folder="fly-logistics/drivers"
                      label={photoSavingDriverId === driver.id ? "Saving photo" : driver.photo_url ? "Change photo" : "Upload photo"}
                      onUploaded={(asset) => saveDriverPhoto(driver.id, asset)}
                    />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="glass order-1 overflow-hidden lg:order-2">
        <div className="relative h-[68vh] min-h-[520px]">
          <MapContainer center={[6.5244, 3.3792]} zoom={11} className="h-full w-full">
            <TileLayer
              attribution="&copy; OpenStreetMap contributors"
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            {drivers.map((driver) => (
              <Marker key={driver.id} position={[driver.latitude, driver.longitude]} icon={driverIcon}>
                <Popup>
                  <div className="min-w-44">
                    {driver.photo_url && (
                      <Image src={driver.photo_url} alt={`${driver.name} profile photo`} width={240} height={140} className="mb-3 h-24 w-full rounded-md object-cover" />
                    )}
                    <strong>{driver.name}</strong>
                    <div className="mt-2 text-xs opacity-80">{driver.status}</div>
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>
          <div className="pointer-events-none absolute left-4 top-4 rounded-md border border-white/15 bg-black/70 px-4 py-3 text-white shadow-2xl backdrop-blur">
            <div className="text-xs uppercase tracking-[0.22em] text-primary">Live Map</div>
            <div className="mt-1 text-sm font-semibold">Lagos operations grid</div>
          </div>
        </div>
      </Card>
    </section>
  );
}
