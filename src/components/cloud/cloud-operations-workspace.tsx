"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, CheckCircle2, CircleDollarSign, Loader2, PackagePlus, Search, Trash2, Truck, UserPlus, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCloudTenant } from "@/components/cloud/cloud-tenant-context";
import { DEFAULT_TENANT_COUNTRY, DEFAULT_TENANT_CURRENCY, DEFAULT_TENANT_LOCALE, formatMoney, normalizeCountryCode } from "@/lib/tenant-locale";

async function responseJson<T>(response: Response) {
  const text = await response.text();
  return text ? JSON.parse(text) as T : {} as T;
}

function Notice({ error, message }: { error?: string | null; message?: string | null }) {
  if (!error && !message) return null;
  return (
    <div className={`flex gap-2 rounded-md border p-3 text-sm ${error ? "border-destructive/30 bg-destructive/10 text-destructive" : "border-emerald-500/30 bg-emerald-500/10 text-emerald-500"}`}>
      {error ? <AlertTriangle className="size-4 shrink-0" /> : <CheckCircle2 className="size-4 shrink-0" />}
      {error ?? message}
    </div>
  );
}

type Customer = {
  id: string; customer_type: string; name: string; email?: string | null; phone?: string | null;
  organization?: string | null; address_line?: string | null; city?: string | null; state?: string | null;
  country?: string | null; status: string; last_shipment_at?: string | null;
};

const emptyCustomer = { customerType: "individual", name: "", email: "", phone: "", organization: "", addressLine: "", city: "", state: "", country: "", notes: "" };

