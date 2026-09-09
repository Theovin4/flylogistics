"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  RefreshCw,
  ShieldCheck,
  ShieldX,
  Trash2,
  Truck,
  UserPlus,
  Wifi,
  WifiOff
} from "lucide-react";
import { flyError, flySuccess } from "@/components/feedback/fly-toast";
import { driverTransportationOptions, transportationTypeLabel } from "@/lib/driver-data";
import { getSupabaseBrowser } from "@/lib/supabase";
import type { DriverSummary } from "@/lib/shipments";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialForm = {
  name: "",
  phone: "",
  status: "offline",
  approvalStatus: "approved",
  vehicleType: "bike",
  latitude: "6.5244",
  longitude: "3.3792"
};

const driverStatuses = ["offline", "available", "online", "busy", "in_transit"] as const;

type DriverEditDraft = {
  name: string;
  phone: string;
  approvalStatus: string;
  vehicleType: string;
  vehiclePlateNumber: string;
  vehicleModel: string;
  latitude: string;
  longitude: string;
  photoUrl: string;
  rating: string;
};

type ApiErrorResponse = {
  error?: string;
  warning?: string;
  activeShipments?: { tracking_id?: string | null; trackingId?: string | null; status?: string | null }[];
};

function apiErrorMessage(data: ApiErrorResponse, fallback: string) {
  const activeShipments = data.activeShipments ?? [];
  const shipmentList = activeShipments
    .map((shipment) => shipment.tracking_id ?? shipment.trackingId)
    .filter(Boolean)
    .join(", ");
  return `${data.error ?? data.warning ?? fallback}${shipmentList ? ` Active shipments: ${shipmentList}.` : ""}`;
}

function driverEditDraftFromRecord(driver: DriverSummary): DriverEditDraft {
  return {
    name: driver.name ?? "",
    phone: driver.phone ?? "",
    approvalStatus: driver.approval_status ?? "approved",
    vehicleType: driver.vehicle_type ?? "bike",
    vehiclePlateNumber: driver.vehicle_plate_number ?? "",
    vehicleModel: driver.vehicle_model ?? "",
    latitude: driver.latitude !== undefined && driver.latitude !== null ? String(driver.latitude) : "",
    longitude: driver.longitude !== undefined && driver.longitude !== null ? String(driver.longitude) : "",
    photoUrl: driver.photo_url ?? "",
    rating: driver.rating !== undefined && driver.rating !== null ? String(driver.rating) : "4.8"
  };
}

function approvalClass(status?: string | null) {
  if (status === "approved") return "border-emerald-500/40 bg-emerald-500/10 text-emerald-500";
  if (status === "rejected" || status === "suspended") return "border-destructive/40 bg-destructive/10 text-destructive";
  return "border-primary/40 bg-primary/10 text-primary";
}

function onlineClass(status?: string | null) {
  if (String(status ?? "").toLowerCase().includes("offline")) {
    return "border-muted-foreground/30 bg-background/60 text-muted-foreground";
  }
  return "border-emerald-500/40 bg-emerald-500/10 text-emerald-500";
}

function formatDate(value?: string | null) {
  if (!value) return "Not recorded";
  return new Date(value).toLocaleString();
}

