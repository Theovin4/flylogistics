"use client";

import { FormEvent, useEffect, useState } from "react";
import { CheckCircle2, Loader2, PackagePlus, RefreshCw, Truck } from "lucide-react";
import { supabase } from "@/lib/supabase";
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
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadShipments() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/shipments");
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to load shipments.");
      setShipments(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load shipments.");
    } finally {
      setLoading(false);
    }
  }

  async function loadDrivers() {
    const { data } = await supabase.from("drivers").select("id,name,status,phone,photo_url,latitude,longitude").order("id", { ascending: true });
    setDrivers((data as DriverSummary[] | null) ?? []);
  }

  useEffect(() => {
    void loadShipments();
    void loadDrivers();
  }, []);

  function updateField(field: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function createShipment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch("/api/shipments", {
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

  async function updateShipment(trackingId: string, updates: { status?: ShipmentStatus; driverId?: string }) {
    setError(null);
    const response = await fetch(`/api/shipments/${encodeURIComponent(trackingId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates)
    });
    const data = await response.json();
    if (!response.ok) {
      setError(data.error ?? "Unable to update shipment.");
      return;
    }
    setShipments((current) => current.map((shipment) => (shipment.tracking_id === trackingId ? data : shipment)));
  }

  async function saveProof(trackingId: string, asset: UploadedAsset) {
    const response = await fetch(`/api/shipments/${encodeURIComponent(trackingId)}/proof`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ proofImageUrl: asset.secureUrl })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "Unable to save proof image.");
    setShipments((current) => current.map((shipment) => (shipment.tracking_id === trackingId ? data : shipment)));
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
                </div>
                <div className="grid gap-2 sm:grid-cols-3 lg:min-w-[520px]">
                  <select
                    value={shipment.status}
                    onChange={(e) => void updateShipment(shipment.tracking_id, { status: e.target.value as ShipmentStatus })}
                    className="h-10 rounded-md border bg-background/70 px-3 text-sm"
                  >
                    {shipmentStatuses.map((status) => <option key={status} value={status}>{status}</option>)}
                  </select>
                  <select
                    value={shipment.driver_id ? String(shipment.driver_id) : ""}
                    onChange={(e) => void updateShipment(shipment.tracking_id, { driverId: e.target.value })}
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
            </div>
          ))}
        </CardContent>
      </Card>
    </section>
  );
}
