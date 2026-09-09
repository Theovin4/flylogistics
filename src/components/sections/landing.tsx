import Link from "next/link";
import type { Route } from "next";
import { ArrowRight, Bot, Boxes, BrainCircuit, ChartSpline, Clock3, Globe2, Mail, MapPin, MapPinned, MessageCircle, Phone, Radar, ShieldCheck, Truck } from "lucide-react";
import { AnimatedShell } from "@/components/sections/animated-shell";
import { ComplianceAndTimelineSection, EnterpriseTrustSection, OperationalUseCasesSection, PlatformReadinessSection } from "@/components/sections/enterprise-trust";
import { LazyHeroVisual } from "@/components/sections/lazy-hero-visual";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getWhatsAppUrl, whatsappMessages } from "@/lib/contact";
import { conversionLinks, siteConfig } from "@/lib/site";

const capabilities = [
  { icon: Bot, title: "AI Logistics Assistant", text: "Shipment lookup, support answers, dispatch context, and exception summaries for active orders." },
  { icon: MapPinned, title: "Live Shipment Tracking", text: "Tracking timeline, assigned driver visibility where enabled, ETA guidance, and delivery status." },
  { icon: BrainCircuit, title: "Dispatch Review", text: "Driver workload, route context, urgency, and payment status in one operations view." },
  { icon: ChartSpline, title: "Operations Analytics", text: "Revenue, shipment status, quote requests, payments, and driver workload reporting." },
  { icon: Boxes, title: "Business Operations", text: "Bulk shipment intake, saved addresses, wallet payments, invoices, and merchant workflows." },
  { icon: ShieldCheck, title: "Secure Operations", text: "Role-based access, private delivery proof, verified payments, and admin audit logs." }
] as const;

const stats = [
  ["24/7", "active-delivery support"],
  ["Live", "shipment visibility"],
  ["NG", "local delivery"],
  ["Global", "import and export lanes"]
] as const;

const trustSignals = [
  { icon: MapPin, label: siteConfig.contact.address },
  { icon: Mail, label: siteConfig.contact.supportEmail },
  { icon: Phone, label: siteConfig.contact.supportPhone },
  { icon: ShieldCheck, label: siteConfig.guarantees[0] }
] as const;

