"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getSupabaseBrowser } from "@/lib/supabase";

const initial = {
  businessName: "",
  businessType: "Retail / e-commerce",
  contactName: "",
  contactEmail: "",
  contactPhone: "",
  pickupAddress: "",
  city: "",
  state: "",
  country: "Nigeria",
  monthlyShipmentVolume: "1-20",
  websiteSocial: "",
  billingTerms: "prepaid"
};

export function MerchantOnboarding() {
  const router = useRouter();
  const [form, setForm] = useState(initial);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function check() {
      const supabase = getSupabaseBrowser();
      const session = await supabase?.auth.getSession();
      const token = session?.data.session?.access_token;
      if (!token) return;
      const profile = await fetch("/api/auth/profile", { headers: { Authorization: `Bearer ${token}` } }).then((response) => response.json());
      if (!active) return;
      setForm((current) => ({ ...current, contactName: profile.full_name ?? "", contactEmail: profile.email ?? "", contactPhone: profile.phone ?? "" }));
      const access = await fetch("/api/merchant/access", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
      const data = await access.json();
      if (data.hasMerchantAccess) router.replace("/merchant/dashboard");
      else setChecking(false);
    }
    void check();
    return () => { active = false; };
  }, [router]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const supabase = getSupabaseBrowser();
      const session = await supabase?.auth.getSession();
      const token = session?.data.session?.access_token;
      if (!token) throw new Error("Sign in before completing merchant onboarding.");
      const response = await fetch("/api/merchant/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(form)
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to complete onboarding.");
      router.replace("/merchant/dashboard");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to complete merchant onboarding.");
    } finally {
      setLoading(false);
    }
  }

  if (checking) return <main className="grid min-h-[70vh] place-items-center"><Loader2 className="size-6 animate-spin text-primary" /></main>;

  return (
    <main className="min-h-screen bg-background px-4 py-8 sm:py-14">
      <div className="mx-auto max-w-4xl">
        <div className="mb-8">
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-primary">Merchant onboarding</p>
          <h1 className="mt-3 text-3xl font-black sm:text-5xl">Set up your business shipping workspace.</h1>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-muted-foreground">Your personal customer account stays intact. These details create a separate, secure business workspace.</p>
        </div>
        <Card className="glass">
          <CardHeader><CardTitle className="flex items-center gap-2"><Building2 className="size-5 text-primary" />Business details</CardTitle></CardHeader>
          <CardContent>
            <form className="grid gap-4 sm:grid-cols-2" onSubmit={submit}>
              <div className="grid gap-2 sm:col-span-2"><Label htmlFor="business-name">Business name</Label><Input id="business-name" value={form.businessName} onChange={(event) => setForm((current) => ({ ...current, businessName: event.target.value }))} required /></div>
              <div className="grid gap-2"><Label htmlFor="business-type">Business type</Label><Input id="business-type" value={form.businessType} onChange={(event) => setForm((current) => ({ ...current, businessType: event.target.value }))} required /></div>
              <div className="grid gap-2"><Label htmlFor="monthly-volume">Typical monthly shipments</Label><select id="monthly-volume" className="h-11 rounded-md border bg-background px-3 text-sm" value={form.monthlyShipmentVolume} onChange={(event) => setForm((current) => ({ ...current, monthlyShipmentVolume: event.target.value }))}><option>1-20</option><option>21-100</option><option>101-500</option><option>500+</option></select></div>
              <div className="grid gap-2"><Label htmlFor="contact-name">Primary contact</Label><Input id="contact-name" autoComplete="name" value={form.contactName} onChange={(event) => setForm((current) => ({ ...current, contactName: event.target.value }))} required /></div>
              <div className="grid gap-2"><Label htmlFor="contact-phone">Business phone</Label><Input id="contact-phone" type="tel" inputMode="tel" autoComplete="tel" value={form.contactPhone} onChange={(event) => setForm((current) => ({ ...current, contactPhone: event.target.value }))} required /></div>
              <div className="grid gap-2 sm:col-span-2"><Label htmlFor="contact-email">Business email</Label><Input id="contact-email" type="email" inputMode="email" autoComplete="email" value={form.contactEmail} onChange={(event) => setForm((current) => ({ ...current, contactEmail: event.target.value }))} required /></div>
              <div className="grid gap-2 sm:col-span-2"><Label htmlFor="pickup-address">Primary pickup address</Label><Input id="pickup-address" autoComplete="street-address" value={form.pickupAddress} onChange={(event) => setForm((current) => ({ ...current, pickupAddress: event.target.value }))} required /></div>
              <div className="grid gap-2"><Label htmlFor="merchant-city">City</Label><Input id="merchant-city" value={form.city} onChange={(event) => setForm((current) => ({ ...current, city: event.target.value }))} required /></div>
              <div className="grid gap-2"><Label htmlFor="merchant-state">State</Label><Input id="merchant-state" value={form.state} onChange={(event) => setForm((current) => ({ ...current, state: event.target.value }))} required /></div>
              <div className="grid gap-2"><Label htmlFor="merchant-country">Country</Label><Input id="merchant-country" value={form.country} onChange={(event) => setForm((current) => ({ ...current, country: event.target.value }))} required /></div>
              <div className="grid gap-2"><Label htmlFor="website-social">Website or social page (optional)</Label><Input id="website-social" value={form.websiteSocial} onChange={(event) => setForm((current) => ({ ...current, websiteSocial: event.target.value }))} /></div>
              {error && <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive sm:col-span-2">{error}</div>}
              <div className="flex items-start gap-3 rounded-md border bg-background/45 p-4 text-sm text-muted-foreground sm:col-span-2"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" /><span>Your active merchant account receives the standard 5% business delivery discount automatically. Prices are calculated securely by Fly Logistics.</span></div>
              <Button className="sm:col-span-2" size="lg" disabled={loading}>{loading ? <Loader2 className="animate-spin" /> : <Building2 />}Create merchant workspace</Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

