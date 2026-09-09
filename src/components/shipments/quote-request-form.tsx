"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import type { Route as NextRoute } from "next";
import { CheckCircle2, Clock3, CreditCard, Loader2, LogIn, MessageCircle, PackageCheck, Route, Send, ShieldCheck, UserPlus } from "lucide-react";
import { getWhatsAppUrl, whatsappMessages } from "@/lib/contact";
import { freightClassificationOptions, freightModeOptions, supportedCurrencies } from "@/lib/international";
import { deliveryTypeOptions } from "@/lib/pricing";
import { trackConversion } from "@/lib/analytics";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CountryStateSelect } from "@/components/shipments/country-state-select";

type QuoteResponse = {
  request_id: string;
  estimated_price: number | string;
  estimated_eta_hours: number;
  payment_status?: string | null;
  payment_reference?: string | null;
  payment_amount?: number | string | null;
  payment_provider?: string | null;
  delivery_type?: string | null;
  vehicle_type?: string | null;
  service_warnings?: string[] | null;
  pricing?: {
    formattedAmount: string;
    etaLabel: string;
    vehicleType: string;
    deliveryType: string;
    serviceAvailable: boolean;
    warnings: string[];
    terms: string[];
    currency?: string;
    formattedByCurrency?: Record<string, string>;
    international?: {
      freightModeLabel: string;
      freightClassificationLabel: string;
      formattedQuoteAmount: string;
      trackingLabel: string;
      etaLabel: string;
      customsDocuments: string[];
      documentationStatus: string;
    };
  };
  warning?: string;
};

type QuoteRequestFormProps = {
  accountMode?: boolean;
  customer?: {
    email?: string | null;
    full_name?: string | null;
    phone?: string | null;
  } | null;
  onSubmitted?: () => void;
};

function makeInitialState(customer?: QuoteRequestFormProps["customer"]) {
  return {
    customerName: customer?.full_name ?? "",
    customerEmail: customer?.email ?? "",
    customerPhone: customer?.phone ?? "",
    recipientName: "",
    pickupPhone: customer?.phone ?? "",
    deliveryPhone: "",
    pickupCountry: "Nigeria",
    destinationCountry: "Nigeria",
    pickupState: "LA",
    destinationState: "LA",
    pickupAddress: "",
    deliveryAddress: "",
    packageType: "",
    weightKg: "5",
    freightMode: "air_freight",
    quoteCurrency: "NGN",
    freightClassification: "general_cargo",
    customsInformation: "",
    packageValue: "",
    dutiesTaxesAmount: "",
    exportImportDocuments: "",
    urgency: "standard",
    deliveryCategory: "local_nigeria",
    notes: "",
    website: ""
  };
}

const initialState = makeInitialState();

type QuoteFormState = typeof initialState;

const emptyShipmentFields: Pick<QuoteFormState, "recipientName" | "pickupPhone" | "deliveryPhone" | "pickupCountry" | "destinationCountry" | "pickupState" | "destinationState" | "pickupAddress" | "deliveryAddress" | "packageType" | "weightKg" | "freightMode" | "quoteCurrency" | "freightClassification" | "customsInformation" | "packageValue" | "dutiesTaxesAmount" | "exportImportDocuments" | "urgency" | "deliveryCategory" | "notes" | "website"> = {
  recipientName: "",
  pickupPhone: "",
  deliveryPhone: "",
  pickupCountry: "Nigeria",
  destinationCountry: "Nigeria",
  pickupState: "LA",
  destinationState: "LA",
  pickupAddress: "",
  deliveryAddress: "",
  packageType: "",
  weightKg: "5",
  freightMode: "air_freight",
  quoteCurrency: "NGN",
  freightClassification: "general_cargo",
  customsInformation: "",
  packageValue: "",
  dutiesTaxesAmount: "",
  exportImportDocuments: "",
  urgency: "standard",
  deliveryCategory: "local_nigeria",
  notes: "",
  website: ""
};

const urgencyOptions = [
  { value: "standard", label: "Standard", detail: "Best value for planned deliveries" },
  { value: "priority", label: "Priority", detail: "Faster handling and dispatch review" },
  { value: "critical", label: "Critical", detail: "Urgent operations escalation" }
] as const;

const moneyFormatter = new Intl.NumberFormat("en-NG", {
  currency: "NGN",
  maximumFractionDigits: 0,
  style: "currency"
});