export function Landing() {
  return (
    <AnimatedShell>
      <section className="relative overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-96 grid-field opacity-60" aria-hidden="true" />
        <div className="mx-auto grid max-w-7xl gap-8 px-4 pb-12 pt-10 sm:px-6 sm:pb-16 sm:pt-14 lg:grid-cols-[0.95fr_1.05fr] lg:px-8 lg:pb-24 lg:pt-20">
          <div className="relative z-10 flex flex-col justify-center">
            <Badge className="w-fit border-primary/40 bg-primary/10 text-primary">Fly Logistics AI Freight OS</Badge>
            <h1 className="mt-6 max-w-4xl text-4xl font-black tracking-normal text-balance sm:text-5xl lg:text-7xl">
              Book, track, and manage deliveries with real visibility.
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-muted-foreground sm:mt-6 sm:text-lg sm:leading-8">
              Book local and international shipments, pay securely, and follow every update with one Fly Logistics tracking number.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg" className="w-full sm:w-auto">
                <Link href="/quote">
                  Get delivery price <ArrowRight />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="w-full sm:w-auto">
                <Link href="/tracking">
                  Track shipment <Clock3 />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="w-full sm:w-auto">
                <a href={getWhatsAppUrl(whatsappMessages.urgentDelivery())} target="_blank" rel="noreferrer">
                  Chat on WhatsApp <MessageCircle />
                </a>
              </Button>
            </div>
            <div className="mt-8 grid max-w-2xl grid-cols-2 gap-2 sm:mt-10 sm:grid-cols-4 sm:gap-3">
              {stats.map(([value, label]) => (
                <div key={label} className="glass rounded-lg p-3 sm:p-4">
                  <div className="font-mono text-xl font-bold sm:text-2xl">{value}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{label}</div>
                </div>
              ))}
            </div>
          </div>
          <LazyHeroVisual />
        </div>
      </section>

      <EnterpriseTrustSection />
      <OperationalUseCasesSection />
      <ComplianceAndTimelineSection />
      <PlatformReadinessSection />

      <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
        <div className="grid gap-5 md:grid-cols-3">
            {([
              ["Operations control", "Create shipments, assign drivers, and manage delivery status."],
              ["Payment visibility", "View payments, invoices, receipts, and wallet activity."],
              ["Live delivery network", "Follow assigned drivers and shipment progress."]
            ] as const).map(([title, text], index) => (
            <Card key={title} className="glass animate-float" style={{ animationDelay: `${index * 0.4}s` }}>
              <CardHeader>
                <CardTitle>{title}</CardTitle>
              </CardHeader>
              <CardContent className="text-sm leading-6 text-muted-foreground">{text}</CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 pb-14 sm:px-6 lg:px-8">
        <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {trustSignals.map((item) => (
            <div key={item.label} className="rounded-md border bg-background/45 p-4 text-sm">
              <item.icon className="size-5 text-primary" />
              <div className="mt-3 leading-6 text-muted-foreground">{item.label}</div>
            </div>
          ))}
        </div>
        <div className="grid gap-6 rounded-lg border bg-background/45 p-5 sm:p-6 lg:grid-cols-[0.85fr_1.15fr] lg:items-center">
          <div>
            <Badge className="border-primary/40 bg-primary/10 text-primary">Services</Badge>
            <h2 className="mt-4 text-3xl font-black tracking-normal">Choose the right delivery service.</h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              Local delivery, interstate freight, international shipping, warehousing, and business logistics.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {conversionLinks.map((item) => (
              <Link key={item.href} href={item.href as Route} className="group rounded-md border bg-background/60 p-4 text-sm font-semibold transition hover:border-primary/50">
                <span className="flex items-center justify-between gap-3">
                  {item.label}
                  <ArrowRight className="size-4 text-primary transition group-hover:translate-x-1" />
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="border-y border-border/70 bg-foreground/[0.025]">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-14 sm:px-6 sm:py-20 lg:grid-cols-[0.8fr_1.2fr] lg:px-8">
          <div>
            <Badge className="border-primary/40 bg-primary/10 text-primary">Operations</Badge>
              <h2 className="mt-5 text-3xl font-black tracking-normal text-balance sm:text-4xl">One view of every delivery.</h2>
            <p className="mt-4 text-muted-foreground">
              Book, dispatch, track, and resolve delivery work from one secure workspace.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {capabilities.map((item) => (
              <Card key={item.title} className="glass">
                <CardHeader>
                  <item.icon className="size-5 text-primary" />
                  <CardTitle className="text-lg">{item.title}</CardTitle>
                </CardHeader>
                <CardContent className="text-sm leading-6 text-muted-foreground">{item.text}</CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
        <div className="relative overflow-hidden rounded-lg border bg-black p-5 text-white sm:p-10">
          <div className="absolute inset-0 grid-field opacity-45" />
          <div data-route-line className="orange-line absolute left-0 top-16 h-px w-full origin-left" />
          <div data-route-line className="orange-line absolute left-0 top-36 h-px w-full origin-left" />
          <div className="relative grid gap-10 lg:grid-cols-[1fr_0.8fr]">
            <div>
              <Badge className="border-white/20 bg-white/10 text-white">Live network</Badge>
              <h2 className="mt-5 text-3xl font-black tracking-normal sm:text-4xl">Clear progress from booking to delivery.</h2>
              <p className="mt-4 max-w-2xl text-white/70">
                Track milestones, driver progress, ETA, and completion in one place.
              </p>
            </div>
            <div className="grid gap-3">
              {([
                { icon: Globe2, label: "Local, interstate, import, and export workflows" },
                { icon: Truck, label: "Driver assignment and delivery proof" },
                { icon: Radar, label: "Status updates and ETA guidance" }
              ] as const).map((item) => (
                <div key={item.label} className="glass flex items-center gap-3 rounded-md p-4">
                  <item.icon className="size-5 text-primary" />
                  <span className="font-medium">{item.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </AnimatedShell>
  );
}
