import Link from "next/link";
import { ArrowRight, Bot, Boxes, BrainCircuit, ChartSpline, Clock3, Globe2, MapPinned, MessageCircle, Radar, ShieldCheck, Truck } from "lucide-react";
import { AnimatedShell } from "@/components/sections/animated-shell";
import { HeroVisual } from "@/components/sections/hero-visual";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getWhatsAppUrl } from "@/lib/contact";

const capabilities = [
  { icon: Bot, title: "AI Logistics Assistant", text: "Shipment help, exception summaries, route recommendations, and operations intelligence." },
  { icon: MapPinned, title: "Real-time Tracking", text: "Live map movement, ETA prediction, geolocation proof, and confidence scoring." },
  { icon: BrainCircuit, title: "Route Optimization", text: "Traffic-aware routing, fuel modeling, predictive rerouting, and load balancing." },
  { icon: ChartSpline, title: "Analytics Engine", text: "Revenue, delivery, warehouse, heatmap, and customer intelligence dashboards." },
  { icon: Boxes, title: "Enterprise Warehousing", text: "Bulk shipment management, dock scheduling, inventory signals, and API integrations." },
  { icon: ShieldCheck, title: "Secure Control Tower", text: "RBAC, rate limiting, validation, audit trails, and production-grade auth flows." }
] as const;

const stats = [
  ["14.8M", "events analyzed daily"],
  ["99.97%", "tracking uptime"],
  ["18%", "avg. freight savings"],
  ["42", "countries connected"]
] as const;

export function Landing() {
  return (
    <AnimatedShell>
      <section className="relative overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-96 grid-field opacity-60" aria-hidden="true" />
        <div className="mx-auto grid max-w-7xl gap-10 px-4 pb-16 pt-14 sm:px-6 lg:grid-cols-[0.95fr_1.05fr] lg:px-8 lg:pb-24 lg:pt-20">
          <div className="relative z-10 flex flex-col justify-center">
            <Badge className="w-fit border-primary/40 bg-primary/10 text-primary">Global AI logistics OS</Badge>
            <h1 className="mt-6 max-w-4xl text-5xl font-black tracking-normal text-balance sm:text-6xl lg:text-7xl">
              Freight, fleet, and fulfillment commanded by AI.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-muted-foreground">
              Fly Logistics is a premium operating system for global shipment visibility, instant quotes, route optimization, warehouse intelligence, driver workflows, and enterprise logistics automation.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg">
                <Link href="/quote">
                  Book shipment <ArrowRight />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/tracking">
                  Track shipment <Clock3 />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <a href={getWhatsAppUrl()} target="_blank" rel="noreferrer">
                  WhatsApp urgent <MessageCircle />
                </a>
              </Button>
            </div>
            <div className="mt-10 grid max-w-2xl grid-cols-2 gap-3 sm:grid-cols-4">
              {stats.map(([value, label]) => (
                <div key={label} className="glass rounded-lg p-4">
                  <div className="font-mono text-2xl font-bold">{value}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{label}</div>
                </div>
              ))}
            </div>
          </div>
          <HeroVisual />
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="grid gap-5 md:grid-cols-3">
            {([
              ["Control tower", "A Linear-clean command center for dispatchers, admins, customers, and drivers."],
              ["Financial layer", "Stripe-inspired invoices, payment history, quote governance, and revenue analytics."],
              ["Autonomous network", "Tesla-like live fleet telemetry, movement paths, ETA signals, and routing AI."]
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

      <section className="border-y border-border/70 bg-foreground/[0.025]">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-20 sm:px-6 lg:grid-cols-[0.8fr_1.2fr] lg:px-8">
          <div>
            <Badge className="border-primary/40 bg-primary/10 text-primary">Platform</Badge>
            <h2 className="mt-5 text-4xl font-black tracking-normal text-balance">One operating layer for every logistics workflow.</h2>
            <p className="mt-4 text-muted-foreground">
              Public pages, auth flows, role dashboards, AI APIs, tracking, quote engine, analytics, notifications, proof of delivery, and enterprise integrations are structured for real product expansion.
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

      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        <div className="relative overflow-hidden rounded-lg border bg-black p-8 text-white sm:p-10">
          <div className="absolute inset-0 grid-field opacity-45" />
          <div data-route-line className="orange-line absolute left-0 top-16 h-px w-full origin-left" />
          <div data-route-line className="orange-line absolute left-0 top-36 h-px w-full origin-left" />
          <div className="relative grid gap-10 lg:grid-cols-[1fr_0.8fr]">
            <div>
              <Badge className="border-white/20 bg-white/10 text-white">Live network</Badge>
              <h2 className="mt-5 text-4xl font-black tracking-normal">From quote to proof of delivery without losing signal.</h2>
              <p className="mt-4 max-w-2xl text-white/70">
                Customers track shipments, drivers capture signatures and images, dispatchers optimize fleets, and admins govern revenue and risk from one system.
              </p>
            </div>
            <div className="grid gap-3">
              {([
                { icon: Globe2, label: "Multimodal freight orchestration" },
                { icon: Truck, label: "Driver and fleet workflows" },
                { icon: Radar, label: "Predictive rerouting and ETA confidence" }
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
