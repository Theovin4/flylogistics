"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, CreditCard, FileText, Loader2, MapPinned, PackagePlus, PlaneLanding, PlaneTakeoff, Plus, Trash2, Wallet } from "lucide-react";
import { CloudinaryUpload } from "@/components/cloudinary/cloudinary-upload";
import { flyError, flyInfo, flySuccess } from "@/components/feedback/fly-toast";
import { CryptoPaymentPanel, type CryptoPayment } from "@/components/payments/crypto-payment-panel";
import { CountryStateSelect } from "@/components/shipments/country-state-select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { freightClassificationOptions, freightModeOptions, supportedCurrencies } from "@/lib/international";
import { deliveryTypeOptions, pricingUrgencies } from "@/lib/pricing";

type CustomerProfile = { email: string | null; full_name: string | null; phone?: string | null };
type WalletSummary = { balance?: number | string | null; currency?: string | null } | null;
type CustomerAddress = { id: number | string; label: string; address_type: string; address: string; city?: string | null };
type BookingForm = {
  recipientName: string; recipientEmail: string; pickupPhone: string; deliveryPhone: string; pickupEmail: string;
  pickupCountry: string; destinationCountry: string; pickupState: string; destinationState: string;
  pickupCity: string; deliveryCity: string; pickupPostalCode: string; deliveryPostalCode: string;
  pickupAddress: string; deliveryAddress: string; packageType: string; packageCategory: string;
  weightKg: string; quantity: string; fragile: boolean; packageLengthCm: string; packageWidthCm: string; packageHeightCm: string;
  shipmentPurpose: string; commercialShipment: boolean; restrictedAcknowledged: boolean; documentUrls: string[];
  freightMode: string; quoteCurrency: string; freightClassification: string; customsInformation: string;
  packageValue: string; dutiesTaxesAmount: string; exportImportDocuments: string; urgency: string; deliveryCategory: string; notes: string;
};
type CartItem = BookingForm & { id: string; amount: number; formattedAmount: string; etaLabel: string; vehicleType: string; warnings: string[]; requestId?: string };

const initialForm: BookingForm = {
  recipientName: "", recipientEmail: "", pickupPhone: "", deliveryPhone: "", pickupEmail: "",
  pickupCountry: "Nigeria", destinationCountry: "Nigeria", pickupState: "LA", destinationState: "LA",
  pickupCity: "", deliveryCity: "", pickupPostalCode: "", deliveryPostalCode: "", pickupAddress: "", deliveryAddress: "",
  packageType: "", packageCategory: "Documents", weightKg: "2", quantity: "1", fragile: false,
  packageLengthCm: "", packageWidthCm: "", packageHeightCm: "", shipmentPurpose: "", commercialShipment: false,
  restrictedAcknowledged: false, documentUrls: [], freightMode: "air_freight", quoteCurrency: "NGN",
  freightClassification: "general_cargo", customsInformation: "", packageValue: "", dutiesTaxesAmount: "",
  exportImportDocuments: "", urgency: "standard", deliveryCategory: "local_nigeria", notes: ""
};
const packageCategories = ["Documents", "Food and groceries", "Fashion", "Electronics", "Household goods", "Commercial goods", "Other"];
const deliveryModes = [
  { value: "local_nigeria", label: "Local / Nigeria", detail: "Same-state and interstate delivery", icon: MapPinned },
  { value: "international_import", label: "Import to Nigeria", detail: "Ship from another country into Nigeria", icon: PlaneLanding },
  { value: "international_export", label: "Export from Nigeria", detail: "Ship from Nigeria to another country", icon: PlaneTakeoff }
] as const;
const money = new Intl.NumberFormat("en-NG", { currency: "NGN", maximumFractionDigits: 0, style: "currency" });
const numberOrUndefined = (value: string) => value ? Number(value) : undefined;

