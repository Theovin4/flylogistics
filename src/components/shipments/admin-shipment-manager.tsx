"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { ArrowRight, BellRing, CheckCircle2, Clock3, DollarSign, FileText, Loader2, MapPin, MessageCircle, PackagePlus, RefreshCw, Send, Truck } from "lucide-react";
import { getSupabaseBrowser } from "@/lib/supabase";
import { shipmentStatuses, type DriverSummary, type QuoteRequestRecord, type ShipmentRecord, type ShipmentStatus } from "@/lib/shipments";
import { buildWhatsAppUrl, whatsappMessages } from "@/lib/contact";
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

const moneyFormatter = new Intl.NumberFormat("en-NG", {
  currency: "NGN",
  maximumFractionDigits: 0,
  style: "currency"
});

function customerWhatsAppUrl(phone: string | null | undefined, message: string) {
  return buildWhatsAppUrl({ phone, message });
}

export function AdminShipmentManager() {
  const [shipments, setShipments] = useState<ShipmentRecord[]>([]);
  const [drivers, setDrivers] = useState<DriverSummary[]>([]);
  const [quoteRequests, setQuoteRequests] = useState<QuoteRequestRecord[]>([]);
  const [form, setForm] = useState(initialShipmentForm);
  const [loading, setLoading] = useState(true);
  const [quotesLoading, setQuotesLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [updatingTrackingId, setUpdatingTrackingId] = useState<string | null>(null);
  const [convertingRequestId, setConvertingRequestId] = useState<string | null>(null);
  const [eventDrafts, setEventDrafts] = useState<Record<string, { label: string; location: string }>>({});
  const [quoteDriverIds, setQuoteDriverIds] = useState<Record<string, string>>({});
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

  const loadQuoteRequests = useCallback(async () => {
    setQuotesLoading(true);
    try {
      const response = await authorizedFetch("/api/quote-requests");
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to load quote requests.");
      setQuoteRequests(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load quote requests.");
    } finally {
      setQuotesLoading(false);
    }
  }, [authorizedFetch]);

  useEffect(() => {
    void loadShipments();
    void loadDrivers();
    void loadQuoteRequests();
  }, [loadDrivers, loadQuoteRequests, loadShipments]);

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

  function updateQuoteDriver(requestId: string, driverId: string) {
    setQuoteDriverIds((current) => ({ ...current, [requestId]: driverId }));
  }

  async function convertQuoteRequest(requestId: string) {
    setError(null);
    setMessage(null);
    setConvertingRequestId(requestId);

    try {
      const response = await authorizedFetch(`/api/quote-requests/${encodeURIComponent(requestId)}/convert`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ driverId: quoteDriverIds[requestId] ?? "" })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to convert quote request.");

      const convertedShipment = data.shipment as ShipmentRecord;
      setShipments((current) => [
        convertedShipment,
        ...current.filter((shipment) => shipment.tracking_id !== convertedShipment.tracking_id)
      ]);
      setQuoteRequests((current) =>
        current.map((quote) => (quote.request_id === requestId ? { ...quote, status: data.quote?.status ?? "CONVERTED" } : quote))
      );
      setQuoteDriverIds((current) => {
        const next = { ...current };
        delete next[requestId];
        return next;
      });
      setMessage(`Quote ${requestId} converted to shipment ${convertedShipment.tracking_id}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to convert quote request.");
    } finally {
      setConvertingRequestId(null);
    }
  }

  return (
    <section className="mt-8 grid gap-6">
      {message && <div className="flex gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-500"><CheckCircle2 className="size-4" />{message}</div>}
      {error && <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}

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
        </CardContent>
      </Card>

      <Card className="glass">
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <FileText className="size-5 text-primary" />
              Quote requests
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">Review order requests, assign a driver, and convert approved quotes into live shipments.</p>
          </div>
          <Button variant="outline" onClick={loadQuoteRequests} disabled={quotesLoading}>
            <RefreshCw className={quotesLoading ? "animate-spin" : ""} />
            Refresh
          </Button>
        </CardHeader>
        <CardContent className="grid gap-4">
          {quotesLoading && <div className="rounded-md border p-4 text-sm text-muted-foreground">Loading quote requests...</div>}
          {!quotesLoading && quoteRequests.length === 0 && <div className="rounded-md border p-4 text-sm text-muted-foreground">No quote requests yet.</div>}
          {quoteRequests.map((quote) => {
            const converted = quote.status === "CONVERTED";
            return (
              <div key={quote.request_id} className="rounded-md border bg-background/45 p-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-mono text-lg font-bold">{quote.request_id}</h3>
                      <Badge className={converted ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-500" : "border-primary/40 bg-primary/10 text-primary"}>
                        {quote.status}
                      </Badge>
                      <Badge>{quote.urgency}</Badge>
                    </div>
                    <p className="mt-2 text-sm font-medium">{quote.customer_name}</p>
                    <p className="text-sm text-muted-foreground">{quote.customer_email}{quote.customer_phone ? `, ${quote.customer_phone}` : ""}</p>
                    <p className="mt-3 text-sm text-muted-foreground">{quote.pickup_address} to {quote.delivery_address}</p>
                    <div className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
                      <span className="rounded-md border bg-background/50 p-2">
                        <span className="block text-xs text-muted-foreground">Package</span>
                        {quote.package_type}
                      </span>
                      <span className="rounded-md border bg-background/50 p-2">
                        <span className="block text-xs text-muted-foreground">Weight</span>
                        {quote.weight_kg} kg
                      </span>
                      <span className="rounded-md border bg-background/50 p-2">
                        <span className="flex items-center gap-1 text-xs text-muted-foreground"><DollarSign className="size-3" /> Estimate</span>
                        {moneyFormatter.format(Number(quote.estimated_price ?? 0))} / {quote.estimated_eta_hours}h
                      </span>
                    </div>
                    {quote.notes && <p className="mt-3 rounded-md border bg-background/35 p-3 text-sm text-muted-foreground">{quote.notes}</p>}
                  </div>
                  <div className="grid gap-2 sm:grid-cols-[minmax(0,220px)_auto] lg:min-w-[380px]">
                    <select
                      value={quoteDriverIds[quote.request_id] ?? ""}
                      onChange={(event) => updateQuoteDriver(quote.request_id, event.target.value)}
                      disabled={converted || convertingRequestId === quote.request_id}
                      className="h-10 rounded-md border bg-background/70 px-3 text-sm"
                    >
                      <option value="">Create unassigned</option>
                      {drivers.map((driver) => <option key={String(driver.id)} value={String(driver.id)}>{driver.name}</option>)}
                    </select>
                    <Button
                      type="button"
                      disabled={converted || convertingRequestId === quote.request_id}
                      onClick={() => void convertQuoteRequest(quote.request_id)}
                    >
                      {convertingRequestId === quote.request_id ? <Loader2 className="animate-spin" /> : <ArrowRight />}
                      {converted ? "Converted" : "Convert"}
                    </Button>
                    {quote.customer_phone ? (
                      <Button asChild type="button" variant="outline" className="sm:col-span-2">
                        <a
                          href={customerWhatsAppUrl(quote.customer_phone, whatsappMessages.quoteReceived(quote))}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <MessageCircle />
                          Chat on WhatsApp
                        </a>
                      </Button>
                    ) : (
                      <Button type="button" variant="outline" className="sm:col-span-2" disabled>
                        <MessageCircle />
                        No WhatsApp phone
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
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
              <div className="mt-4 grid gap-2 sm:grid-cols-3">
                {shipment.customer_phone ? (
                  <>
                    <Button asChild type="button" variant="outline">
                      <a href={customerWhatsAppUrl(shipment.customer_phone, whatsappMessages.notifyCustomer(shipment))} target="_blank" rel="noreferrer">
                        <BellRing />
                        Notify customer
                      </a>
                    </Button>
                    <Button asChild type="button" variant="outline">
                      <a href={customerWhatsAppUrl(shipment.customer_phone, whatsappMessages.sendTrackingId(shipment))} target="_blank" rel="noreferrer">
                        <Send />
                        Send tracking ID
                      </a>
                    </Button>
                    <Button asChild type="button" variant="outline">
                      <a href={customerWhatsAppUrl(shipment.customer_phone, whatsappMessages.deliveryUpdate(shipment))} target="_blank" rel="noreferrer">
                        <MessageCircle />
                        Send delivery update
                      </a>
                    </Button>
                  </>
                ) : (
                  <div className="rounded-md border bg-background/40 p-3 text-sm text-muted-foreground sm:col-span-3">
                    Add a customer phone number to enable WhatsApp notifications for this shipment.
                  </div>
                )}
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
                            <span className="text-xs text-muted-foreground">{event.location ?? "Network event"}{event.occurred_at ? ` - ${new Date(event.occurred_at).toLocaleString()}` : ""}</span>
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
