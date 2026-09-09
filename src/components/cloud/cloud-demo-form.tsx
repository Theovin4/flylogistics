"use client";

import { FormEvent, useState } from "react";
import { CalendarClock, CheckCircle2, Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type DemoState = {
  companyName: string;
  contactName: string;
  email: string;
  phone: string;
  fleetSize: string;
  monthlyDeliveries: string;
  city: string;
  country: string;
  preferredDemoDate: string;
  message: string;
};

const initialState: DemoState = {
  companyName: "",
  contactName: "",
  email: "",
  phone: "",
  fleetSize: "",
  monthlyDeliveries: "",
  city: "",
  country: "",
  preferredDemoDate: "",
  message: ""
};

export function CloudDemoForm() {
  const [form, setForm] = useState(initialState);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submitDemoRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setSuccess(null);
    setError(null);

    try {
      const response = await fetch("/api/cloud/demo-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName: form.companyName,
          contactName: form.contactName,
          email: form.email,
          phone: form.phone,
          fleetSize: form.fleetSize,
          monthlyDeliveries: form.monthlyDeliveries,
          city: form.city,
          country: form.country,
          preferredDemoDate: form.preferredDemoDate,
          message: form.message,
          source: "cloud-demo-page"
        })
      });
      const data = (await response.json()) as { message?: string; error?: string };
      if (!response.ok) throw new Error(data.error ?? "Unable to submit demo request.");
      setSuccess(data.message ?? "Demo request received. Fly Logistics will contact you shortly.");
      setForm(initialState);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to submit demo request.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="glass">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarClock className="size-5 text-primary" />
          Request a Cloud demo
        </CardTitle>
      </CardHeader>
      <CardContent>
        {success && (
          <div className="mb-4 flex gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-500">
            <CheckCircle2 className="size-4" />
            {success}
          </div>
        )}
        {error && <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
        <form className="grid gap-4" onSubmit={submitDemoRequest}>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Company name" value={form.companyName} onChange={(value) => setForm((current) => ({ ...current, companyName: value }))} />
            <Field label="Contact name" value={form.contactName} onChange={(value) => setForm((current) => ({ ...current, contactName: value }))} />
            <Field label="Email" type="email" value={form.email} onChange={(value) => setForm((current) => ({ ...current, email: value }))} />
            <Field label="Phone" value={form.phone} onChange={(value) => setForm((current) => ({ ...current, phone: value }))} />
            <Field label="Fleet size" value={form.fleetSize} required={false} onChange={(value) => setForm((current) => ({ ...current, fleetSize: value }))} />
            <Field label="Monthly deliveries" value={form.monthlyDeliveries} required={false} onChange={(value) => setForm((current) => ({ ...current, monthlyDeliveries: value }))} />
            <Field label="City" value={form.city} required={false} onChange={(value) => setForm((current) => ({ ...current, city: value }))} />
            <Field label="Country" value={form.country} required={false} onChange={(value) => setForm((current) => ({ ...current, country: value }))} />
            <Field label="Preferred demo date" type="date" value={form.preferredDemoDate} required={false} onChange={(value) => setForm((current) => ({ ...current, preferredDemoDate: value }))} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="demo-message">What should we prepare?</Label>
            <textarea
              id="demo-message"
              value={form.message}
              onChange={(event) => setForm((current) => ({ ...current, message: event.target.value }))}
              className="min-h-32 rounded-md border border-input bg-background px-3 py-3 text-sm outline-none transition focus:border-primary"
              placeholder="Tell us about your branches, delivery volume, riders, routes, or current dispatch process."
            />
          </div>
          <Button type="submit" size="lg" disabled={loading}>
            {loading ? <Loader2 className="animate-spin" /> : <Send />}
            Send demo request
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  required = true
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
}) {
  const id = label.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} type={type} value={value} required={required} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}