export function CustomerBookingWorkspace({ customer, wallet, addresses = [], authorizedFetch, onChanged, prefill }: {
  customer: CustomerProfile | null; wallet?: WalletSummary; addresses?: CustomerAddress[];
  authorizedFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>; onChanged: () => void;
  prefill?: Partial<BookingForm> & { id?: string };
}) {
  const base = () => ({ ...initialForm, pickupPhone: customer?.phone ?? "", pickupEmail: customer?.email ?? "" });
  const [form, setForm] = useState<BookingForm>(base);
  const [items, setItems] = useState<CartItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [paying, setPaying] = useState<"wallet" | "flutterwave" | "crypto" | null>(null);
  const [cryptoNetwork, setCryptoNetwork] = useState<"TRC20" | "BEP20" | "SOL" | "BTC">("TRC20");
  const [cryptoPayment, setCryptoPayment] = useState<CryptoPayment | null>(null);
  const [showPayment, setShowPayment] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const total = useMemo(() => items.reduce((sum, item) => sum + item.amount, 0), [items]);
  const walletBalance = Number(wallet?.balance ?? 0) || 0;
  const allSaved = items.length > 0 && items.every((item) => item.requestId);
  const international = form.deliveryCategory !== "local_nigeria";
  const modeDetail = deliveryTypeOptions.find((option) => option.value === form.deliveryCategory)?.detail;

  useEffect(() => {
    if (!prefill) return;
    const { id: _id, ...values } = prefill;
    void _id;
    setForm((current) => ({ ...current, ...values }));
  }, [prefill]);

  function update<Key extends keyof BookingForm>(key: Key, value: BookingForm[Key]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function chooseMode(value: string) {
    setForm({
      ...base(), deliveryCategory: value,
      pickupCountry: value === "international_import" ? "" : "Nigeria",
      destinationCountry: value === "international_export" ? "" : "Nigeria",
      pickupState: value === "international_import" ? "" : "LA",
      destinationState: value === "international_export" ? "" : "LA"
    });
    setError(null);
    setMessage(null);
  }

  function applySavedAddress(kind: "pickup" | "delivery", id: string) {
    const saved = addresses.find((entry) => String(entry.id) === id);
    if (!saved) return;
    setForm((current) => kind === "pickup"
      ? { ...current, pickupAddress: saved.address, pickupCity: saved.city ?? current.pickupCity }
      : { ...current, deliveryAddress: saved.address, deliveryCity: saved.city ?? current.deliveryCity });
  }

  function payload(source: BookingForm) {
    return {
      customerName: customer?.full_name ?? "Fly Logistics Customer", customerEmail: customer?.email ?? "",
      customerPhone: customer?.phone || source.pickupPhone, recipientName: source.recipientName, recipientEmail: source.recipientEmail,
      pickupPhone: source.pickupPhone, deliveryPhone: source.deliveryPhone, pickupEmail: source.pickupEmail || customer?.email || "",
      pickupCountry: source.pickupCountry, destinationCountry: source.destinationCountry, pickupState: source.pickupState,
      destinationState: source.destinationState, pickupCity: source.pickupCity, deliveryCity: source.deliveryCity,
      pickupPostalCode: source.pickupPostalCode, deliveryPostalCode: source.deliveryPostalCode,
      pickupAddress: source.pickupAddress, deliveryAddress: source.deliveryAddress, packageType: source.packageType,
      packageCategory: source.packageCategory, weightKg: Number(source.weightKg), quantity: Number(source.quantity), fragile: source.fragile,
      packageLengthCm: numberOrUndefined(source.packageLengthCm), packageWidthCm: numberOrUndefined(source.packageWidthCm),
      packageHeightCm: numberOrUndefined(source.packageHeightCm), shipmentPurpose: source.shipmentPurpose,
      commercialShipment: source.commercialShipment, restrictedAcknowledged: source.restrictedAcknowledged,
      documentUrls: source.documentUrls, freightMode: source.freightMode, quoteCurrency: source.quoteCurrency,
      freightClassification: source.freightClassification, customsInformation: source.customsInformation,
      packageValue: numberOrUndefined(source.packageValue), dutiesTaxesAmount: numberOrUndefined(source.dutiesTaxesAmount),
      exportImportDocuments: source.exportImportDocuments, urgency: source.urgency, deliveryCategory: source.deliveryCategory,
      notes: source.notes, formStartedAt: Date.now() - 3000
    };
  }

  async function postBooking(source: BookingForm) {
    const response = await authorizedFetch("/api/quote-requests", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload(source)) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "Unable to save this booking.");
    return data;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError(null); setMessage(null);
    try {
      if (international) {
        const data = await postBooking(form);
        const text = `Request ${data.request_id} received. Fly Logistics will confirm the final price, route, and documentation before payment.`;
        setMessage(text); flySuccess("International request received", text);
        chooseMode(form.deliveryCategory); onChanged(); return;
      }
      const response = await fetch("/api/pricing/quote", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload(form)) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to calculate delivery price.");
      setItems((current) => [...current, { ...form, id: crypto.randomUUID(), amount: Number(data.amount ?? 0), formattedAmount: data.formattedAmount ?? money.format(Number(data.amount ?? 0)), etaLabel: data.etaLabel ?? "ETA pending", vehicleType: data.vehicleType ?? "Vehicle pending", warnings: data.warnings ?? [] }]);
      setForm(base()); setMessage("Delivery price added to your cart."); flySuccess("Price ready", "Add another shipment or continue to payment.");
    } catch (caught) {
      const text = caught instanceof Error ? caught.message : "Unable to prepare this booking.";
      setError(text); flyError("Booking needs attention", text);
    } finally { setBusy(false); }
  }

  async function saveBookings() {
    if (!items.length) return null;
    setBusy(true); setError(null);
    try {
      const saved: CartItem[] = [];
      for (const item of items) saved.push(item.requestId ? item : { ...item, requestId: (await postBooking(item)).request_id });
      setItems(saved); setMessage(`${saved.length} booking${saved.length === 1 ? "" : "s"} saved and ready for payment.`); onChanged();
      return saved;
    } catch (caught) {
      const text = caught instanceof Error ? caught.message : "Unable to save bookings.";
      setError(text); flyError("Unable to save booking", text); return null;
    } finally { setBusy(false); }
  }

  async function pay(method: "wallet" | "flutterwave" | "crypto") {
    setPaying(method); setError(null);
    try {
      if (method === "wallet" && walletBalance < total) throw new Error(`Your wallet balance is ${money.format(walletBalance)}. Fund your wallet or choose another payment method.`);
      const payable = allSaved ? items : await saveBookings();
      const requestIds = (payable ?? []).map((item) => item.requestId).filter(Boolean) as string[];
      if (!requestIds.length) throw new Error("Save the shipping orders before payment.");
      if (method === "wallet") {
        const response = await authorizedFetch("/api/customer/wallet/pay", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ requestIds }) });
        const data = await response.json(); if (!response.ok) throw new Error(data.error ?? "Unable to pay with wallet.");
        const text = `Payment complete. ${data.shipments?.length ?? 0} shipment${data.shipments?.length === 1 ? "" : "s"} created with Fly Logistics tracking.`;
        setMessage(text); flySuccess("Payment complete", text); setItems([]); setShowPayment(false); onChanged(); return;
      }
      const response = await authorizedFetch(`/api/payments/${method}/checkout`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(method === "crypto" ? { requestIds, network: cryptoNetwork } : { requestIds }) });
      const data = await response.json();
      if (method === "crypto") {
        if (!response.ok || !data.payment) throw new Error(data.error ?? "Unable to prepare crypto payment.");
        setCryptoPayment(data.payment); flyInfo("Crypto payment prepared", "Send the exact amount and submit the transaction hash for review."); return;
      }
      if (!response.ok || !data.checkoutUrl) throw new Error(data.error ?? "Unable to start secure checkout.");
      flyInfo("Opening secure checkout", "Your Fly Logistics payment page is loading."); window.location.assign(data.checkoutUrl);
    } catch (caught) {
      const text = caught instanceof Error ? caught.message : "Unable to complete payment.";
      setError(text); flyError("Unable to complete payment", text);
    } finally { setPaying(null); }
  }

  const SavedAddress = ({ kind }: { kind: "pickup" | "delivery" }) => addresses.length > 0 ? (
    <div className="grid gap-2"><Label htmlFor={`saved-${kind}`}>Use a saved {kind} address</Label><select id={`saved-${kind}`} defaultValue="" onChange={(event) => applySavedAddress(kind, event.target.value)} className="h-11 rounded-md border bg-background/70 px-3 text-sm"><option value="">Choose saved address</option>{addresses.map((address) => <option key={address.id} value={address.id}>{address.label} - {address.address}</option>)}</select></div>
  ) : null;

  return (
    <Card id="customer-booking" className="glass scroll-mt-24 overflow-hidden">
      <CardHeader className="border-b border-border/60 bg-background/30"><div className="flex flex-wrap gap-2"><Badge className="border-primary/40 bg-primary/10 text-primary">Create shipment</Badge><Badge>Secure customer booking</Badge></div><CardTitle className="mt-3 text-2xl sm:text-3xl">Where is your shipment going?</CardTitle><p className="max-w-3xl text-sm leading-6 text-muted-foreground">Choose the delivery type first. You will only see the details needed for that shipment.</p></CardHeader>
      <CardContent className="grid gap-5 p-4 sm:p-6">
        {message && <div role="status" className="flex gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-500"><CheckCircle2 className="mt-0.5 size-4 shrink-0" />{message}</div>}
        {error && <div role="alert" className="flex gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"><AlertTriangle className="mt-0.5 size-4 shrink-0" />{error}</div>}
        <div className="grid gap-3 sm:grid-cols-3" role="radiogroup" aria-label="Delivery type">{deliveryModes.map((mode) => { const Icon = mode.icon; const active = form.deliveryCategory === mode.value; return <button key={mode.value} type="button" role="radio" aria-checked={active} onClick={() => chooseMode(mode.value)} className={`min-h-28 rounded-md border p-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${active ? "border-primary bg-primary/10 shadow-[0_0_24px_rgba(255,122,0,0.12)]" : "bg-background/40 hover:border-primary/50"}`}><Icon className={`size-5 ${active ? "text-primary" : "text-muted-foreground"}`} /><span className="mt-3 block font-bold">{mode.label}</span><span className="mt-1 block text-xs leading-5 text-muted-foreground">{mode.detail}</span></button>; })}</div>
        <div className="rounded-md border border-primary/25 bg-primary/5 p-3 text-sm text-muted-foreground">{modeDetail}</div>

        <form className="grid gap-5" onSubmit={submit}>
          <section className="grid gap-4 rounded-md border bg-background/35 p-4 sm:p-5"><div><h3 className="font-bold">Pickup details</h3><p className="mt-1 text-xs text-muted-foreground">Where and who should we collect from?</p></div><SavedAddress kind="pickup" /><div className="grid gap-3 md:grid-cols-2"><div className="grid gap-2"><Label>Sender name</Label><Input value={customer?.full_name ?? "Fly Logistics Customer"} disabled /></div><div className="grid gap-2"><Label htmlFor="pickup-phone">Pickup phone</Label><Input id="pickup-phone" type="tel" inputMode="tel" autoComplete="tel" value={form.pickupPhone} onChange={(event) => update("pickupPhone", event.target.value)} placeholder="Include country code" required /></div>{international && <div className="grid gap-2 md:col-span-2"><Label htmlFor="pickup-email">Sender email</Label><Input id="pickup-email" type="email" value={form.pickupEmail} onChange={(event) => update("pickupEmail", event.target.value)} required /></div>}</div><CountryStateSelect idPrefix="booking-pickup" country={form.pickupCountry} state={form.pickupState} onCountryChange={(value) => update("pickupCountry", value)} onStateChange={(value) => update("pickupState", value)} countryLabel="Pickup country" stateLabel="Pickup state or province" lockCountry={form.deliveryCategory === "international_import" ? undefined : "Nigeria"} /><div className="grid gap-3 md:grid-cols-2"><div className="grid gap-2"><Label htmlFor="pickup-city">Pickup city or area</Label><Input id="pickup-city" autoComplete="address-level2" value={form.pickupCity} onChange={(event) => update("pickupCity", event.target.value)} required /></div>{international && <div className="grid gap-2"><Label htmlFor="pickup-postal">Postal code <span className="text-muted-foreground">(optional)</span></Label><Input id="pickup-postal" autoComplete="postal-code" value={form.pickupPostalCode} onChange={(event) => update("pickupPostalCode", event.target.value)} /></div>}</div><div className="grid gap-2"><Label htmlFor="pickup-address">Full pickup address</Label><Input id="pickup-address" autoComplete="street-address" value={form.pickupAddress} onChange={(event) => update("pickupAddress", event.target.value)} placeholder="Street, building and nearest landmark" required /></div></section>

          <section className="grid gap-4 rounded-md border bg-background/35 p-4 sm:p-5"><div><h3 className="font-bold">Delivery details</h3><p className="mt-1 text-xs text-muted-foreground">Enter the receiver details exactly as they should appear.</p></div><SavedAddress kind="delivery" /><div className="grid gap-3 md:grid-cols-2"><div className="grid gap-2"><Label htmlFor="recipient-name">Receiver name</Label><Input id="recipient-name" autoComplete="name" value={form.recipientName} onChange={(event) => update("recipientName", event.target.value)} required /></div><div className="grid gap-2"><Label htmlFor="delivery-phone">Receiver phone</Label><Input id="delivery-phone" type="tel" inputMode="tel" autoComplete="tel" value={form.deliveryPhone} onChange={(event) => update("deliveryPhone", event.target.value)} placeholder="Include country code" required /></div>{international && <div className="grid gap-2 md:col-span-2"><Label htmlFor="recipient-email">Receiver email</Label><Input id="recipient-email" type="email" value={form.recipientEmail} onChange={(event) => update("recipientEmail", event.target.value)} required /></div>}</div><CountryStateSelect idPrefix="booking-destination" country={form.destinationCountry} state={form.destinationState} onCountryChange={(value) => update("destinationCountry", value)} onStateChange={(value) => update("destinationState", value)} countryLabel="Delivery country" stateLabel="Delivery state or province" lockCountry={form.deliveryCategory === "international_export" ? undefined : "Nigeria"} /><div className="grid gap-3 md:grid-cols-2"><div className="grid gap-2"><Label htmlFor="delivery-city">Delivery city or area</Label><Input id="delivery-city" autoComplete="address-level2" value={form.deliveryCity} onChange={(event) => update("deliveryCity", event.target.value)} required /></div>{international && <div className="grid gap-2"><Label htmlFor="delivery-postal">Postal code <span className="text-muted-foreground">(optional)</span></Label><Input id="delivery-postal" autoComplete="postal-code" value={form.deliveryPostalCode} onChange={(event) => update("deliveryPostalCode", event.target.value)} /></div>}</div><div className="grid gap-2"><Label htmlFor="delivery-address">Full delivery address</Label><Input id="delivery-address" autoComplete="street-address" value={form.deliveryAddress} onChange={(event) => update("deliveryAddress", event.target.value)} placeholder="Street, building and nearest landmark" required /></div></section>

          <section className="grid gap-4 rounded-md border bg-background/35 p-4 sm:p-5"><div><h3 className="font-bold">Package and service</h3><p className="mt-1 text-xs text-muted-foreground">Accurate details help us price and handle the shipment safely.</p></div><div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4"><div className="grid gap-2"><Label htmlFor="package-category">Category</Label><select id="package-category" value={form.packageCategory} onChange={(event) => update("packageCategory", event.target.value)} className="h-11 rounded-md border bg-background/70 px-3 text-sm">{packageCategories.map((category) => <option key={category}>{category}</option>)}</select></div><div className="grid gap-2 lg:col-span-2"><Label htmlFor="package-description">Package description</Label><Input id="package-description" value={form.packageType} onChange={(event) => update("packageType", event.target.value)} placeholder="What are you sending?" required /></div><div className="grid gap-2"><Label htmlFor="weight">Weight (kg)</Label><Input id="weight" type="number" inputMode="decimal" min="0.1" step="0.1" value={form.weightKg} onChange={(event) => update("weightKg", event.target.value)} required /></div><div className="grid gap-2"><Label htmlFor="quantity">Quantity</Label><Input id="quantity" type="number" inputMode="numeric" min="1" step="1" value={form.quantity} onChange={(event) => update("quantity", event.target.value)} required /></div><div className="grid gap-2"><Label htmlFor="urgency">Service speed</Label><select id="urgency" value={form.urgency} onChange={(event) => update("urgency", event.target.value)} className="h-11 rounded-md border bg-background/70 px-3 text-sm">{pricingUrgencies.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></div><label className="flex min-h-11 items-center gap-3 rounded-md border bg-background/60 px-3 text-sm"><input type="checkbox" checked={form.fragile} onChange={(event) => update("fragile", event.target.checked)} className="size-4 accent-primary" />Fragile item</label><div className="grid gap-2 lg:col-span-2"><Label htmlFor="notes">Handling notes <span className="text-muted-foreground">(optional)</span></Label><Input id="notes" value={form.notes} onChange={(event) => update("notes", event.target.value)} /></div></div></section>

          {international && <section className="grid gap-4 rounded-md border border-primary/30 bg-primary/5 p-4 sm:p-5"><div><h3 className="font-bold">International shipment review</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">Final price, customs requirements, duties, and route are confirmed before payment. Customs notes and documents are optional at this stage.</p></div><div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3"><div className="grid gap-2"><Label>Freight mode</Label><select value={form.freightMode} onChange={(event) => update("freightMode", event.target.value)} className="h-11 rounded-md border bg-background/70 px-3 text-sm">{freightModeOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></div><div className="grid gap-2"><Label>Quote currency</Label><select value={form.quoteCurrency} onChange={(event) => update("quoteCurrency", event.target.value)} className="h-11 rounded-md border bg-background/70 px-3 text-sm">{supportedCurrencies.map((item) => <option key={item}>{item}</option>)}</select></div><div className="grid gap-2"><Label>Classification</Label><select value={form.freightClassification} onChange={(event) => update("freightClassification", event.target.value)} className="h-11 rounded-md border bg-background/70 px-3 text-sm">{freightClassificationOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></div><div className="grid gap-2"><Label>Declared package value</Label><Input type="number" inputMode="decimal" min="0.01" value={form.packageValue} onChange={(event) => update("packageValue", event.target.value)} required /></div><div className="grid gap-2"><Label>Shipment purpose</Label><Input value={form.shipmentPurpose} onChange={(event) => update("shipmentPurpose", event.target.value)} placeholder="Personal, sale, gift, sample..." required /></div><label className="flex min-h-11 items-center gap-3 rounded-md border bg-background/60 px-3 text-sm"><input type="checkbox" checked={form.commercialShipment} onChange={(event) => update("commercialShipment", event.target.checked)} className="size-4 accent-primary" />Commercial shipment</label></div><div className="grid gap-3 sm:grid-cols-3">{(["packageLengthCm", "packageWidthCm", "packageHeightCm"] as const).map((field) => <div key={field} className="grid gap-2"><Label>{field === "packageLengthCm" ? "Length" : field === "packageWidthCm" ? "Width" : "Height"} (cm) <span className="text-muted-foreground">optional</span></Label><Input type="number" inputMode="decimal" value={form[field]} onChange={(event) => update(field, event.target.value)} /></div>)}</div><div className="grid gap-3 md:grid-cols-2"><div className="grid gap-2"><Label>Customs information <span className="text-muted-foreground">(optional)</span></Label><textarea value={form.customsInformation} onChange={(event) => update("customsInformation", event.target.value)} className="min-h-24 rounded-md border bg-background/70 px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary" /></div><div className="grid gap-2"><Label>Documentation notes <span className="text-muted-foreground">(optional)</span></Label><textarea value={form.exportImportDocuments} onChange={(event) => update("exportImportDocuments", event.target.value)} className="min-h-24 rounded-md border bg-background/70 px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary" /></div></div><CloudinaryUpload folder="fly-logistics/packages/international-documents" label="Upload optional shipment document" description="PDF, JPG, PNG, or WebP. Maximum 10 MB per file." variant="panel" acceptDocuments onUploaded={(asset) => setForm((current) => ({ ...current, documentUrls: [...current.documentUrls, asset.secureUrl].slice(0, 8) }))} />{form.documentUrls.map((url, index) => <div key={url} className="flex items-center justify-between gap-3 rounded-md border bg-background/60 p-3 text-sm"><span className="flex items-center gap-2"><FileText className="size-4 text-primary" />Document {index + 1}</span><Button type="button" size="sm" variant="ghost" onClick={() => setForm((current) => ({ ...current, documentUrls: current.documentUrls.filter((entry) => entry !== url) }))}><Trash2 />Remove</Button></div>)}<label className="flex items-start gap-3 rounded-md border border-primary/30 bg-background/60 p-3 text-sm leading-6"><input type="checkbox" checked={form.restrictedAcknowledged} onChange={(event) => update("restrictedAcknowledged", event.target.checked)} className="mt-1 size-4 accent-primary" required /><span>I confirm this shipment has no undeclared prohibited, dangerous, or restricted items.</span></label></section>}

          <Button type="submit" size="lg" disabled={busy} className="min-h-12 w-full sm:w-auto sm:min-w-64">{busy ? <Loader2 className="animate-spin" /> : international ? <PlaneTakeoff /> : <Plus />}{busy ? "Preparing request" : international ? "Submit for final review" : "Get price and add shipment"}</Button>
        </form>

        {!international && <section className="grid gap-3 border-t border-border/60 pt-5"><div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><div><h3 className="text-lg font-black">Booking cart</h3><p className="text-xs text-muted-foreground">Pay for one or several local shipments together.</p></div><Badge>{items.length} shipment{items.length === 1 ? "" : "s"} · {money.format(total)}</Badge></div>{items.length === 0 && <div className="rounded-md border bg-background/35 p-4 text-sm text-muted-foreground">Complete the local shipment form to see an instant price.</div>}{items.map((item, index) => <div key={item.id} className="grid gap-3 rounded-md border bg-background/35 p-4 sm:grid-cols-[1fr_auto]"><div><div className="flex flex-wrap gap-2"><Badge>Shipment {index + 1}</Badge>{item.requestId && <Badge className="border-emerald-500/40 bg-emerald-500/10 text-emerald-500">Saved</Badge>}<Badge>{item.vehicleType}</Badge></div><p className="mt-3 font-semibold">{item.pickupCity} to {item.deliveryCity}</p><p className="mt-1 text-sm text-muted-foreground">{item.packageType} for {item.recipientName}. {item.etaLabel}.</p>{item.warnings.length > 0 && <p className="mt-2 text-xs text-primary">{item.warnings.join(" ")}</p>}</div><div className="flex items-center justify-between gap-3 sm:flex-col sm:items-end"><span className="font-mono text-xl font-black">{item.formattedAmount}</span>{!item.requestId && <Button type="button" size="sm" variant="outline" onClick={() => setItems((current) => current.filter((entry) => entry.id !== item.id))}><Trash2 />Remove</Button>}</div></div>)}{showPayment && items.length > 0 && <div className="grid gap-4 rounded-md border border-primary/30 bg-primary/10 p-4"><div><h4 className="text-lg font-black">Choose payment method</h4><p className="mt-1 text-sm text-muted-foreground">Wallet: <strong className="text-foreground">{money.format(walletBalance)}</strong>. Total: <strong className="text-foreground">{money.format(total)}</strong>.</p></div><div className="grid gap-3 lg:grid-cols-3"><Button type="button" disabled={paying !== null || busy} onClick={() => void pay("wallet")} className="min-h-12">{paying === "wallet" ? <Loader2 className="animate-spin" /> : <Wallet />}Pay from wallet</Button><Button type="button" variant="outline" disabled={paying !== null || busy} onClick={() => void pay("flutterwave")} className="min-h-12">{paying === "flutterwave" ? <Loader2 className="animate-spin" /> : <CreditCard />}Card or bank</Button><div className="grid gap-2"><select aria-label="Crypto network" value={cryptoNetwork} onChange={(event) => setCryptoNetwork(event.target.value as typeof cryptoNetwork)} className="h-10 rounded-md border bg-background px-3 text-sm"><option value="TRC20">USDT (TRC20)</option><option value="BEP20">USDT (BEP20)</option><option value="SOL">USDT (Solana)</option><option value="BTC">Bitcoin</option></select><Button type="button" variant="outline" disabled={paying !== null || busy} onClick={() => void pay("crypto")}>{paying === "crypto" ? <Loader2 className="animate-spin" /> : <CreditCard />}Pay with crypto</Button></div></div>{cryptoPayment && <CryptoPaymentPanel payment={cryptoPayment} authorizedFetch={authorizedFetch} onSubmitted={onChanged} />}</div>}<div className="grid gap-2 sm:grid-cols-3"><Button type="button" disabled={!items.length || paying !== null} onClick={() => { setShowPayment(true); flyInfo("Choose payment method", "Your secure payment options are ready."); }}><CreditCard />Make payment</Button><Button type="button" variant="outline" disabled={!items.length || busy || allSaved} onClick={() => void saveBookings()}>{busy ? <Loader2 className="animate-spin" /> : <PackagePlus />}Save booking</Button><Button type="button" variant="outline" disabled={!items.length || busy || paying !== null} onClick={() => { setItems([]); setShowPayment(false); setMessage("Booking cart cleared."); }}><Trash2 />Clear cart</Button></div></section>}
      </CardContent>
    </Card>
  );
}
