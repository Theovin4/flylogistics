"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Clock3, Loader2, MessageCircle, PackageCheck, Route, Send, ShieldCheck } from "lucide-react";
import { getWhatsAppUrl } from "@/lib/contact";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type QuoteResponse = {
  request_id: string;
  estimated_price: number | string;
  estimated_eta_hours: number;
  warning?: string;
};

const initialState = {
  customerName: "",
  customerEmail: "",
  customerPhone: "",
  pickupAddress: "",
  deliveryAddress: "",
  packageType: "",
  weightKg: "5",
  urgency: "standard",
  notes: ""
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

export function QuoteRequestForm() {
  const [form, setForm] = useState(initialState);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quote, setQuote] = useState<QuoteResponse | null>(null);

  function updateField(field: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setQuote(null);

    try {
      const response = await fetch("/api/quote-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, weightKg: Number(form.weightKg) })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to submit quote request.");
      setQuote(data);
      setForm(initialState);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to submit quote request.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="glass overflow-hidden">
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <Badge className="border-primary/40 bg-primary/10 text-primary">Booking request</Badge>
          <Badge>Supabase live</Badge>
        </div>
        <CardTitle className="mt-3 text-2xl">Request a Fly Logistics booking</CardTitle>
        <p className="text-sm leading-6 text-muted-foreground">
          Share your pickup, delivery, package, and urgency details. The operations team receives this request instantly and can convert it into a shipment with tracking.
        </p>
      </CardHeader>
      <CardContent>
        <form className="grid gap-4" onSubmit={submit}>
          <div className="grid gap-3 rounded-md border bg-background/35 p-3 sm:grid-cols-3">
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

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="customerName">Full name</Label>
              <Input id="customerName" value={form.customerName} onChange={(event) => updateField("customerName", event.target.value)} placeholder="Jane Okafor" required />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="customerEmail">Email</Label>
              <Input id="customerEmail" type="email" value={form.customerEmail} onChange={(event) => updateField("customerEmail", event.target.value)} placeholder="jane@company.com" required />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="customerPhone">Phone</Label>
            <Input id="customerPhone" value={form.customerPhone} onChange={(event) => updateField("customerPhone", event.target.value)} placeholder="+234 800 000 0000" required />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="pickupAddress">Pickup address</Label>
              <Input id="pickupAddress" value={form.pickupAddress} onChange={(event) => updateField("pickupAddress", event.target.value)} placeholder="Warehouse, city, state" required />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="deliveryAddress">Delivery address</Label>
              <Input id="deliveryAddress" value={form.deliveryAddress} onChange={(event) => updateField("deliveryAddress", event.target.value)} placeholder="Recipient address, city, state" required />
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
          <div className="grid gap-3 sm:grid-cols-3">
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
            <Button type="submit" size="lg" disabled={loading} className="sm:flex-1">
              {loading ? <Loader2 className="animate-spin" /> : <Send />}
              Request booking
            </Button>
            <Button asChild type="button" size="lg" variant="outline" className="sm:flex-1">
              <a href={getWhatsAppUrl()} target="_blank" rel="noreferrer">
                <MessageCircle />
                Urgent WhatsApp
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
                  Reference <span className="font-mono font-semibold text-foreground">{quote.request_id}</span>. Estimated price {moneyFormatter.format(Number(quote.estimated_price ?? 0))}; ETA {quote.estimated_eta_hours}h.
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  Our operations team will confirm availability and issue a tracking ID when the shipment is created.
                </p>
              </div>
              <Button asChild size="sm" variant="outline">
                <Link href="/tracking">
                  <Clock3 />
                  Track shipment
                </Link>
              </Button>
            </div>
            {quote.warning && <p className="mt-2 text-xs text-primary">{quote.warning}</p>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