export function CloudCustomersWorkspace() {
  const tenant = useCloudTenant();
  const tenantCountry = normalizeCountryCode(tenant.company?.country) ?? DEFAULT_TENANT_COUNTRY;
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [form, setForm] = useState({ ...emptyCustomer, country: tenantCountry });
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const response = await fetch(`/api/cloud/customers?search=${encodeURIComponent(search)}`, { cache: "no-store" });
      const data = await responseJson<{ customers?: Customer[]; error?: string }>(response);
      if (!response.ok) throw new Error(data.error ?? "Unable to load customers.");
      setCustomers(data.customers ?? []);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to load customers."); }
    finally { setLoading(false); }
  }, [search]);

  useEffect(() => { const timer = window.setTimeout(() => void load(), 180); return () => window.clearTimeout(timer); }, [load]);

  async function create(event: FormEvent) {
    event.preventDefault(); setSaving(true); setError(null); setMessage(null);
    try {
      const response = await fetch("/api/cloud/customers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const data = await responseJson<{ error?: string }>(response);
      if (!response.ok) throw new Error(data.error ?? "Unable to create customer.");
      setForm({ ...emptyCustomer, country: tenantCountry }); setMessage("Customer added to this company workspace."); await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to create customer."); }
    finally { setSaving(false); }
  }

  async function remove(customer: Customer) {
    if (!window.confirm(`Remove ${customer.name} from this customer directory?`)) return;
    const response = await fetch(`/api/cloud/customers/${customer.id}`, { method: "DELETE" });
    const data = await responseJson<{ error?: string }>(response);
    if (!response.ok) return setError(data.error ?? "Unable to remove customer.");
    setMessage("Customer removed."); await load();
  }

  return <div className="grid gap-4">
    <Card className="glass"><CardHeader><CardTitle className="flex items-center gap-2"><UserPlus className="size-5 text-primary" />Add external customer</CardTitle></CardHeader>
      <CardContent><form onSubmit={create} className="grid gap-3 md:grid-cols-2">
        <select className="rounded-md border px-3" value={form.customerType} onChange={(event) => setForm({ ...form, customerType: event.target.value })}><option value="individual">Individual</option><option value="business">Business</option></select>
        <Input placeholder="Customer or contact name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
        <Input type="email" placeholder="Email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
        <Input type="tel" placeholder="Phone" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} required />
        <Input placeholder="Organization (optional)" value={form.organization} onChange={(event) => setForm({ ...form, organization: event.target.value })} />
        <Input placeholder="Full address" value={form.addressLine} onChange={(event) => setForm({ ...form, addressLine: event.target.value })} required />
        <Input placeholder="City" value={form.city} onChange={(event) => setForm({ ...form, city: event.target.value })} required />
        <Input placeholder="State / region" value={form.state} onChange={(event) => setForm({ ...form, state: event.target.value })} required />
        <Input placeholder="Country" value={form.country} onChange={(event) => setForm({ ...form, country: event.target.value })} required />
        <Button type="submit" disabled={saving}>{saving ? <Loader2 className="animate-spin" /> : <UserPlus />}Add customer</Button>
      </form></CardContent></Card>
    <Notice error={error} message={message} />
    <Card className="glass"><CardHeader><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><CardTitle className="flex items-center gap-2"><Users className="size-5 text-primary" />Customer directory</CardTitle><div className="relative"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" placeholder="Search customers" value={search} onChange={(event) => setSearch(event.target.value)} /></div></div></CardHeader>
      <CardContent className="grid gap-2">{loading ? <p className="text-sm text-muted-foreground">Loading customers...</p> : customers.length ? customers.map((customer) => <div key={customer.id} className="grid gap-2 rounded-md border bg-background/45 p-3 sm:grid-cols-[1fr_auto] sm:items-center"><div><div className="flex flex-wrap items-center gap-2"><strong>{customer.name}</strong><Badge>{customer.customer_type}</Badge><Badge variant="outline">{customer.status}</Badge></div><p className="mt-1 text-sm text-muted-foreground">{[customer.organization, customer.email, customer.phone].filter(Boolean).join(" · ")}</p><p className="text-sm text-muted-foreground">{[customer.address_line, customer.city, customer.state, customer.country].filter(Boolean).join(", ")}</p></div><Button type="button" variant="outline" size="icon" title="Remove customer" onClick={() => void remove(customer)}><Trash2 className="size-4" /></Button></div>) : <p className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">No external customers yet. Add the first customer above.</p>}</CardContent>
    </Card>
  </div>;
}

type Driver = { id: number; name: string; phone?: string | null; status?: string; approval_status?: string; vehicle_type?: string | null; vehicle_plate_number?: string | null };
export function CloudDriversWorkspace() {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [form, setForm] = useState({ name: "", phone: "", vehicleType: "bike", approvalStatus: "approved" });
  const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null); const [message, setMessage] = useState<string | null>(null);
  const load = useCallback(async () => { setLoading(true); try { const response = await fetch("/api/drivers", { cache: "no-store" }); const data = await responseJson<Driver[] & { error?: string }>(response); if (!response.ok) throw new Error((data as { error?: string }).error ?? "Unable to load drivers."); setDrivers(Array.isArray(data) ? data : []); } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to load drivers."); } finally { setLoading(false); } }, []);
  useEffect(() => { void load(); }, [load]);
  async function create(event: FormEvent) { event.preventDefault(); setSaving(true); setError(null); setMessage(null); try { const response = await fetch("/api/drivers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, status: "offline" }) }); const data = await responseJson<{ error?: string }>(response); if (!response.ok) throw new Error(data.error ?? "Unable to add driver."); setForm({ name: "", phone: "", vehicleType: "bike", approvalStatus: "approved" }); setMessage("Driver added to this workspace."); await load(); } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to add driver."); } finally { setSaving(false); } }
  async function update(driver: Driver, values: Record<string, string>) { const response = await fetch(`/api/drivers/${driver.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(values) }); const data = await responseJson<{ error?: string }>(response); if (!response.ok) return setError(data.error ?? "Unable to update driver."); setMessage("Driver status updated."); await load(); }
  return <div className="grid gap-4"><Card className="glass"><CardHeader><CardTitle className="flex items-center gap-2"><Truck className="size-5 text-primary" />Add driver</CardTitle></CardHeader><CardContent><form onSubmit={create} className="grid gap-3 md:grid-cols-2"><Input placeholder="Driver name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /><Input type="tel" placeholder="Phone" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} required /><select className="rounded-md border px-3" value={form.vehicleType} onChange={(event) => setForm({ ...form, vehicleType: event.target.value })}><option value="bike">Bike</option><option value="car">Car</option><option value="van">Van</option><option value="bus">Bus</option><option value="truck">Truck</option></select><Button type="submit" disabled={saving}>{saving ? <Loader2 className="animate-spin" /> : <UserPlus />}Add driver</Button></form></CardContent></Card><Notice error={error} message={message} /><Card className="glass"><CardHeader><CardTitle>Driver operations</CardTitle></CardHeader><CardContent className="grid gap-2">{loading ? <p className="text-sm text-muted-foreground">Loading drivers...</p> : drivers.length ? drivers.map((driver) => <div key={driver.id} className="grid gap-3 rounded-md border p-3 sm:grid-cols-[1fr_auto] sm:items-center"><div><strong>{driver.name}</strong><p className="text-sm text-muted-foreground">{driver.phone || "No phone"} · {driver.vehicle_type || "Vehicle not set"}</p><div className="mt-2 flex gap-2"><Badge>{driver.approval_status || "pending"}</Badge><Badge variant="outline">{driver.status || "offline"}</Badge></div></div><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => void update(driver, { approvalStatus: "approved" })}>Approve</Button><Button variant="outline" onClick={() => void update(driver, { approvalStatus: "suspended" })}>Suspend</Button></div></div>) : <p className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">No drivers yet. Add your first driver above.</p>}</CardContent></Card></div>;
}

type Shipment = { id: number | string; tracking_id: string; customer_name?: string; recipient_name?: string; pickup_address?: string; delivery_address?: string; status?: string; payment_amount?: number; quote_currency?: string | null; created_at?: string };
export function CloudShipmentsWorkspace() {
  const tenant = useCloudTenant();
  const tenantCountry = normalizeCountryCode(tenant.company?.country) ?? DEFAULT_TENANT_COUNTRY;
  const tenantCurrency = String(tenant.company?.currency ?? DEFAULT_TENANT_CURRENCY).toUpperCase();
  const [shipments, setShipments] = useState<Shipment[]>([]); const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false); const [error, setError] = useState<string | null>(null); const [message, setMessage] = useState<string | null>(null);
  const [form, setForm] = useState({ deliveryCategory: "local_nigeria", pickupCountry: tenantCountry, destinationCountry: tenantCountry, pickupState: "", destinationState: "", customerName: "", customerEmail: "", customerPhone: "", recipientName: "", deliveryPhone: "", pickupAddress: "", deliveryAddress: "", packageType: "Parcel", weightKg: "1", quoteCurrency: tenantCurrency, urgency: "standard" });
  const load = useCallback(async () => { setLoading(true); try { const response = await fetch("/api/shipments", { cache: "no-store" }); const data = await responseJson<Shipment[] & { error?: string }>(response); if (!response.ok) throw new Error((data as { error?: string }).error ?? "Unable to load shipments."); setShipments(Array.isArray(data) ? data : []); } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to load shipments."); } finally { setLoading(false); } }, []);
  useEffect(() => { void load(); }, [load]);
  async function create(event: FormEvent) { event.preventDefault(); setSaving(true); setError(null); setMessage(null); try { const response = await fetch("/api/shipments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, weightKg: Number(form.weightKg), status: "PENDING", carrierProvider: "internal_fly_logistics", walletAdjustmentType: "none" }) }); const data = await responseJson<{ tracking_id?: string; trackingId?: string; error?: string }>(response); if (!response.ok) throw new Error(data.error ?? "Unable to create shipment."); const tracking = data.tracking_id ?? data.trackingId ?? "created"; setMessage(`Shipment ${tracking} created successfully.`); setShowForm(false); await load(); } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to create shipment."); } finally { setSaving(false); } }
  return <div className="grid gap-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-2xl font-black">Shipments</h2><p className="text-sm text-muted-foreground">Create, dispatch, and monitor this company&apos;s deliveries.</p></div><Button onClick={() => setShowForm((value) => !value)}><PackagePlus />{showForm ? "Close form" : "Create shipment"}</Button></div><Notice error={error} message={message} />{showForm && <Card className="glass"><CardHeader><CardTitle>New shipment</CardTitle></CardHeader><CardContent><form onSubmit={create} className="grid gap-3 md:grid-cols-2"><select className="rounded-md border px-3" value={form.deliveryCategory} onChange={(event) => setForm({ ...form, deliveryCategory: event.target.value })}><option value="local_nigeria">Domestic delivery</option><option value="international_import">International import</option><option value="international_export">International export</option></select><select className="rounded-md border px-3" value={form.urgency} onChange={(event) => setForm({ ...form, urgency: event.target.value })}><option value="standard">Standard</option><option value="priority">Priority</option><option value="critical">Urgent</option></select><Input placeholder="Sender / customer name" value={form.customerName} onChange={(event) => setForm({ ...form, customerName: event.target.value })} required /><Input type="email" placeholder="Sender email" value={form.customerEmail} onChange={(event) => setForm({ ...form, customerEmail: event.target.value })} /><Input type="tel" placeholder="Sender phone" value={form.customerPhone} onChange={(event) => setForm({ ...form, customerPhone: event.target.value })} required /><Input placeholder="Recipient name" value={form.recipientName} onChange={(event) => setForm({ ...form, recipientName: event.target.value })} required /><Input type="tel" placeholder="Recipient phone" value={form.deliveryPhone} onChange={(event) => setForm({ ...form, deliveryPhone: event.target.value })} required /><Input placeholder="Package description" value={form.packageType} onChange={(event) => setForm({ ...form, packageType: event.target.value })} required /><Input placeholder="Pickup country (ISO code)" maxLength={2} value={form.pickupCountry} onChange={(event) => setForm({ ...form, pickupCountry: event.target.value.toUpperCase() })} required /><Input placeholder="Destination country (ISO code)" maxLength={2} value={form.destinationCountry} onChange={(event) => setForm({ ...form, destinationCountry: event.target.value.toUpperCase() })} required /><Input placeholder="Pickup state / region" value={form.pickupState} onChange={(event) => setForm({ ...form, pickupState: event.target.value })} required={form.deliveryCategory !== "international_import"} /><Input placeholder="Destination state / region" value={form.destinationState} onChange={(event) => setForm({ ...form, destinationState: event.target.value })} required={form.deliveryCategory !== "international_export"} /><Input className="md:col-span-2" placeholder="Full pickup address" value={form.pickupAddress} onChange={(event) => setForm({ ...form, pickupAddress: event.target.value })} required /><Input className="md:col-span-2" placeholder="Full delivery address" value={form.deliveryAddress} onChange={(event) => setForm({ ...form, deliveryAddress: event.target.value })} required /><div><Label htmlFor="cloudWeight">Weight (kg)</Label><Input id="cloudWeight" type="number" min="0.1" step="0.1" value={form.weightKg} onChange={(event) => setForm({ ...form, weightKg: event.target.value })} required /></div><div><Label htmlFor="cloudQuoteCurrency">Quote currency</Label><Input id="cloudQuoteCurrency" maxLength={3} value={form.quoteCurrency} onChange={(event) => setForm({ ...form, quoteCurrency: event.target.value.toUpperCase() })} required /></div><Button type="submit" disabled={saving}>{saving ? <Loader2 className="animate-spin" /> : <PackagePlus />}Create shipment</Button></form></CardContent></Card>}<Card className="glass"><CardHeader><CardTitle>Company shipments</CardTitle></CardHeader><CardContent className="grid gap-2">{loading ? <p className="text-sm text-muted-foreground">Loading shipments...</p> : shipments.length ? shipments.map((shipment) => <details key={shipment.id} className="rounded-md border bg-background/45 p-3"><summary className="cursor-pointer list-none"><div className="flex flex-wrap items-center justify-between gap-2"><strong>{shipment.tracking_id}</strong><Badge>{shipment.status || "PENDING"}</Badge></div><p className="mt-1 text-sm text-muted-foreground">{shipment.customer_name || "Customer"} to {shipment.recipient_name || "Recipient"}</p></summary><div className="mt-3 grid gap-2 border-t pt-3 text-sm text-muted-foreground"><p><strong className="text-foreground">Pickup:</strong> {shipment.pickup_address}</p><p><strong className="text-foreground">Delivery:</strong> {shipment.delivery_address}</p>{shipment.payment_amount !== undefined && <p><strong className="text-foreground">Quote:</strong> {formatMoney(shipment.payment_amount, shipment.quote_currency ?? tenantCurrency, tenant.company?.locale ?? DEFAULT_TENANT_LOCALE)}</p>}</div></details>) : <p className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">No shipments yet. Use Create shipment to start operations.</p>}</CardContent></Card></div>;
}

type DispatchShipment = Shipment & {
  driver_id?: number | null;
  payment_status?: string | null;
  urgency?: string | null;
  updated_at?: string | null;
  assigned_driver?: Driver | null;
};

const dispatchStatuses = ["PENDING", "CONFIRMED", "DRIVER_ASSIGNED", "PICKED_UP", "IN_TRANSIT", "ARRIVED", "DELIVERED", "CANCELLED"] as const;

function dispatchStatusLabel(status?: string | null) {
  return String(status || "PENDING").replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function CloudDispatchWorkspace() {
  const [shipments, setShipments] = useState<DispatchShipment[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [filter, setFilter] = useState("active");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingTracking, setSavingTracking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [shipmentResponse, driverResponse] = await Promise.all([
        fetch("/api/shipments", { cache: "no-store" }),
        fetch("/api/drivers", { cache: "no-store" })
      ]);
      const shipmentData = await responseJson<DispatchShipment[] | { error?: string }>(shipmentResponse);
      const driverData = await responseJson<Driver[] | { error?: string }>(driverResponse);
      if (!shipmentResponse.ok) throw new Error(!Array.isArray(shipmentData) && shipmentData.error ? shipmentData.error : "Unable to load shipment operations.");
      if (!driverResponse.ok) throw new Error(!Array.isArray(driverData) && driverData.error ? driverData.error : "Unable to load drivers.");
      setShipments(Array.isArray(shipmentData) ? shipmentData : []);
      setDrivers(Array.isArray(driverData) ? driverData.filter((driver) => driver.approval_status === "approved") : []);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to load dispatch operations.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const visibleShipments = useMemo(() => {
    const query = search.trim().toLowerCase();
    return shipments.filter((shipment) => {
      const status = String(shipment.status || "PENDING").toUpperCase();
      const matchesFilter = filter === "all"
        || (filter === "active" && !["DELIVERED", "CANCELLED"].includes(status))
        || (filter === "unassigned" && !shipment.driver_id && !["DELIVERED", "CANCELLED"].includes(status))
        || (filter === "exceptions" && ["EXCEPTION", "CANCELLED"].includes(status))
        || status === filter.toUpperCase();
      if (!matchesFilter) return false;
      if (!query) return true;
      return [shipment.tracking_id, shipment.customer_name, shipment.recipient_name, shipment.pickup_address, shipment.delivery_address]
        .some((value) => String(value || "").toLowerCase().includes(query));
    });
  }, [filter, search, shipments]);

  async function updateShipment(shipment: DispatchShipment, patch: Record<string, string>) {
    setSavingTracking(shipment.tracking_id);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(`/api/shipments/${encodeURIComponent(shipment.tracking_id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch)
      });
      const data = await responseJson<{ error?: string }>(response);
      if (!response.ok) throw new Error(data.error ?? "Unable to update shipment operations.");
      setMessage(`${shipment.tracking_id} updated successfully.`);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to update shipment operations.");
    } finally {
      setSavingTracking(null);
    }
  }

  const activeCount = shipments.filter((shipment) => !["DELIVERED", "CANCELLED"].includes(String(shipment.status).toUpperCase())).length;
  const unassignedCount = shipments.filter((shipment) => !shipment.driver_id && !["DELIVERED", "CANCELLED"].includes(String(shipment.status).toUpperCase())).length;
  const exceptionCount = shipments.filter((shipment) => ["EXCEPTION", "CANCELLED"].includes(String(shipment.status).toUpperCase())).length;

  return (
    <div className="grid gap-4">
      <div>
        <h2 className="text-2xl font-black">Dispatch operations</h2>
        <p className="text-sm text-muted-foreground">Assign approved drivers and move shipments through the verified delivery lifecycle.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {[{ label: "Active", value: activeCount }, { label: "Needs assignment", value: unassignedCount }, { label: "Exceptions", value: exceptionCount }].map((metric) => (
          <Card key={metric.label} className="glass"><CardContent className="p-4"><p className="text-xs font-semibold uppercase text-muted-foreground">{metric.label}</p><p className="mt-2 text-3xl font-black">{metric.value}</p></CardContent></Card>
        ))}
      </div>
      <Notice error={error} message={message} />
      <Card className="glass">
        <CardHeader>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <CardTitle className="flex items-center gap-2"><Activity className="size-5 text-primary" />Shipment queue</CardTitle>
            <div className="grid gap-2 sm:grid-cols-[220px_180px_auto]">
              <Input aria-label="Search shipment queue" placeholder="Tracking, customer, route" value={search} onChange={(event) => setSearch(event.target.value)} />
              <select aria-label="Filter shipment queue" className="rounded-md border px-3 py-2" value={filter} onChange={(event) => setFilter(event.target.value)}>
                <option value="active">Active shipments</option>
                <option value="unassigned">Needs assignment</option>
                <option value="exceptions">Exceptions</option>
                <option value="delivered">Delivered</option>
                <option value="all">All shipments</option>
              </select>
              <Button type="button" variant="outline" onClick={() => void load()} disabled={loading}>{loading ? <Loader2 className="animate-spin" /> : <Activity />}Refresh</Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3">
          {loading ? <p className="text-sm text-muted-foreground">Loading dispatch queue...</p> : visibleShipments.length ? visibleShipments.map((shipment) => {
            const saving = savingTracking === shipment.tracking_id;
            return (
              <article key={shipment.id} className="grid gap-4 rounded-md border bg-background/45 p-4 xl:grid-cols-[1.2fr_1fr] xl:items-center">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2"><strong>{shipment.tracking_id}</strong><Badge>{dispatchStatusLabel(shipment.status)}</Badge><Badge variant="outline">{String(shipment.payment_status || "UNPAID").toUpperCase()}</Badge></div>
                  <p className="mt-2 text-sm font-semibold">{shipment.customer_name || "Customer"} to {shipment.recipient_name || "Recipient"}</p>
                  <p className="mt-1 truncate text-sm text-muted-foreground">{shipment.pickup_address || "Pickup not set"} → {shipment.delivery_address || "Delivery not set"}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Assigned: {shipment.assigned_driver?.name || "No driver"}</p>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div><Label htmlFor={`driver-${shipment.id}`}>Driver</Label><select id={`driver-${shipment.id}`} className="mt-1 w-full rounded-md border px-3 py-2" value={shipment.driver_id ?? ""} disabled={saving} onChange={(event) => { const driverId = event.target.value; const paid = String(shipment.payment_status || "").toUpperCase() === "PAID"; void updateShipment(shipment, driverId && paid ? { driverId, status: "DRIVER_ASSIGNED" } : { driverId }); }}><option value="">Unassigned</option>{drivers.map((driver) => <option key={driver.id} value={driver.id}>{driver.name} · {driver.vehicle_type || "vehicle"}</option>)}</select></div>
                  <div><Label htmlFor={`status-${shipment.id}`}>Status</Label><select id={`status-${shipment.id}`} className="mt-1 w-full rounded-md border px-3 py-2" value={String(shipment.status || "PENDING").toUpperCase()} disabled={saving} onChange={(event) => void updateShipment(shipment, { status: event.target.value })}>{dispatchStatuses.map((status) => <option key={status} value={status}>{dispatchStatusLabel(status)}</option>)}</select></div>
                </div>
              </article>
            );
          }) : <p className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">No shipments match this operations view.</p>}
        </CardContent>
      </Card>
    </div>
  );
}

type Analytics = { metrics?: Record<string, number>; revenueByCurrency?: Array<{ currency: string; amount: number }>; statusDistribution?: Array<{ label: string; value: number }>; topDestinations?: Array<{ label: string; value: number }>; driverWorkload?: Array<{ label: string; value: number }>; error?: string };
export function CloudAnalyticsWorkspace() {
  const tenant = useCloudTenant();
  const locale = tenant.company?.locale ?? DEFAULT_TENANT_LOCALE;
  const [period, setPeriod] = useState("30d"); const [data, setData] = useState<Analytics | null>(null); const [loading, setLoading] = useState(true); const [error, setError] = useState<string | null>(null);
  useEffect(() => { let active = true; setLoading(true); fetch(`/api/cloud/analytics?period=${period}`, { cache: "no-store" }).then(async (response) => { const body = await responseJson<Analytics>(response); if (!response.ok) throw new Error(body.error ?? "Unable to load analytics."); if (active) setData(body); }).catch((reason) => active && setError(reason instanceof Error ? reason.message : "Unable to load analytics.")).finally(() => active && setLoading(false)); return () => { active = false; }; }, [period]);
  const metrics = data?.metrics ?? {};
  const labels: Record<string, string> = { shipments: "Shipments", delivered: "Delivered", active: "Active", failed: "Exceptions", successRate: "Success rate", newCustomers: "New customers", activeDrivers: "Active drivers", quoteConversion: "Quote conversion" };
  return <div className="grid gap-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-2xl font-black">Operational analytics</h2><p className="text-sm text-muted-foreground">Metrics are calculated only from this company&apos;s records. Revenue is never combined across currencies.</p></div><select className="rounded-md border px-3" value={period} onChange={(event) => setPeriod(event.target.value)}><option value="7d">Last 7 days</option><option value="30d">Last 30 days</option><option value="90d">Last 90 days</option></select></div><Notice error={error} />{loading ? <p className="text-sm text-muted-foreground">Calculating analytics...</p> : <><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{Object.entries(labels).map(([key, label]) => <Card key={key} className="glass"><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">{label}</CardTitle></CardHeader><CardContent><div className="text-3xl font-black">{key.includes("Rate") || key.includes("Conversion") ? `${metrics[key] ?? 0}%` : metrics[key] ?? 0}</div></CardContent></Card>)}<Card className="glass"><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Delivery revenue</CardTitle></CardHeader><CardContent className="grid gap-1">{data?.revenueByCurrency?.length ? data.revenueByCurrency.map((row) => <div key={row.currency} className="text-xl font-black">{formatMoney(row.amount, row.currency, locale)}</div>) : <div className="text-xl font-black">No collected revenue</div>}</CardContent></Card></div><div className="grid gap-4 lg:grid-cols-3"><AnalyticsList title="Status distribution" rows={data?.statusDistribution} /><AnalyticsList title="Top destinations" rows={data?.topDestinations} /><AnalyticsList title="Driver workload" rows={data?.driverWorkload} /></div></>}</div>;
}

function AnalyticsList({ title, rows = [] }: { title: string; rows?: Array<{ label: string; value: number }> }) { const max = useMemo(() => Math.max(1, ...rows.map((row) => row.value)), [rows]); return <Card className="glass"><CardHeader><CardTitle className="flex items-center gap-2"><Activity className="size-4 text-primary" />{title}</CardTitle></CardHeader><CardContent className="grid gap-3">{rows.length ? rows.map((row) => <div key={row.label}><div className="mb-1 flex justify-between gap-3 text-sm"><span className="truncate">{row.label}</span><strong>{row.value}</strong></div><div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(5, row.value / max * 100)}%` }} /></div></div>) : <p className="text-sm text-muted-foreground">No operating data for this period yet.</p>}</CardContent></Card>; }

type TeamMember = { id: string; user_id: string; role: string; created_at: string; profile?: { email?: string | null; full_name?: string | null; phone?: string | null } | null };
export function CloudTeamWorkspace() {
  const [team, setTeam] = useState<TeamMember[]>([]); const [limit, setLimit] = useState<number | null>(null);
  const [form, setForm] = useState({ name: "", email: "", role: "dispatcher" }); const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false); const [error, setError] = useState<string | null>(null); const [message, setMessage] = useState<string | null>(null);
  const load = useCallback(async () => { setLoading(true); try { const response = await fetch("/api/cloud/team", { cache: "no-store" }); const data = await responseJson<{ team?: TeamMember[]; limit?: number | null; error?: string }>(response); if (!response.ok) throw new Error(data.error ?? "Unable to load team."); setTeam(data.team ?? []); setLimit(data.limit ?? null); } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to load team."); } finally { setLoading(false); } }, []);
  useEffect(() => { void load(); }, [load]);
  async function add(event: FormEvent) { event.preventDefault(); setSaving(true); setError(null); setMessage(null); try { const response = await fetch("/api/cloud/team", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) }); const data = await responseJson<{ message?: string; error?: string }>(response); if (!response.ok) throw new Error(data.error ?? "Unable to add team member."); setForm({ name: "", email: "", role: "dispatcher" }); setMessage(data.message ?? "Team member added."); await load(); } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to add team member."); } finally { setSaving(false); } }
  async function update(member: TeamMember, role: string) { const response = await fetch(`/api/cloud/team/${member.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role }) }); const data = await responseJson<{ error?: string }>(response); if (!response.ok) return setError(data.error ?? "Unable to update team role."); setMessage("Team role updated."); await load(); }
  async function remove(member: TeamMember) { if (!window.confirm("Remove this team member from the company workspace?")) return; const response = await fetch(`/api/cloud/team/${member.id}`, { method: "DELETE" }); const data = await responseJson<{ error?: string }>(response); if (!response.ok) return setError(data.error ?? "Unable to remove team member."); setMessage("Team member removed."); await load(); }
  return <div className="grid gap-4"><Card className="glass"><CardHeader><CardTitle className="flex items-center gap-2"><UserPlus className="size-5 text-primary" />Invite team member</CardTitle></CardHeader><CardContent><form onSubmit={add} className="grid gap-3 md:grid-cols-4"><Input placeholder="Full name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /><Input type="email" placeholder="Work email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required /><select className="rounded-md border px-3" value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })}><option value="admin">Admin</option><option value="dispatcher">Dispatcher</option><option value="driver">Driver</option></select><Button disabled={saving}>{saving ? <Loader2 className="animate-spin" /> : <UserPlus />}Invite</Button></form><p className="mt-3 text-xs text-muted-foreground">{team.length} of {limit ?? "unlimited"} plan seats used.</p></CardContent></Card><Notice error={error} message={message} /><Card className="glass"><CardHeader><CardTitle>Company team</CardTitle></CardHeader><CardContent className="grid gap-2">{loading ? <p className="text-sm text-muted-foreground">Loading team...</p> : team.map((member) => <div key={member.id} className="grid gap-3 rounded-md border p-3 md:grid-cols-[1fr_180px_auto] md:items-center"><div><strong>{member.profile?.full_name || "Team member"}</strong><p className="text-sm text-muted-foreground">{member.profile?.email || "Account invitation pending"}</p></div>{member.role === "owner" ? <Badge className="w-fit">Owner</Badge> : <select className="rounded-md border px-3 py-2" value={member.role} onChange={(event) => void update(member, event.target.value)}><option value="admin">Admin</option><option value="dispatcher">Dispatcher</option><option value="driver">Driver</option></select>}{member.role !== "owner" && <Button variant="outline" size="sm" onClick={() => void remove(member)}><Trash2 />Remove</Button>}</div>)}</CardContent></Card></div>;
}

