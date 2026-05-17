"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { CheckCircle2, Clock3, Loader2, MapPin, PackagePlus, RefreshCw, Truck } from "lucide-react";
import { getSupabaseBrowser } from "@/lib/supabase";
import { shipmentStatuses, type DriverSummary, type ShipmentRecord, type ShipmentStatus } from "@/lib/shipments";
import type { UploadedAsset } from "@/lib/cloudinary";
import { CloudinaryUpload } from "@/components/cloudinary/cloudinary-upload";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialShipmentForm = {
  customerName: "",
  customerEmail: "",
  customerPhone: "",
  pickupAddress: "",
  deliveryAddress: "",
  packageType: "",
  weightKg: "5",
  urgency: "standard",
  status: "BOOKED" as ShipmentStatus,
  driverId: "",
  eta: ""
};

export function AdminShipmentManager() {
  const [shipments, setShipments] = useState<ShipmentRecord[]>([]);
  const [drivers, setDrivers] = useState<DriverSummary[]>([]);
  const [form, setForm] = useState(initialShipmentForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [updatingTrackingId, setUpdatingTrackingId] = useState<string | null>(null);
  const [eventDrafts, setEventDrafts] = useState<Record<string, { label: string; location: string }>>({});
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

  const loadShipments = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await authorizedFetch("/api/shipments");
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to load shipments.");
      setShipments(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load shipments.");
    } finally {
      setLoading(false);
    }
  }, [authorizedFetch]);

  const loadDrivers = useCallback(async () => {
    const supabase = getSupabaseBrowser();
    if (!supabase) {
      setDrivers([]);
      return;
    }
    const { data } = await supabase.from("drivers").select("id,name,status,phone,photo_url,latitude,longitude").order("id", { ascending: true });
    setDrivers((data as DriverSummary[] | null) ?? []);
  }, []);

  useEffect(() => {
    void loadShipments();
    void loadDrivers();
  }, [loadDrivers, loadShipments]);

  function updateField(field: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function createShipment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const response = await authorizedFetch("/api/shipments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, weightKg: Number(form.weightKg) })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to create shipment.");
      setShipments((current) => [data, ...current]);
      setForm(initialShipmentForm);
      setMessage(`Shipment ${data.tracking_id} created.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create shipment.");
    } finally {
      setSaving(false);
    }
  }

  async function updateShipment(
    trackingId: string,
    updates: { status?: ShipmentStatus; driverId?: string; timelineLabel?: string; timelineLocation?: string; timelineCompleted?: boolean }
  ) {
    setError(null);
    setUpdatingTrackingId(trackingId);
    try {
      const response = await authorizedFetch(`/api/shipments/${encodeURIComponent(trackingId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates)
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to update shipment.");
      setShipments((current) => current.map((shipment) => (shipment.tracking_id === trackingId ? data : shipment)));
      setMessage(`Shipment ${trackingId} updated.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update shipment.");
    } finally {
      setUpdatingTrackingId(null);
    }
  }

  async function saveProof(trackingId: string, asset: UploadedAsset) {
    const response = await authorizedFetch(`/api/shipments/${encodeURIComponent(trackingId)}/proof`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ proofImageUrl: asset.secureUrl })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "Unable to save proof image.");
    setShipments((current) => current.map((shipment) => (shipment.tracking_id === trackingId ? data : shipment)));
    setMessage(`Proof of delivery saved for ${trackingId}.`);
  }

  function updateEventDraft(trackingId: string, field: "label" | "location", value: string) {
    setEventDrafts((current) => ({
      ...current,
      [trackingId]: { ...(current[trackingId] ?? { label: "", location: "" }), [field]: value }
    }));
  }

  async function addTimelineEvent(trackingId: string) {
    const draft = eventDrafts[trackingId];
    if (!draft?.label.trim()) return;
    await updateShipment(trackingId, {
      timelineLabel: draft.label,
      timelineLocation: draft.location,
      timelineCompleted: true
    });
    setEventDrafts((current) => ({ ...current, [trackingId]: { label: "", location: "" } }));
  }

  return (
    <section className="mt-8 grid gap-6">
      <Card className="glass">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <PackagePlus className="size-5 text-primary" />
            Create shipment
          </CardTitle>
          <p className="text-sm text-muted-foreground">Create real Supabase shipment records, assign drivers, and update customer tracking.</p>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4" onSubmit={createShipment}>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="grid gap-2">
                <Label htmlFor="adminCustomerName">Customer name</Label>
                <Input id="adminCustomerName" value={form.customerName} onChange={(e) => updateField("customerName", e.target.value)} required />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="adminCustomerEmail">Email</Label>
                <Input id="adminCustomerEmail" type="email" value={form.customerEmail} onChange={(e) => updateField("customerEmail", e.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="adminCustomerPhone">Phone</Label>
                <Input id="adminCustomerPhone" value={form.customerPhone} onChange={(e) => updateField("customerPhone", e.target.value)} />
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="adminPickup">Pickup address</Label>
                <Input id="adminPickup" value={form.pickupAddress} onChange={(e) => updateField("pickupAddress", e.target.value)} required />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="adminDelivery">Delivery address</Label>
                <Input id="adminDelivery" value={form.deliveryAddress} onChange={(e) => updateField("deliveryAddress", e.target.value)} required />
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-5">
              <div className="grid gap-2 md:col-span-2">
                <Label htmlFor="adminPackage">Package type</Label>
                <Input id="adminPackage" value={form.packageType} onChange={(e) => updateField("packageType", e.target.value)} required />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="adminWeight">Weight kg</Label>
                <Input id="adminWeight" type="number" value={form.weightKg} onChange={(e) => updateField("weightKg", e.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="adminUrgency">Urgency</Label>
                <select id="adminUrgency" value={form.urgency} onChange={(e) => updateField("urgency", e.target.value)} className="h-11 rounded-md border bg-background/70 px-3 text-sm">
                  <option value="standard">Standard</option>
                  <option value="priority">Priority</option>
                  <option value="critical">Critical</option>
                </select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="adminStatus">Initial status</Label>
                <select id="adminStatus" value={form.status} onChange={(e) => updateField("status", e.target.value as ShipmentStatus)} className="h-11 rounded-md border bg-background/70 px-3 text-sm">
                  {shipmentStatuses.map((status) => <option key={status} value={status}>{status}</option>)}
                </select>
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="adminDriver">Driver</Label>
                <select id="adminDriver" value={form.driverId} onChange={(e) => updateField("driverId", e.target.value)} className="h-11 rounded-md border bg-background/70 px-3 text-sm">
                  <option value="">Unassigned</option>
                  {drivers.map((driver) => (
                    <option key={String(driver.id)} value={String(driver.id)}>{driver.name}</option>
                  ))}
                </select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="adminEta">ETA</Label>
                <Input id="adminEta" value={form.eta} onChange={(e) => updateField("eta", e.target.value)} placeholder="24h" />
              </div>
            </div>
            <Button disabled={saving}>
              {saving ? <Loader2 className="animate-spin" /> : <PackagePlus />}
              Create shipment
            </Button>
          </form>
          {message && <div className="mt-4 flex gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-500"><CheckCircle2 className="size-4" />{message}</div>}
          {error && <div className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
        </CardContent>
      </Card>

      <Card className="glass">
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle>Shipment operations</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">Assign drivers, update status, and attach proof of delivery.</p>
          </div>
          <Button variant="outline" onClick={loadShipments} disabled={loading}>
            <RefreshCw className={loading ? "animate-spin" : ""} />
            Refresh
          </Button>
        </CardHeader>
        <CardContent className="grid gap-4">
          {loading && <div className="rounded-md border p-4 text-sm text-muted-foreground">Loading shipments...</div>}
          {!loading && shipments.length === 0 && <div className="rounded-md border p-4 text-sm text-muted-foreground">No shipments yet. Create the first shipment above.</div>}
          {shipments.map((shipment) => (
            <div key={shipment.tracking_id} className="rounded-md border bg-background/45 p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-mono text-lg font-bold">{shipment.tracking_id}</h3>
                    <Badge className="border-primary/40 bg-primary/10 text-primary">{shipment.status}</Badge>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">{shipment.pickup_address} to {shipment.delivery_address}</p>
                  <p className="mt-1 text-sm">{shipment.package_type}</p>
                  <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
                    <Truck className="size-4 text-primary" />
                    {shipment.assigned_driver?.name ?? "No driver assigned"}
                  </div>
                  <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
                    <Clock3 className="size-4 text-primary" />
                    ETA {shipment.eta ?? "pending"}
                  </div>
                </div>
                <div className="grid gap-2 sm:grid-cols-3 lg:min-w-[520px]">
                  <select
                    value={shipment.status}
                    onChange={(e) => void updateShipment(shipment.tracking_id, { status: e.target.value as ShipmentStatus })}
                    disabled={updatingTrackingId === shipment.tracking_id}
                    className="h-10 rounded-md border bg-background/70 px-3 text-sm"
                  >
                    {shipmentStatuses.map((status) => <option key={status} value={status}>{status}</option>)}
                  </select>
                  <select
                    value={shipment.driver_id ? String(shipment.driver_id) : ""}
                    onChange={(e) => void updateShipment(shipment.tracking_id, { driverId: e.target.value })}
                    disabled={updatingTrackingId === shipment.tracking_id}
                    className="h-10 rounded-md border bg-background/70 px-3 text-sm"
                  >
                    <option value="">Unassigned</option>
                    {drivers.map((driver) => <option key={String(driver.id)} value={String(driver.id)}>{driver.name}</option>)}
                  </select>
                  <CloudinaryUpload
                    folder="fly-logistics/proof-of-delivery"
                    label={shipment.proof_image_url ? "Replace proof" : "Upload proof"}
                    onUploaded={(asset) => saveProof(shipment.tracking_id, asset)}
                  />
                </div>
              </div>
              <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_360px]">
                <div className="rounded-md border bg-background/40 p-3">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <h4 className="text-sm font-semibold">Shipment timeline</h4>
                    {updatingTrackingId === shipment.tracking_id && <Loader2 className="size-4 animate-spin text-primary" />}
                  </div>
                  <div className="grid gap-2">
                    {(shipment.timeline?.length ? shipment.timeline : [{ label: "Shipment created", location: shipment.pickup_address, completed: true }]).map((event, index) => (
                      <div key={`${shipment.tracking_id}-${event.label}-${index}`} className="flex items-start justify-between gap-3 rounded-md border bg-background/55 p-3 text-sm">
                        <span className="flex min-w-0 items-start gap-2">
                          <MapPin className="mt-0.5 size-4 shrink-0 text-primary" />
                          <span>
                            <span className="block font-medium">{event.label}</span>
                            <span className="text-xs text-muted-foreground">{event.location ?? "Network event"}{event.occurred_at ? ` · ${new Date(event.occurred_at).toLocaleString()}` : ""}</span>
                          </span>
                        </span>
                        <Badge className={event.completed ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-500" : "border-primary/40 bg-primary/10 text-primary"}>
                          {event.completed ? "Done" : "Pending"}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="rounded-md border bg-background/40 p-3">
                  <h4 className="text-sm font-semibold">Add event</h4>
                  <div className="mt-3 grid gap-2">
                    <Input
                      value={eventDrafts[shipment.tracking_id]?.label ?? ""}
                      onChange={(event) => updateEventDraft(shipment.tracking_id, "label", event.target.value)}
                      placeholder="Arrived at Lagos hub"
                    />
                    <Input
                      value={eventDrafts[shipment.tracking_id]?.location ?? ""}
                      onChange={(event) => updateEventDraft(shipment.tracking_id, "location", event.target.value)}
                      placeholder="Location"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      disabled={updatingTrackingId === shipment.tracking_id || !eventDrafts[shipment.tracking_id]?.label?.trim()}
                      onClick={() => void addTimelineEvent(shipment.tracking_id)}
                    >
                      {updatingTrackingId === shipment.tracking_id ? <Loader2 className="animate-spin" /> : <Clock3 />}
                      Add timeline event
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </section>
  );
}
