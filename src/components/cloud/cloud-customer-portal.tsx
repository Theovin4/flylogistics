"use client";

import { FormEvent, useState } from "react";
import Image from "next/image";
import { CheckCircle2, Loader2, Mail, MapPin, MessageCircle, PackageSearch, Phone, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { buildTenantWhatsAppUrl, normalizePublicPhone, type PublicTenantProfile } from "@/lib/tenant-branding";

type TrackedShipment = { trackingId: string; status: string; eta?: string; pickupAddress?: string; deliveryAddress?: string; recipientName?: string; customerStatusMessage?: string; events?: Array<{ label?: string; title?: string; description?: string; location?: string; occurred_at?: string; completed?: boolean }> };

export function CloudCustomerPortal({ company: initialCompany }: { company: PublicTenantProfile }) {
  const [company, setCompany] = useState(initialCompany);
  const [trackingId, setTrackingId] = useState("");
  const [shipment, setShipment] = useState<TrackedShipment | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function track(event: FormEvent) {
    event.preventDefault(); setLoading(true); setError(null); setShipment(null);
    try {
      const response = await fetch(`/api/cloud/portal/${encodeURIComponent(company.slug)}/tracking/${encodeURIComponent(trackingId.trim())}`, { cache: "no-store" });
      const body = await response.json() as { company?: PublicTenantProfile; shipment?: TrackedShipment; error?: string };
      if (!response.ok || !body.shipment) throw new Error(body.error ?? "Unable to track this shipment.");
      if (body.company) setCompany(body.company);
      setShipment(body.shipment);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to track this shipment."); }
    finally { setLoading(false); }
  }

  const phone = normalizePublicPhone(company.public_phone);
  const whatsappUrl = buildTenantWhatsAppUrl({ phone: company.public_whatsapp, trackingNumber: shipment?.trackingId, companyName: company.name });
  const showContact = company.show_contact_on_tracking && Boolean(company.public_address || phone || whatsappUrl || company.public_support_email);

  return <main className="min-h-screen px-4 py-8 sm:px-6"><div className="mx-auto max-w-4xl"><header className="mb-8 flex items-center gap-4 border-b pb-6">{company.logo_url ? <div className="relative h-14 w-28 shrink-0"><Image src={company.logo_url} alt={`${company.name} logo`} fill sizes="112px" className="object-contain object-left" unoptimized /></div> : <div className="grid size-14 place-items-center rounded-md bg-primary text-xl font-black text-primary-foreground">{company.name.slice(0, 2).toUpperCase()}</div>}<div><p className="text-xs font-bold uppercase tracking-[0.22em] text-primary">Customer tracking portal</p><h1 className="text-2xl font-black sm:text-4xl">{company.name}</h1></div></header><section className="grid gap-5"><Card className="glass"><CardHeader><CardTitle className="flex items-center gap-2"><PackageSearch className="size-5 text-primary" />Track your delivery</CardTitle></CardHeader><CardContent><form onSubmit={track} className="flex flex-col gap-3 sm:flex-row"><Input value={trackingId} onChange={(event) => setTrackingId(event.target.value.toUpperCase())} placeholder="Enter tracking number" required /><Button type="submit" disabled={loading}>{loading ? <Loader2 className="animate-spin" /> : <Search />}Track shipment</Button></form>{error && <p className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}</CardContent></Card>{shipment && <Card className="glass"><CardHeader><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-mono text-sm font-black text-primary">{shipment.trackingId}</p><CardTitle className="mt-1 capitalize">{shipment.status.replaceAll("_", " ")}</CardTitle></div><CheckCircle2 className="size-8 text-primary" /></div></CardHeader><CardContent className="grid gap-5"><div className="grid gap-3 sm:grid-cols-2"><div className="rounded-md border p-3"><p className="text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">From</p><p className="mt-2 font-semibold">{shipment.pickupAddress}</p></div><div className="rounded-md border p-3"><p className="text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">To</p><p className="mt-2 font-semibold">{shipment.deliveryAddress}</p></div></div><div><h2 className="font-black">Latest updates</h2><div className="mt-3 grid gap-2">{(shipment.events ?? []).slice(0, 7).map((item, index) => <div key={`${item.occurred_at}-${index}`} className="rounded-md border bg-background/45 p-3"><div className="flex justify-between gap-3"><strong>{item.label ?? item.title ?? "Delivery update"}</strong>{item.completed && <span className="text-xs font-bold text-emerald-500">COMPLETE</span>}</div><p className="mt-1 text-sm text-muted-foreground">{item.description ?? item.location}</p>{item.occurred_at && <time className="mt-1 block text-xs text-muted-foreground">{new Date(item.occurred_at).toLocaleString()}</time>}</div>)}</div></div></CardContent></Card>}{showContact && <Card className="glass"><CardHeader><CardTitle>Need help with this delivery?</CardTitle></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2">{company.public_address && <div className="flex gap-3 rounded-md border p-3"><MapPin className="mt-0.5 size-5 shrink-0 text-primary"/><span>{company.public_address}</span></div>}{phone && <a className="flex items-center gap-3 rounded-md border p-3 font-semibold transition hover:border-primary" href={`tel:${phone}`}><Phone className="size-5 text-primary"/>Call {company.name}</a>}{whatsappUrl && <a className="flex items-center gap-3 rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 font-semibold text-emerald-500 transition hover:bg-emerald-500/15" href={whatsappUrl} target="_blank" rel="noreferrer"><MessageCircle className="size-5"/>Chat on WhatsApp</a>}{company.public_support_email && <a className="flex items-center gap-3 rounded-md border p-3 font-semibold transition hover:border-primary" href={`mailto:${company.public_support_email}`}><Mail className="size-5 text-primary"/>Email support</a>}</CardContent></Card>}<footer className="py-6 text-center text-xs text-muted-foreground">Powered by Fly Logistics Cloud</footer></section></div></main>;
}