type RateCard = { id: string; name: string; service_type: string; origin_zone?: string | null; destination_zone?: string | null; base_price: number; included_weight_kg: number; extra_kg_price: number; currency: string; eta_min_hours?: number | null; eta_max_hours?: number | null; is_active: boolean };
type RatePreview = { automaticPrice?: boolean; message?: string; quote?: { name: string; currency: string; baseAmount: number; extraWeightKg: number; extraWeightAmount: number; amount: number; etaLabel?: string | null }; error?: string };
export function CloudRatesWorkspace() {
  const tenant = useCloudTenant();
  const tenantCurrency = String(tenant.company?.currency ?? DEFAULT_TENANT_CURRENCY).toUpperCase();
  const locale = tenant.company?.locale ?? DEFAULT_TENANT_LOCALE;
  const [rates, setRates] = useState<RateCard[]>([]); const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false); const [error, setError] = useState<string | null>(null); const [message, setMessage] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "Standard domestic delivery", serviceType: "local_nigeria", originZone: "All", destinationZone: "All", basePrice: "5000", includedWeightKg: "2.5", extraKgPrice: "850", currency: tenantCurrency, etaMinHours: "24", etaMaxHours: "48", isActive: true });
  const [previewForm, setPreviewForm] = useState({ serviceType: "local_nigeria", pickupZone: "Lagos Mainland", destinationZone: "Lagos Island", weightKg: "5" });
  const [preview, setPreview] = useState<RatePreview | null>(null); const [previewing, setPreviewing] = useState(false);
  const load = useCallback(async () => { setLoading(true); try { const response = await fetch("/api/cloud/rates", { cache: "no-store" }); const data = await responseJson<{ rates?: RateCard[]; error?: string }>(response); if (!response.ok) throw new Error(data.error ?? "Unable to load rate cards."); setRates(data.rates ?? []); } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to load rate cards."); } finally { setLoading(false); } }, []);
  useEffect(() => { void load(); }, [load]);
  async function create(event: FormEvent) { event.preventDefault(); setSaving(true); setError(null); setMessage(null); try { const response = await fetch("/api/cloud/rates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, basePrice: Number(form.basePrice), includedWeightKg: Number(form.includedWeightKg), extraKgPrice: Number(form.extraKgPrice), etaMinHours: Number(form.etaMinHours), etaMaxHours: Number(form.etaMaxHours) }) }); const data = await responseJson<{ error?: string }>(response); if (!response.ok) throw new Error(data.error ?? "Unable to create rate card."); setMessage("Company rate card created."); await load(); } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to create rate card."); } finally { setSaving(false); } }
  async function toggle(rate: RateCard) { const response = await fetch(`/api/cloud/rates/${rate.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isActive: !rate.is_active }) }); const data = await responseJson<{ error?: string }>(response); if (!response.ok) return setError(data.error ?? "Unable to update rate card."); setMessage(`Rate card ${rate.is_active ? "paused" : "activated"}.`); await load(); }
  async function remove(rate: RateCard) { if (!window.confirm(`Delete ${rate.name}?`)) return; const response = await fetch(`/api/cloud/rates/${rate.id}`, { method: "DELETE" }); const data = await responseJson<{ error?: string }>(response); if (!response.ok) return setError(data.error ?? "Unable to delete rate card."); setMessage("Rate card deleted."); await load(); }
  async function testPricing(event: FormEvent) { event.preventDefault(); setPreviewing(true); setError(null); try { const response = await fetch("/api/cloud/rates/preview", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...previewForm, weightKg: Number(previewForm.weightKg) }) }); const data = await responseJson<RatePreview>(response); if (!response.ok) throw new Error(data.error ?? "Unable to preview customer pricing."); setPreview(data); } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to preview customer pricing."); } finally { setPreviewing(false); } }
  return <div className="grid gap-4">
    <div><h2 className="text-2xl font-black">Delivery Rates</h2><p className="text-sm text-muted-foreground">Set what your customers pay for deliveries. Active rates are resolved on the server when customers request prices or create shipments.</p></div>
    <Card className="glass"><CardHeader><CardTitle>Test your pricing</CardTitle></CardHeader><CardContent className="grid gap-4"><form onSubmit={testPricing} className="grid gap-3 md:grid-cols-4"><select className="rounded-md border px-3" value={previewForm.serviceType} onChange={(event) => setPreviewForm({ ...previewForm, serviceType: event.target.value })}><option value="local_nigeria">Domestic delivery</option><option value="international_import">International import</option><option value="international_export">International export</option></select><Input placeholder="Pickup area" value={previewForm.pickupZone} onChange={(event) => setPreviewForm({ ...previewForm, pickupZone: event.target.value })} required /><Input placeholder="Destination area" value={previewForm.destinationZone} onChange={(event) => setPreviewForm({ ...previewForm, destinationZone: event.target.value })} required /><Button disabled={previewing}>{previewing ? <Loader2 className="animate-spin" /> : <CircleDollarSign />}Preview customer price</Button><Input className="md:col-span-1" type="number" min="0.1" step="0.1" placeholder="Weight (kg)" value={previewForm.weightKg} onChange={(event) => setPreviewForm({ ...previewForm, weightKg: event.target.value })} required /></form>{preview && (preview.automaticPrice && preview.quote ? <div className="rounded-md border bg-background/50 p-4 text-sm"><div className="flex justify-between"><span>Base price</span><strong>{formatMoney(preview.quote.baseAmount, preview.quote.currency, locale)}</strong></div><div className="mt-2 flex justify-between"><span>Extra weight ({preview.quote.extraWeightKg}kg)</span><strong>{formatMoney(preview.quote.extraWeightAmount, preview.quote.currency, locale)}</strong></div><div className="mt-3 flex justify-between border-t pt-3 text-base"><span>Customer total</span><strong>{formatMoney(preview.quote.amount, preview.quote.currency, locale)}</strong></div><p className="mt-2 text-xs text-muted-foreground">This is what your customer will see. No shipment was created.</p></div> : <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-4 text-sm">{preview.message ?? "Price review required."}</div>)}</CardContent></Card>
    <Card className="glass"><CardHeader><CardTitle className="flex items-center gap-2"><CircleDollarSign className="size-5 text-primary" />Create a delivery rate</CardTitle></CardHeader><CardContent><form onSubmit={create} className="grid gap-3 md:grid-cols-3"><Input placeholder="Rate name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /><select className="rounded-md border px-3" value={form.serviceType} onChange={(event) => setForm({ ...form, serviceType: event.target.value })}><option value="local_nigeria">Domestic delivery</option><option value="international_import">International import</option><option value="international_export">International export</option></select><Input placeholder="Currency" maxLength={3} value={form.currency} onChange={(event) => setForm({ ...form, currency: event.target.value.toUpperCase() })} required /><Input placeholder="Origin area or All" value={form.originZone} onChange={(event) => setForm({ ...form, originZone: event.target.value })} /><Input placeholder="Destination area or All" value={form.destinationZone} onChange={(event) => setForm({ ...form, destinationZone: event.target.value })} /><Input type="number" min="0" placeholder="Base price" value={form.basePrice} onChange={(event) => setForm({ ...form, basePrice: event.target.value })} required /><Input type="number" min="0.1" step="0.1" placeholder="Weight included in base price (kg)" value={form.includedWeightKg} onChange={(event) => setForm({ ...form, includedWeightKg: event.target.value })} required /><Input type="number" min="0" placeholder="Price per extra kg" value={form.extraKgPrice} onChange={(event) => setForm({ ...form, extraKgPrice: event.target.value })} required /><div className="grid grid-cols-2 gap-2"><Input type="number" min="1" placeholder="Min ETA hours" value={form.etaMinHours} onChange={(event) => setForm({ ...form, etaMinHours: event.target.value })} /><Input type="number" min="1" placeholder="Max ETA hours" value={form.etaMaxHours} onChange={(event) => setForm({ ...form, etaMaxHours: event.target.value })} /></div><Button className="md:col-span-3" disabled={saving}>{saving ? <Loader2 className="animate-spin" /> : <CircleDollarSign />}Create active rate</Button></form></CardContent></Card>
    <Notice error={error} message={message} />
    <Card className="glass"><CardHeader><CardTitle>Rate cards</CardTitle></CardHeader><CardContent className="grid gap-2">{loading ? <p className="text-sm text-muted-foreground">Loading rates...</p> : rates.length ? rates.map((rate) => <div key={rate.id} className="grid gap-3 rounded-md border p-3 md:grid-cols-[1fr_auto_auto] md:items-center"><div><div className="flex flex-wrap items-center gap-2"><strong>{rate.name}</strong><Badge variant="outline">{rate.service_type === "local_nigeria" ? "domestic delivery" : rate.service_type.replaceAll("_", " ")}</Badge><Badge>{rate.is_active ? "Active" : "Inactive"}</Badge></div><p className="mt-1 text-sm text-muted-foreground">{rate.origin_zone || "All"} → {rate.destination_zone || "All"} · Base charge {formatMoney(Number(rate.base_price), rate.currency, locale)} · Includes {rate.included_weight_kg}kg · {formatMoney(Number(rate.extra_kg_price), rate.currency, locale)} per extra kg</p></div><Button variant="outline" size="sm" onClick={() => void toggle(rate)}>{rate.is_active ? "Deactivate" : "Activate"}</Button><Button variant="outline" size="sm" onClick={() => void remove(rate)}><Trash2 />Delete</Button></div>) : <p className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">No company rates yet. Create your first rate, then test exactly what a customer will be charged.</p>}</CardContent></Card>
  </div>;
}
