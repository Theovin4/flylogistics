"use client";

import { FormEvent, useState } from "react";
import { CheckCircle2, Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type QuoteResponse = {
  request_id: string;
  estimated_price: number;
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
    <Card className="glass">
      <CardHeader>
        <CardTitle>Instant quote and order request</CardTitle>
        <p className="text-sm text-muted-foreground">Saved to Supabase for admin follow-up and shipment creation.</p>
      </CardHeader>
      <CardContent>
        <form className="grid gap-4" onSubmit={submit}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="customerName">Full name</Label>
              <Input id="customerName" value={form.customerName} onChange={(e) => updateField("customerName", e.target.value)} required />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="customerEmail">Email</Label>
              <Input id="customerEmail" type="email" value={form.customerEmail} onChange={(e) => updateField("customerEmail", e.target.value)} required />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="customerPhone">Phone</Label>
            <Input id="customerPhone" value={form.customerPhone} onChange={(e) => updateField("customerPhone", e.target.value)} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="pickupAddress">Pickup address</Label>
              <Input id="pickupAddress" value={form.pickupAddress} onChange={(e) => updateField("pickupAddress", e.target.value)} required />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="deliveryAddress">Delivery address</Label>
              <Input id="deliveryAddress" value={form.deliveryAddress} onChange={(e) => updateField("deliveryAddress", e.target.value)} required />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="grid gap-2">
              <Label htmlFor="packageType">Package type</Label>
              <Input id="packageType" value={form.packageType} onChange={(e) => updateField("packageType", e.target.value)} required />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="weightKg">Weight kg</Label>
              <Input id="weightKg" type="number" min="0.1" step="0.1" value={form.weightKg} onChange={(e) => updateField("weightKg", e.target.value)} required />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="urgency">Urgency</Label>
              <select
                id="urgency"
                value={form.urgency}
                onChange={(e) => updateField("urgency", e.target.value)}
                className="h-11 rounded-md border border-input bg-background/70 px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="standard">Standard</option>
                <option value="priority">Priority</option>
                <option value="critical">Critical</option>
              </select>
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="notes">Notes</Label>
            <textarea
              id="notes"
              value={form.notes}
              onChange={(e) => updateField("notes", e.target.value)}
              className="min-h-24 rounded-md border border-input bg-background/70 px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <Button type="submit" size="lg" disabled={loading}>
            {loading ? <Loader2 className="animate-spin" /> : <Send />}
            Request quote
          </Button>
        </form>

        {error && <div className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
        {quote && (
          <div className="mt-4 rounded-md border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm">
            <div className="flex items-center gap-2 font-semibold text-emerald-500">
              <CheckCircle2 className="size-4" />
              Request {quote.request_id} saved
            </div>
            <p className="mt-2 text-muted-foreground">
              Estimated price: NGN {quote.estimated_price.toLocaleString()} · ETA: {quote.estimated_eta_hours}h
            </p>
            {quote.warning && <p className="mt-2 text-xs text-primary">{quote.warning}</p>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
