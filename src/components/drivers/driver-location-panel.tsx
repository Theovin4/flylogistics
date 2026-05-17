"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, LocateFixed, Play, Square, Wifi, WifiOff } from "lucide-react";
import { getSupabaseBrowser } from "@/lib/supabase";
import type { DriverSummary } from "@/lib/shipments";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const statusOptions = ["online", "available", "in_transit", "busy", "offline"] as const;
const defaultLocation = { latitude: "6.5244", longitude: "3.3792" };

function onlineClass(status?: string | null) {
  const normalized = String(status ?? "").toLowerCase();
  return normalized.includes("offline")
    ? "border-zinc-500/40 bg-zinc-500/10 text-muted-foreground"
    : "border-emerald-500/40 bg-emerald-500/10 text-emerald-500";
}

function normalizeDriverStatus(status?: string | null): (typeof statusOptions)[number] {
  const normalized = String(status ?? "").toLowerCase();
  if (normalized.includes("offline")) return "offline";
  if (normalized.includes("transit") || normalized.includes("delivery")) return "in_transit";
  if (normalized.includes("busy")) return "busy";
  if (normalized.includes("available")) return "available";
  return "online";
}

export function DriverLocationPanel() {
  const [drivers, setDrivers] = useState<DriverSummary[]>([]);
  const [selectedDriverId, setSelectedDriverId] = useState("");
  const [latitude, setLatitude] = useState(defaultLocation.latitude);
  const [longitude, setLongitude] = useState(defaultLocation.longitude);
  const [status, setStatus] = useState<(typeof statusOptions)[number]>("online");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const coordinatesRef = useRef({ latitude: defaultLocation.latitude, longitude: defaultLocation.longitude });

  useEffect(() => {
    coordinatesRef.current = { latitude, longitude };
  }, [latitude, longitude]);

  const selectedDriver = drivers.find((driver) => String(driver.id) === selectedDriverId);

  const authHeaders = useCallback(async (): Promise<Record<string, string>> => {
    const supabase = getSupabaseBrowser();
    const { data } = supabase ? await supabase.auth.getSession() : { data: { session: null } };
    return data.session?.access_token ? { Authorization: `Bearer ${data.session.access_token}` } : {};
  }, []);

  const loadDrivers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const headers = await authHeaders();
      const response = await fetch("/api/drivers", { headers });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to load drivers.");
      setDrivers(data);
      const first = data[0] as DriverSummary | undefined;
      if (first && !selectedDriverId) {
        setSelectedDriverId(String(first.id));
        setLatitude(String(first.latitude ?? defaultLocation.latitude));
        setLongitude(String(first.longitude ?? defaultLocation.longitude));
        setStatus(normalizeDriverStatus(first.status));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load drivers.");
    } finally {
      setLoading(false);
    }
  }, [authHeaders, selectedDriverId]);

  useEffect(() => {
    void loadDrivers();
  }, [loadDrivers]);

  function selectDriver(driverId: string) {
    const driver = drivers.find((item) => String(item.id) === driverId);
    setSelectedDriverId(driverId);
    setLatitude(String(driver?.latitude ?? defaultLocation.latitude));
    setLongitude(String(driver?.longitude ?? defaultLocation.longitude));
    setStatus(normalizeDriverStatus(driver?.status));
  }

  const saveLocation = useCallback(async (next?: { latitude: string; longitude: string; status?: string }) => {
    if (!selectedDriverId) return;
    const nextLatitude = Number(next?.latitude ?? coordinatesRef.current.latitude);
    const nextLongitude = Number(next?.longitude ?? coordinatesRef.current.longitude);
    const nextStatus = next?.status ?? status;

    if (!Number.isFinite(nextLatitude) || !Number.isFinite(nextLongitude)) {
      setError("Latitude and longitude must be valid numbers.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const headers = new Headers({ "Content-Type": "application/json" });
      const auth = await authHeaders();
      Object.entries(auth).forEach(([key, value]) => headers.set(key, value));
      const response = await fetch(`/api/drivers/${encodeURIComponent(selectedDriverId)}/location`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ latitude: nextLatitude, longitude: nextLongitude, status: nextStatus })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to update driver location.");
      setDrivers((current) => current.map((driver) => (String(driver.id) === selectedDriverId ? data.driver : driver)));
      setMessage(`Location synced for ${data.driver.name}. ${data.updatedShipments?.length ?? 0} shipment positions updated.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update driver location.");
      setSimulating(false);
    } finally {
      setSaving(false);
    }
  }, [authHeaders, selectedDriverId, status]);

  const simulateStep = useCallback(async () => {
    const currentLatitude = Number(coordinatesRef.current.latitude || defaultLocation.latitude);
    const currentLongitude = Number(coordinatesRef.current.longitude || defaultLocation.longitude);
    const nextLatitude = (currentLatitude + 0.0012).toFixed(6);
    const nextLongitude = (currentLongitude + 0.0016).toFixed(6);
    setLatitude(nextLatitude);
    setLongitude(nextLongitude);
    setStatus("in_transit");
    await saveLocation({ latitude: nextLatitude, longitude: nextLongitude, status: "in_transit" });
  }, [saveLocation]);

  useEffect(() => {
    if (!simulating) return;
    const interval = window.setInterval(() => {
      void simulateStep();
    }, 3500);
    return () => window.clearInterval(interval);
  }, [simulateStep, simulating]);

  function useDeviceLocation() {
    if (!navigator.geolocation) {
      setError("Geolocation is not available in this browser.");
      return;
    }

    setSaving(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const nextLatitude = position.coords.latitude.toFixed(6);
        const nextLongitude = position.coords.longitude.toFixed(6);
        setLatitude(nextLatitude);
        setLongitude(nextLongitude);
        void saveLocation({ latitude: nextLatitude, longitude: nextLongitude, status });
      },
      (locationError) => {
        setSaving(false);
        setError(locationError.message);
      },
      { enableHighAccuracy: true, maximumAge: 15000, timeout: 10000 }
    );
  }

  return (
    <Card className="glass mt-8">
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <LocateFixed className="size-5 text-primary" />
              Live driver location
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">Authenticated location updates sync driver markers and assigned shipment positions in realtime.</p>
          </div>
          <Badge className={onlineClass(status)}>{status.replaceAll("_", " ")}</Badge>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4">
        {loading && <div className="rounded-md border p-4 text-sm text-muted-foreground">Loading driver records...</div>}
        {!loading && drivers.length === 0 && <div className="rounded-md border p-4 text-sm text-muted-foreground">No linked driver record is available for this account.</div>}

        {drivers.length > 0 && (
          <>
            <div className="grid gap-4 lg:grid-cols-[1fr_0.8fr_0.8fr_0.8fr]">
              <div className="grid gap-2">
                <Label htmlFor="liveDriver">Driver</Label>
                <select id="liveDriver" value={selectedDriverId} onChange={(event) => selectDriver(event.target.value)} className="h-11 rounded-md border bg-background/70 px-3 text-sm">
                  {drivers.map((driver) => (
                    <option key={String(driver.id)} value={String(driver.id)}>{driver.name}</option>
                  ))}
                </select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="driverLatitude">Latitude</Label>
                <Input id="driverLatitude" value={latitude} onChange={(event) => setLatitude(event.target.value)} inputMode="decimal" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="driverLongitude">Longitude</Label>
                <Input id="driverLongitude" value={longitude} onChange={(event) => setLongitude(event.target.value)} inputMode="decimal" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="driverStatus">Status</Label>
                <select id="driverStatus" value={status} onChange={(event) => setStatus(event.target.value as (typeof statusOptions)[number])} className="h-11 rounded-md border bg-background/70 px-3 text-sm">
                  {statusOptions.map((option) => (
                    <option key={option} value={option}>{option.replaceAll("_", " ")}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <Button type="button" onClick={() => void saveLocation()} disabled={saving || !selectedDriverId}>
                {saving ? <Loader2 className="animate-spin" /> : <LocateFixed />}
                Sync location
              </Button>
              <Button type="button" variant="outline" onClick={useDeviceLocation} disabled={saving || !selectedDriverId}>
                <Wifi />
                Use device location
              </Button>
              <Button type="button" variant="outline" onClick={() => setSimulating((current) => !current)} disabled={saving || !selectedDriverId}>
                {simulating ? <Square /> : <Play />}
                {simulating ? "Stop simulation" : "Simulate movement"}
              </Button>
              <Button type="button" variant="outline" onClick={() => { setStatus("offline"); void saveLocation({ latitude, longitude, status: "offline" }); }} disabled={saving || !selectedDriverId}>
                <WifiOff />
                Set offline
              </Button>
            </div>

            {selectedDriver && (
              <div className="rounded-md border bg-background/40 p-3 text-sm text-muted-foreground">
                {selectedDriver.name} currently reports {selectedDriver.latitude ?? "unknown"}, {selectedDriver.longitude ?? "unknown"}.
              </div>
            )}
          </>
        )}

        {message && <div className="flex gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-500"><CheckCircle2 className="size-4" />{message}</div>}
        {error && <div className="flex gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"><AlertTriangle className="size-4" />{error}</div>}
      </CardContent>
    </Card>
  );
}