const bookingSignals = [
  { icon: ShieldCheck, label: "Secure intake", detail: "Private request handling" },
  { icon: Route, label: "Ops reviewed", detail: "Matched to route and driver" },
  { icon: PackageCheck, label: "Trackable shipment", detail: "Tracking ID after approval" }
] as const;

export function QuoteRequestForm({ accountMode = false, customer, onSubmitted }: QuoteRequestFormProps) {
  const [form, setForm] = useState(() => makeInitialState(customer));
  const [formStartedAt] = useState(() => Date.now());
  const [loading, setLoading] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quote, setQuote] = useState<QuoteResponse | null>(null);
  const [submittedForm, setSubmittedForm] = useState(initialState);

  useEffect(() => {
    if (!accountMode) return;
    setForm((current) => ({
      ...current,
      customerName: current.customerName || customer?.full_name || "",
      customerEmail: customer?.email || current.customerEmail,
      customerPhone: current.customerPhone || customer?.phone || "",
      pickupPhone: current.pickupPhone || customer?.phone || ""
    }));
  }, [accountMode, customer?.email, customer?.full_name, customer?.phone]);

  function updateField(field: keyof QuoteFormState, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function updateDeliveryType(value: string) {
    setForm((current) => ({
      ...current,
      deliveryCategory: value,
      pickupCountry: value === "international_import" ? "" : "Nigeria",
      destinationCountry: value === "international_export" ? "" : "Nigeria",
      pickupState: value === "international_import" ? "" : current.pickupState || "LA",
      destinationState: value === "international_export" ? "" : current.destinationState || "LA"
    }));
  }

  const quoteWhatsAppMessage = whatsappMessages.quoteRequest(form);
  const isImport = form.deliveryCategory === "international_import";
  const isExport = form.deliveryCategory === "international_export";
  const selectedDeliveryType = deliveryTypeOptions.find((option) => option.value === form.deliveryCategory) ?? deliveryTypeOptions[0];

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setQuote(null);

    try {
      const response = await fetch("/api/quote-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          pickupPhone: form.pickupPhone || form.customerPhone,
          weightKg: Number(form.weightKg),
          packageValue: form.packageValue ? Number(form.packageValue) : undefined,
          dutiesTaxesAmount: form.dutiesTaxesAmount ? Number(form.dutiesTaxesAmount) : undefined,
          formStartedAt
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to submit quote request.");
      setQuote(data);
      setSubmittedForm(form);
      setForm((current) => ({
        ...makeInitialState(customer),
        customerName: accountMode ? current.customerName : "",
        customerEmail: accountMode ? current.customerEmail : "",
        customerPhone: accountMode ? current.customerPhone : "",
        ...emptyShipmentFields
      }));
      onSubmitted?.();
      trackConversion("quote_request_submitted", {
        request_id: data.request_id,
        value: Number(data.estimated_price ?? 0),
        currency: data.pricing?.currency ?? "NGN",
        delivery_category: form.deliveryCategory,
        urgency: form.urgency
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to submit quote request.");
    } finally {
      setLoading(false);
    }
  }

  async function startCheckout(requestId: string) {
    setCheckoutLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/payments/flutterwave/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId })
      });
      const data = await response.json();
      if (!response.ok || !data.checkoutUrl) throw new Error(data.error ?? "Unable to start secure payment.");
      trackConversion("payment_initiated", {
        value: Number(quote?.request_id === requestId ? quote.estimated_price : 0),
        currency: quote?.pricing?.currency ?? "NGN",
        content_category: "shipment_booking"
      });
      window.location.href = data.checkoutUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to start secure payment.");
    } finally {
      setCheckoutLoading(false);
    }
  }

  return (
    <Card className="glass overflow-hidden">
      <CardHeader className="p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <Badge className="border-primary/40 bg-primary/10 text-primary">Booking request</Badge>
          <Badge>Live operations</Badge>
        </div>
        <CardTitle className="mt-3 text-xl sm:text-2xl">{accountMode ? "Book a shipment from your account" : "Get your instant delivery price"}</CardTitle>
        <p className="text-sm leading-6 text-muted-foreground">
          {accountMode
            ? "Every booking is linked to your customer account, payment history, wallet, tracking timeline, and support record."
            : "A quote is your delivery price estimate. Create a customer account before booking so every shipment is linked to your portal."}
        </p>
      </CardHeader>
      <CardContent className="p-5 pt-0 sm:p-6 sm:pt-0">
        <form className="grid gap-4" onSubmit={submit}>
          <div className="grid gap-3 rounded-md border bg-background/35 p-3 md:grid-cols-3">
            {bookingSignals.map((signal) => (
              <div key={signal.label} className="flex gap-3 text-sm">
                <signal.icon className="mt-0.5 size-4 shrink-0 text-primary" />
                <span>
                  <span className="block font-semibold">{signal.label}</span>
                  <span className="text-xs text-muted-foreground">{signal.detail}</span>
                </span>
              </div>
            ))}
          </div>
          <div className="hidden" aria-hidden="true">
            <Label htmlFor="website">Website</Label>
            <Input
              id="website"
              tabIndex={-1}
              autoComplete="off"
              value={form.website}
              onChange={(event) => updateField("website", event.target.value)}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="customerName">Full name</Label>
              <Input id="customerName" value={form.customerName} onChange={(event) => updateField("customerName", event.target.value)} placeholder="Jane Okafor" required readOnly={accountMode && Boolean(customer?.full_name)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="customerEmail">Email</Label>
              <Input id="customerEmail" type="email" value={form.customerEmail} onChange={(event) => updateField("customerEmail", event.target.value)} placeholder="jane@company.com" required readOnly={accountMode && Boolean(customer?.email)} />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="customerPhone">Phone</Label>
            <Input id="customerPhone" value={form.customerPhone} onChange={(event) => updateField("customerPhone", event.target.value)} placeholder="+234 800 000 0000" required />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="pickupPhone">Pickup contact phone</Label>
              <Input id="pickupPhone" value={form.pickupPhone} onChange={(event) => updateField("pickupPhone", event.target.value)} placeholder="Phone at pickup address" required />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="deliveryPhone">Receiver phone</Label>
              <Input id="deliveryPhone" value={form.deliveryPhone} onChange={(event) => updateField("deliveryPhone", event.target.value)} placeholder="Phone for delivery contact" required />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="recipientName">Receiver name</Label>
            <Input id="recipientName" value={form.recipientName} onChange={(event) => updateField("recipientName", event.target.value)} placeholder="Receiver or business name" required />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="deliveryCategory">Delivery type</Label>
            <select
              id="deliveryCategory"
              value={form.deliveryCategory}
              onChange={(event) => updateDeliveryType(event.target.value)}
              className="h-11 rounded-md border border-input bg-background/70 px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {deliveryTypeOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">{selectedDeliveryType.detail}</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <CountryStateSelect
              idPrefix="quote-pickup"
              country={form.pickupCountry}
              state={form.pickupState}
              onCountryChange={(value) => updateField("pickupCountry", value)}
              onStateChange={(value) => updateField("pickupState", value)}
              countryLabel="Origin country"
              stateLabel="Origin state or province"
              lockCountry={isImport ? undefined : "Nigeria"}
            />
            <CountryStateSelect
              idPrefix="quote-destination"
              country={form.destinationCountry}
              state={form.destinationState}
              onCountryChange={(value) => updateField("destinationCountry", value)}
              onStateChange={(value) => updateField("destinationState", value)}
              countryLabel="Destination country"
              stateLabel="Destination state or province"
              lockCountry={isExport ? undefined : "Nigeria"}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="pickupAddress">{isImport ? "Origin pickup address" : "Pickup address"}</Label>
              <Input id="pickupAddress" value={form.pickupAddress} onChange={(event) => updateField("pickupAddress", event.target.value)} placeholder={isImport ? "Warehouse, city, country" : "Warehouse, city, state"} required />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="deliveryAddress">{isExport ? "Destination delivery address" : "Delivery address"}</Label>
              <Input id="deliveryAddress" value={form.deliveryAddress} onChange={(event) => updateField("deliveryAddress", event.target.value)} placeholder={isExport ? "Recipient address, city, country" : "Recipient address, city, state"} required />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="grid gap-2">
              <Label htmlFor="packageType">Package type</Label>
              <Input id="packageType" value={form.packageType} onChange={(event) => updateField("packageType", event.target.value)} placeholder="Electronics, documents, cargo" required />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="weightKg">Weight kg</Label>
              <Input id="weightKg" type="number" min="0.1" step="0.1" value={form.weightKg} onChange={(event) => updateField("weightKg", event.target.value)} required />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="urgency">Urgency</Label>
              <select
                id="urgency"
                value={form.urgency}
                onChange={(event) => updateField("urgency", event.target.value)}
                className="h-11 rounded-md border border-input bg-background/70 px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {urgencyOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="rounded-md border border-primary/20 bg-primary/5 p-3 text-xs leading-5 text-muted-foreground">
            Local delivery covers movement inside Nigeria. Import requests move goods into Nigeria. Export requests move goods from Nigeria to worldwide destinations. Final international pricing depends on customs documents, duties, airline or carrier availability, and restricted item checks.
          </div>
          {(isImport || isExport) && (
            <div className="grid gap-4 rounded-md border border-primary/25 bg-primary/5 p-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <div className="font-semibold">Customs and documentation</div>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Add import/export context so Fly Logistics can review customs, declared value, duties, taxes, and required documentation before dispatch.
                </p>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="freightMode">Freight mode</Label>
                <select
                  id="freightMode"
                  value={form.freightMode}
                  onChange={(event) => updateField("freightMode", event.target.value)}
                  className="h-11 rounded-md border border-input bg-background/70 px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {freightModeOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="quoteCurrency">Preferred quote currency</Label>
                <select
                  id="quoteCurrency"
                  value={form.quoteCurrency}
                  onChange={(event) => updateField("quoteCurrency", event.target.value)}
                  className="h-11 rounded-md border border-input bg-background/70 px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {supportedCurrencies.map((currency) => (
                    <option key={currency} value={currency}>{currency}</option>
                  ))}
                </select>
              </div>
              <div className="grid gap-2 sm:col-span-2">
                <Label htmlFor="freightClassification">Freight classification</Label>
                <select
                  id="freightClassification"
                  value={form.freightClassification}
                  onChange={(event) => updateField("freightClassification", event.target.value)}
                  className="h-11 rounded-md border border-input bg-background/70 px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {freightClassificationOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="packageValue">Package value</Label>
                <Input id="packageValue" inputMode="decimal" value={form.packageValue} onChange={(event) => updateField("packageValue", event.target.value)} placeholder="Declared value" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="dutiesTaxesAmount">Duties and taxes estimate</Label>
                <Input id="dutiesTaxesAmount" inputMode="decimal" value={form.dutiesTaxesAmount} onChange={(event) => updateField("dutiesTaxesAmount", event.target.value)} placeholder="Optional estimate" />
              </div>
              <div className="grid gap-2 sm:col-span-2">
                <Label htmlFor="customsInformation">Customs information (optional)</Label>
                <Input id="customsInformation" value={form.customsInformation} onChange={(event) => updateField("customsInformation", event.target.value)} placeholder="Item description, HS code, restricted item notes" />
              </div>
              <div className="grid gap-2 sm:col-span-2">
                <Label htmlFor="exportImportDocuments">Export/import documentation (optional)</Label>
                <textarea
                  id="exportImportDocuments"
                  value={form.exportImportDocuments}
                  onChange={(event) => updateField("exportImportDocuments", event.target.value)}
                  placeholder="Commercial invoice, ID, permits, customs declaration, document links..."
                  className="min-h-20 rounded-md border border-input bg-background/70 px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>
            </div>
          )}
          <div className="grid gap-3 md:grid-cols-3">
            {urgencyOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => updateField("urgency", option.value)}
                className={`rounded-md border p-3 text-left text-sm transition hover:border-primary/60 hover:bg-primary/5 ${form.urgency === option.value ? "border-primary/60 bg-primary/10" : "bg-background/35"}`}
              >
                <span className="font-semibold">{option.label}</span>
                <span className="mt-1 block text-xs text-muted-foreground">{option.detail}</span>
              </button>
            ))}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="notes">Notes</Label>
            <textarea
              id="notes"
              value={form.notes}
              onChange={(event) => updateField("notes", event.target.value)}
              placeholder="Access notes, fragile items, preferred pickup window, recipient instructions..."
              className="min-h-24 rounded-md border border-input bg-background/70 px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button type="submit" size="lg" disabled={loading} className="w-full sm:flex-1">
              {loading ? <Loader2 className="animate-spin" /> : <Send />}
              Request booking
            </Button>
            <Button asChild type="button" size="lg" variant="outline" className="w-full sm:flex-1">
              <a href={getWhatsAppUrl(quoteWhatsAppMessage)} target="_blank" rel="noreferrer">
                <MessageCircle />
                Chat on WhatsApp
              </a>
            </Button>
          </div>
        </form>

        {error && <div className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
        {quote && (
          <div className="mt-5 rounded-md border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="flex items-center gap-2 font-semibold text-emerald-500">
                  <CheckCircle2 className="size-4" />
                  Booking request received
                </div>
                <p className="mt-2 text-muted-foreground">
                  Reference <span className="font-mono font-semibold text-foreground">{quote.request_id}</span>. Estimated price {quote.pricing?.formattedAmount ?? moneyFormatter.format(Number(quote.estimated_price ?? 0))}; ETA {quote.pricing?.etaLabel ?? `${quote.estimated_eta_hours}h`}.
                </p>
                <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
                  <span className="rounded-md border bg-background/35 p-2">
                    <span className="block text-muted-foreground">Delivery type</span>
                    <span className="font-semibold text-foreground">{quote.pricing?.deliveryType ?? quote.delivery_type ?? "Operations reviewed delivery"}</span>
                  </span>
                  <span className="rounded-md border bg-background/35 p-2">
                    <span className="block text-muted-foreground">Vehicle</span>
                    <span className="font-semibold text-foreground">{quote.pricing?.vehicleType ?? quote.vehicle_type ?? "Assigned after review"}</span>
                  </span>
                </div>
                {quote.pricing?.international && (
                  <div className="mt-3 grid gap-2 rounded-md border border-primary/25 bg-background/35 p-3 text-xs sm:grid-cols-2">
                    <span>
                      <span className="block text-muted-foreground">International quote</span>
                      <span className="font-semibold text-foreground">{quote.pricing.international.formattedQuoteAmount}</span>
                    </span>
                    <span>
                      <span className="block text-muted-foreground">Tracking mode</span>
                      <span className="font-semibold text-foreground">{quote.pricing.international.trackingLabel}</span>
                    </span>
                    <span>
                      <span className="block text-muted-foreground">Freight</span>
                      <span className="font-semibold text-foreground">{quote.pricing.international.freightModeLabel}</span>
                    </span>
                    <span>
                      <span className="block text-muted-foreground">Classification</span>
                      <span className="font-semibold text-foreground">{quote.pricing.international.freightClassificationLabel}</span>
                    </span>
                  </div>
                )}
                {(quote.pricing?.warnings?.length || quote.service_warnings?.length) ? (
                  <div className="mt-3 rounded-md border border-primary/30 bg-primary/10 p-2 text-xs text-primary">
                    {(quote.pricing?.warnings ?? quote.service_warnings ?? []).join(" ")}
                  </div>
                ) : null}
                <p className="mt-2 text-xs text-muted-foreground">
                  Pay securely now to create a tracking ID automatically. Operations will then move the shipment to pending pickup.
                </p>
              </div>
              <div className="grid gap-2 sm:min-w-52">
                <Button type="button" size="sm" className="w-full" disabled={checkoutLoading} onClick={() => void startCheckout(quote.request_id)}>
                  {checkoutLoading ? <Loader2 className="animate-spin" /> : <CreditCard />}
                  Pay now
                </Button>
                {!accountMode && (
                  <>
                    <Button asChild size="sm" className="w-full">
                      <Link href={`/customer/register?email=${encodeURIComponent(submittedForm.customerEmail)}&requestId=${encodeURIComponent(quote.request_id)}` as NextRoute}>
                        <UserPlus />
                        Create customer account
                      </Link>
                    </Button>
                    <Button asChild size="sm" variant="outline" className="w-full">
                      <Link href={`/customer/login?email=${encodeURIComponent(submittedForm.customerEmail)}&requestId=${encodeURIComponent(quote.request_id)}&next=/customer` as NextRoute}>
                        <LogIn />
                        Continue as customer
                      </Link>
                    </Button>
                  </>
                )}
                <Button asChild size="sm" variant="outline" className="w-full">
                  <Link href={(accountMode ? "/customer#customer-tracking" : "/tracking") as NextRoute}>
                    <Clock3 />
                    Track shipment
                  </Link>
                </Button>
                <Button asChild size="sm" variant="outline" className="w-full">
                  <a
                    href={getWhatsAppUrl(whatsappMessages.quoteReceived({
                      request_id: quote.request_id,
                      pickupAddress: submittedForm.pickupAddress,
                      deliveryAddress: submittedForm.deliveryAddress,
                      packageType: submittedForm.packageType,
                      estimated_eta_hours: quote.estimated_eta_hours
                    }))}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <MessageCircle />
                    WhatsApp reference
                  </a>
                </Button>
              </div>
            </div>
            {quote.warning && <p className="mt-2 text-xs text-primary">{quote.warning}</p>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