export function AdminDriverManager() {
  const [drivers, setDrivers] = useState<DriverSummary[]>([]);
  const [form, setForm] = useState(initialForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [updatingDriverId, setUpdatingDriverId] = useState<string | null>(null);
  const [deletingDriverId, setDeletingDriverId] = useState<string | null>(null);
  const [filters, setFilters] = useState({ query: "", status: "all", approvalStatus: "all", vehicleType: "all" });
  const [statusDrafts, setStatusDrafts] = useState<Record<string, string>>({});
  const [editDrafts, setEditDrafts] = useState<Record<string, DriverEditDraft>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const authHeaders = useCallback(async () => {
    const supabase = getSupabaseBrowser();
    const { data } = supabase ? await supabase.auth.getSession() : { data: { session: null } };
    return data.session?.access_token ? { Authorization: `Bearer ${data.session.access_token}` } : {};
  }, []);

  const authorizedFetch = useCallback(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const headers = new Headers(init.headers);
    const auth = await authHeaders();
    Object.entries(auth).forEach(([key, value]) => headers.set(key, value));
    return fetch(input, { ...init, headers });
  }, [authHeaders]);

  const loadDrivers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await authorizedFetch("/api/drivers");
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to load drivers.");
      setDrivers(data);
      setStatusDrafts(Object.fromEntries((data as DriverSummary[]).map((driver) => [String(driver.id), String(driver.status ?? "offline")])));
      setEditDrafts(Object.fromEntries((data as DriverSummary[]).map((driver) => [String(driver.id), driverEditDraftFromRecord(driver)])));
    } catch (err) {
      const nextError = err instanceof Error ? err.message : "Unable to load drivers.";
      setError(nextError);
      flyError("Unable to load drivers", nextError);
    } finally {
      setLoading(false);
    }
  }, [authorizedFetch]);

  useEffect(() => {
    void loadDrivers();
  }, [loadDrivers]);

  function updateField(field: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  const filteredDrivers = drivers.filter((driver) => {
    const query = filters.query.trim().toLowerCase();
    const matchesQuery = !query || [
      driver.name,
      driver.phone,
      driver.id,
      driver.vehicle_type,
      driver.vehicle_plate_number,
      driver.vehicle_model
    ].some((value) => String(value ?? "").toLowerCase().includes(query));
    const matchesStatus = filters.status === "all" || String(driver.status ?? "offline") === filters.status;
    const matchesApproval = filters.approvalStatus === "all" || String(driver.approval_status ?? "approved") === filters.approvalStatus;
    const matchesVehicle = filters.vehicleType === "all" || String(driver.vehicle_type ?? "bike") === filters.vehicleType;
    return matchesQuery && matchesStatus && matchesApproval && matchesVehicle;
  });

  async function createDriver(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const response = await authorizedFetch("/api/drivers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          phone: form.phone,
          status: form.status,
          approvalStatus: form.approvalStatus,
          vehicleType: form.vehicleType,
          latitude: Number(form.latitude),
          longitude: Number(form.longitude)
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to create driver.");
      setDrivers((current) => [data, ...current]);
      setStatusDrafts((current) => ({ ...current, [String(data.id)]: String(data.status ?? "offline") }));
      setEditDrafts((current) => ({ ...current, [String(data.id)]: driverEditDraftFromRecord(data) }));
      setForm(initialForm);
      const success = `${data.name} was added to the driver fleet.`;
      setMessage(success);
      flySuccess("Driver added", success);
    } catch (err) {
      const nextError = err instanceof Error ? err.message : "Unable to create driver.";
      setError(nextError);
      flyError("Unable to create driver", nextError);
    } finally {
      setSaving(false);
    }
  }

  async function updateDriver(driverId: number | string, updates: Record<string, unknown>, success: string) {
    setUpdatingDriverId(String(driverId));
    setError(null);
    setMessage(null);

    try {
      const response = await authorizedFetch(`/api/drivers/${encodeURIComponent(String(driverId))}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates)
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to update driver.");
      setDrivers((current) => current.map((driver) => (String(driver.id) === String(driverId) ? data : driver)));
      setStatusDrafts((current) => ({ ...current, [String(driverId)]: String(data.status ?? updates.status ?? "offline") }));
      setEditDrafts((current) => ({ ...current, [String(driverId)]: driverEditDraftFromRecord(data) }));
      setMessage(success);
      flySuccess("Driver updated", success);
    } catch (err) {
      const nextError = err instanceof Error ? err.message : "Unable to update driver.";
      setError(nextError);
      flyError("Unable to update driver", nextError);
    } finally {
      setUpdatingDriverId(null);
    }
  }

  async function deleteDriver(driver: DriverSummary) {
    const confirmed = window.confirm(`Delete driver profile for ${driver.name}? Active assigned shipments must be reassigned or completed first.`);
    if (!confirmed) return;

    setDeletingDriverId(String(driver.id));
    setError(null);
    setMessage(null);

    try {
      const response = await authorizedFetch(`/api/drivers/${encodeURIComponent(String(driver.id))}`, {
        method: "DELETE"
      });
      const data = (await response.json()) as ApiErrorResponse & { deletedLinkedAccount?: boolean };
      if (!response.ok) throw new Error(apiErrorMessage(data, "Unable to delete driver."));

      setDrivers((current) => current.filter((item) => String(item.id) !== String(driver.id)));
      setStatusDrafts((current) => {
        const next = { ...current };
        delete next[String(driver.id)];
        return next;
      });
      setEditDrafts((current) => {
        const next = { ...current };
        delete next[String(driver.id)];
        return next;
      });
      const success = data.warning ?? `${driver.name} was deleted from the driver database${data.deletedLinkedAccount ? " and linked login account." : "."}`;
      setMessage(success);
      flySuccess("Driver deleted", success);
    } catch (err) {
      const nextError = err instanceof Error ? err.message : "Unable to delete driver.";
      setError(nextError);
      flyError("Unable to delete driver", nextError);
    } finally {
      setDeletingDriverId(null);
    }
  }

  function updateEditDraft(driverId: number | string, field: keyof DriverEditDraft, value: string) {
    setEditDrafts((current) => ({
      ...current,
      [String(driverId)]: {
        ...(current[String(driverId)] ?? driverEditDraftFromRecord({ id: driverId, name: "" })),
        [field]: value
      }
    }));
  }

  async function saveDriverDetails(driver: DriverSummary) {
    const draft = editDrafts[String(driver.id)] ?? driverEditDraftFromRecord(driver);
    await updateDriver(driver.id, {
      name: draft.name,
      phone: draft.phone || null,
      approvalStatus: draft.approvalStatus,
      vehicleType: draft.vehicleType || "bike",
      vehiclePlateNumber: draft.vehiclePlateNumber || null,
      vehicleModel: draft.vehicleModel || null,
      latitude: draft.latitude ? Number(draft.latitude) : undefined,
      longitude: draft.longitude ? Number(draft.longitude) : undefined,
      photoUrl: draft.photoUrl || "",
      rating: draft.rating ? Number(draft.rating) : undefined
    }, `${draft.name || driver.name} details saved.`);
  }

  return (
    <section className="mt-8 grid gap-6">
      {message && (
        <div className="flex gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-500">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
          {message}
        </div>
      )}
      {error && (
        <div className="flex gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          {error}
        </div>
      )}

      <Card className="glass">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Truck className="size-5 text-primary" />
              Driver operations
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Create driver profiles, approve rider accounts, suspend unsafe accounts, and assign shipments from operations below.
            </p>
          </div>
          <Button type="button" variant="outline" onClick={loadDrivers} disabled={loading}>
            <RefreshCw className={loading ? "animate-spin" : ""} />
            Refresh
          </Button>
        </CardHeader>
        <CardContent className="grid gap-6">
          <form className="grid gap-4 rounded-md border bg-background/45 p-4" onSubmit={createDriver}>
            <div className="flex items-center gap-2">
              <UserPlus className="size-4 text-primary" />
              <h3 className="font-semibold">Create driver</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              Driver portal login uses the rider name or numeric user ID plus the saved phone number as password.
            </p>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-7">
              <div className="grid gap-2 xl:col-span-2">
                <Label htmlFor="driverName">Name</Label>
                <Input id="driverName" value={form.name} onChange={(event) => updateField("name", event.target.value)} required />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="driverPhone">Phone</Label>
                <Input id="driverPhone" value={form.phone} onChange={(event) => updateField("phone", event.target.value)} required />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="driverStatus">Status</Label>
                <select id="driverStatus" value={form.status} onChange={(event) => updateField("status", event.target.value)} className="h-10 rounded-md border bg-background/70 px-3 text-sm">
                  {driverStatuses.map((status) => (
                    <option key={status} value={status}>{status.replaceAll("_", " ")}</option>
                  ))}
                </select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="driverApproval">Approval</Label>
                <select id="driverApproval" value={form.approvalStatus} onChange={(event) => updateField("approvalStatus", event.target.value)} className="h-10 rounded-md border bg-background/70 px-3 text-sm">
                  {["approved", "pending", "rejected", "suspended"].map((status) => (
                    <option key={status} value={status}>{status}</option>
                  ))}
                </select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="driverVehicleType">Vehicle</Label>
                <select id="driverVehicleType" value={form.vehicleType} onChange={(event) => updateField("vehicleType", event.target.value)} className="h-10 rounded-md border bg-background/70 px-3 text-sm">
                  {driverTransportationOptions.map((type) => (
                    <option key={type.value} value={type.value}>{type.label}</option>
                  ))}
                </select>
              </div>
              <Button type="submit" disabled={saving} className="w-full self-end">
                {saving ? <Loader2 className="animate-spin" /> : <UserPlus />}
                Add driver
              </Button>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="driverLatitude">Starting latitude</Label>
                <Input id="driverLatitude" inputMode="decimal" value={form.latitude} onChange={(event) => updateField("latitude", event.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="driverLongitude">Starting longitude</Label>
                <Input id="driverLongitude" inputMode="decimal" value={form.longitude} onChange={(event) => updateField("longitude", event.target.value)} />
              </div>
            </div>
          </form>

          <div className="grid gap-3 rounded-md border bg-background/35 p-4 md:grid-cols-4">
            <label className="grid gap-2 text-sm font-medium md:col-span-2">
              Search drivers
              <Input
                value={filters.query}
                onChange={(event) => setFilters((current) => ({ ...current, query: event.target.value }))}
                placeholder="Name, phone, ID, plate, vehicle"
              />
            </label>
            <label className="grid gap-2 text-sm font-medium">
              Status
              <select value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))} className="h-10 rounded-md border bg-background/70 px-3 text-sm">
                <option value="all">All statuses</option>
                {driverStatuses.map((status) => (
                  <option key={status} value={status}>{status.replaceAll("_", " ")}</option>
                ))}
              </select>
            </label>
            <label className="grid gap-2 text-sm font-medium">
              Approval
              <select value={filters.approvalStatus} onChange={(event) => setFilters((current) => ({ ...current, approvalStatus: event.target.value }))} className="h-10 rounded-md border bg-background/70 px-3 text-sm">
                <option value="all">All approvals</option>
                {["approved", "pending", "rejected", "suspended"].map((status) => (
                  <option key={status} value={status}>{status}</option>
                ))}
              </select>
            </label>
            <label className="grid gap-2 text-sm font-medium">
              Transportation type
              <select value={filters.vehicleType} onChange={(event) => setFilters((current) => ({ ...current, vehicleType: event.target.value }))} className="h-10 rounded-md border bg-background/70 px-3 text-sm">
                <option value="all">All types</option>
                {driverTransportationOptions.map((type) => (
                  <option key={type.value} value={type.value}>{type.label}</option>
                ))}
              </select>
            </label>
            <p className="text-xs text-muted-foreground md:col-span-3">Showing {filteredDrivers.length} of {drivers.length} drivers.</p>
          </div>

          {loading && <div className="rounded-md border p-4 text-sm text-muted-foreground">Loading drivers...</div>}
          {!loading && drivers.length === 0 && <div className="rounded-md border p-4 text-sm text-muted-foreground">No drivers yet. Create a driver profile above.</div>}
          {!loading && drivers.length > 0 && filteredDrivers.length === 0 && <div className="rounded-md border p-4 text-sm text-muted-foreground">No drivers match these filters.</div>}

          <div className="grid gap-3 xl:grid-cols-2">
            {filteredDrivers.map((driver) => {
              const busy = updatingDriverId === String(driver.id);
              const deleting = deletingDriverId === String(driver.id);
              const statusDraft = statusDrafts[String(driver.id)] ?? String(driver.status ?? "offline");
              const statusChanged = statusDraft !== String(driver.status ?? "offline");
              const editDraft = editDrafts[String(driver.id)] ?? driverEditDraftFromRecord(driver);
              return (
                <div key={String(driver.id)} className="rounded-md border bg-background/45 p-4">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-lg font-bold">{driver.name}</h3>
                        <Badge className={approvalClass(driver.approval_status)}>{driver.approval_status ?? "approved"}</Badge>
                        <Badge className={onlineClass(driver.status)}>{driver.status ?? "offline"}</Badge>
                      </div>
                      <p className="mt-2 text-sm text-muted-foreground">{driver.phone ?? "No phone number"}</p>
                      <p className="mt-1 text-xs font-semibold uppercase tracking-[0.18em] text-primary">{transportationTypeLabel(driver.vehicle_type)}</p>
                      <p className="mt-1 text-xs font-semibold uppercase tracking-[0.2em] text-primary">User ID {driver.id}</p>
                      <p className="mt-1 font-mono text-xs text-muted-foreground">
                        {driver.latitude ?? "?"}, {driver.longitude ?? "?"}
                      </p>
                      <p className="mt-2 text-xs text-muted-foreground">Last seen {formatDate(driver.last_seen_at)}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {String(driver.status ?? "").toLowerCase().includes("offline") ? <WifiOff className="size-4 text-muted-foreground" /> : <Wifi className="size-4 text-emerald-500" />}
                      <span className="font-mono text-sm">{Number(driver.rating ?? 4.8).toFixed(1)}</span>
                    </div>
                  </div>
                  <div className="mt-4 grid gap-3 rounded-md border bg-background/35 p-3 sm:grid-cols-[1fr_auto] sm:items-end">
                    <label className="grid gap-2 text-sm font-medium">
                      Operational status
                      <select
                        value={statusDraft}
                        onChange={(event) => setStatusDrafts((current) => ({ ...current, [String(driver.id)]: event.target.value }))}
                        className="h-10 rounded-md border bg-background/70 px-3 text-sm"
                      >
                        {driverStatuses.map((status) => (
                          <option key={status} value={status}>{status.replaceAll("_", " ")}</option>
                        ))}
                      </select>
                    </label>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={!statusChanged || busy || deleting}
                      onClick={() => void updateDriver(driver.id, { status: statusDraft }, `${driver.name} status changed to ${statusDraft.replaceAll("_", " ")}.`)}
                      className="w-full sm:w-auto"
                    >
                      {busy ? <Loader2 className="animate-spin" /> : <RefreshCw />}
                      Save status
                    </Button>
                  </div>
                  <div className="mt-4 grid gap-3 rounded-md border bg-background/35 p-3">
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <h4 className="text-sm font-semibold">Rider profile details</h4>
                        <p className="text-xs text-muted-foreground">Edit the profile shown across dispatch, live map, and assignments.</p>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        disabled={busy || deleting}
                        onClick={() => void saveDriverDetails(driver)}
                        className="w-full sm:w-auto"
                      >
                        {busy ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
                        Save details
                      </Button>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                      <label className="grid gap-2 text-sm font-medium">
                        Name
                        <Input value={editDraft.name} onChange={(event) => updateEditDraft(driver.id, "name", event.target.value)} disabled={busy || deleting} />
                      </label>
                      <label className="grid gap-2 text-sm font-medium">
                        Phone
                        <Input value={editDraft.phone} onChange={(event) => updateEditDraft(driver.id, "phone", event.target.value)} disabled={busy || deleting} />
                      </label>
                      <label className="grid gap-2 text-sm font-medium">
                        Approval
                        <select
                          value={editDraft.approvalStatus}
                          onChange={(event) => updateEditDraft(driver.id, "approvalStatus", event.target.value)}
                          className="h-10 rounded-md border bg-background/70 px-3 text-sm"
                          disabled={busy || deleting}
                        >
                          {["approved", "pending", "rejected", "suspended"].map((status) => (
                            <option key={status} value={status}>{status}</option>
                          ))}
                        </select>
                      </label>
                      <label className="grid gap-2 text-sm font-medium">
                        Vehicle type
                        <select
                          value={editDraft.vehicleType}
                          onChange={(event) => updateEditDraft(driver.id, "vehicleType", event.target.value)}
                          className="h-10 rounded-md border bg-background/70 px-3 text-sm"
                          disabled={busy || deleting}
                        >
                          {driverTransportationOptions.map((type) => (
                            <option key={type.value} value={type.value}>{type.label}</option>
                          ))}
                        </select>
                      </label>
                      <label className="grid gap-2 text-sm font-medium">
                        Plate number
                        <Input value={editDraft.vehiclePlateNumber} onChange={(event) => updateEditDraft(driver.id, "vehiclePlateNumber", event.target.value)} disabled={busy || deleting} />
                      </label>
                      <label className="grid gap-2 text-sm font-medium">
                        Vehicle model
                        <Input value={editDraft.vehicleModel} onChange={(event) => updateEditDraft(driver.id, "vehicleModel", event.target.value)} disabled={busy || deleting} />
                      </label>
                      <label className="grid gap-2 text-sm font-medium">
                        Latitude
                        <Input inputMode="decimal" value={editDraft.latitude} onChange={(event) => updateEditDraft(driver.id, "latitude", event.target.value)} disabled={busy || deleting} />
                      </label>
                      <label className="grid gap-2 text-sm font-medium">
                        Longitude
                        <Input inputMode="decimal" value={editDraft.longitude} onChange={(event) => updateEditDraft(driver.id, "longitude", event.target.value)} disabled={busy || deleting} />
                      </label>
                      <label className="grid gap-2 text-sm font-medium md:col-span-2">
                        Photo URL
                        <Input value={editDraft.photoUrl} onChange={(event) => updateEditDraft(driver.id, "photoUrl", event.target.value)} disabled={busy || deleting} />
                      </label>
                      <label className="grid gap-2 text-sm font-medium">
                        Rating
                        <Input inputMode="decimal" value={editDraft.rating} onChange={(event) => updateEditDraft(driver.id, "rating", event.target.value)} disabled={busy || deleting} />
                      </label>
                    </div>
                  </div>
                  <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                    <Button
                      type="button"
                      variant="outline"
                      disabled={busy || deleting || driver.approval_status === "approved"}
                      onClick={() => void updateDriver(driver.id, { approvalStatus: "approved", status: "available" }, `${driver.name} approved and set available.`)}
                    >
                      {busy ? <Loader2 className="animate-spin" /> : <ShieldCheck />}
                      Approve
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={busy || deleting || driver.approval_status === "rejected"}
                      onClick={() => void updateDriver(driver.id, { approvalStatus: "rejected" }, `${driver.name} rejected.`)}
                    >
                      {busy ? <Loader2 className="animate-spin" /> : <ShieldX />}
                      Reject
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={busy || deleting || driver.approval_status === "suspended"}
                      onClick={() => void updateDriver(driver.id, { approvalStatus: "suspended" }, `${driver.name} suspended.`)}
                    >
                      {busy ? <Loader2 className="animate-spin" /> : <WifiOff />}
                      Suspend
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      disabled={busy || deleting}
                      onClick={() => void deleteDriver(driver)}
                    >
                      {deleting ? <Loader2 className="animate-spin" /> : <Trash2 />}
                      Delete
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
