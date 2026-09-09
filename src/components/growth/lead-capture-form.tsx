"use client";

import { FormEvent, useState } from "react";
import { CheckCircle2, Loader2, Send } from "lucide-react";
import { flyError, flySuccess } from "@/components/feedback/fly-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type LeadCaptureFormProps = {
  title: string;
  description: string;
  leadType?: "customer" | "merchant" | "business" | "whatsapp" | "referral";
  source?: string;
  campaign?: string;
};

const initialForm = {
  fullName: "",
  email: "",
  phone: "",
  company: "",
  message: "",
  website: ""
};

export function LeadCaptureForm({
  title,
  description,
  leadType = "business",
  source = "website",
  campaign = "merchant_onboarding"
}: LeadCaptureFormProps) {
  const [form, setForm] = useState(initialForm);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function update(field: keyof typeof initialForm, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function submitLead(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setSuccess(null);
    setError(null);

    try {
      const response = await fetch("/api/growth/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          leadType,
          source,
          campaign
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to submit your request.");
      const message = data.message ?? "Thanks. Fly Logistics will contact you shortly.";
      setSuccess(message);
      setForm(initialForm);
      flySuccess("Request received", message);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to submit your request.";
      setError(message);
      flyError("Request not sent", message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="glass">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <p className="text-sm leading-6 text-muted-foreground">{description}</p>
      </CardHeader>
      <CardContent>
        <form className="grid gap-4" onSubmit={submitLead}>
          <input
            tabIndex={-1}
            autoComplete="off"
            value={form.website}
            onChange={(event) => update("website", event.target.value)}
            className="hidden"
            aria-hidden="true"
          />
          {success && (
            <div className="flex gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-500">
              <CheckCircle2 className="size-4" />
              {success}
            </div>
          )}
          {error && <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="growthLeadFullName">Full name</Label>
              <Input id="growthLeadFullName" value={form.fullName} onChange={(event) => update("fullName", event.target.value)} required />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="growthLeadEmail">Email</Label>
              <Input id="growthLeadEmail" type="email" value={form.email} onChange={(event) => update("email", event.target.value)} required />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="growthLeadPhone">Phone</Label>
              <Input id="growthLeadPhone" inputMode="tel" value={form.phone} onChange={(event) => update("phone", event.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="growthLeadCompany">Company</Label>
              <Input id="growthLeadCompany" value={form.company} onChange={(event) => update("company", event.target.value)} />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="growthLeadMessage">What do you ship?</Label>
            <textarea
              id="growthLeadMessage"
              value={form.message}
              onChange={(event) => update("message", event.target.value)}
              placeholder="Tell us your routes, delivery volume, shipment types, or business goals."
              className="min-h-24 rounded-md border bg-background/70 px-3 py-2 text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-primary"
            />
          </div>
          <Button disabled={loading} className="w-full sm:w-fit">
            {loading ? <Loader2 className="animate-spin" /> : <Send />}
            Submit business request
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
