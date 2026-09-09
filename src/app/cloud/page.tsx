import type { Metadata } from "next";
import Link from "next/link";
import type { Route } from "next";
import { ArrowRight, BarChart3, Building2, CheckCircle2, Globe2, LockKeyhole, RadioTower, ShieldCheck, Truck, WalletCards } from "lucide-react";
import { SiteHeader } from "@/components/brand/site-header";
import { SiteFooter } from "@/components/brand/site-footer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createMetadata } from "@/lib/seo";

export const metadata: Metadata = createMetadata({
  title: "Fly Logistics Cloud - Logistics SaaS for Delivery Companies",
  description:
    "Fly Logistics Cloud is a commercial logistics SaaS for delivery companies that need shipment tracking, customer portals, driver operations, billing, analytics, and white-label basics.",
  path: "/cloud",
  keywords: ["logistics SaaS", "delivery management software", "shipment tracking software", "dispatch software", "logistics software Nigeria"]
});

const platformFeatures = [
  { title: "Tracking-first operations", body: "Give customers a clear branded tracking number, timeline, ETA, and delivery updates from one workspace.", icon: RadioTower },
  { title: "Company workspaces", body: "Create secure tenant workspaces with company settings, support contacts, teams, customers, and shipments.", icon: Building2 },
  { title: "Driver and dispatch control", body: "Coordinate riders, drivers, dispatchers, and flexible fulfilment from one protected operations workspace.", icon: Truck },
  { title: "Payments and wallet-ready", body: "Support billing visibility, payment history, wallet flows, and subscription management through secure checkout.", icon: WalletCards },
  { title: "Analytics for growth", body: "Track shipment volume, active deliveries, customers, quote requests, and revenue signals as your company scales.", icon: BarChart3 },
  { title: "Built for trust", body: "Role separation, private admin data, branded customer experiences, and secure server-side integrations.", icon: ShieldCheck }
];

export default function CloudLandingPage() {
  return (
    <>
      <SiteHeader />
      <main id="main-content" className="px-4 py-12 sm:px-6 lg:px-8">
        <section className="mx-auto grid max-w-7xl gap-10 lg:min-h-[72vh] lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
          <div>
            <Badge className="border-primary/40 bg-primary/10 text-primary">Fly Logistics Cloud</Badge>
            <h1 className="mt-5 max-w-4xl text-4xl font-black tracking-normal sm:text-6xl">
              Run a modern logistics company from one branded operating system.
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-8 text-muted-foreground">
              Launch shipment tracking, booking, customer portals, driver operations, payments, analytics, and white-label basics with a 14-day free trial.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg">
                <Link href={"/cloud/signup" as Route}>
                  Start 14-day free trial <ArrowRight />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href={"/cloud/demo" as Route}>Request demo</Link>
              </Button>
            </div>
            <div className="mt-8 grid gap-3 text-sm text-muted-foreground sm:grid-cols-3">
              {["No setup fee", "Cloud dashboard included", "Mobile-first for operators"].map((item) => (
                <div key={item} className="flex items-center gap-2">
                  <CheckCircle2 className="size-4 text-emerald-500" />
                  {item}
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-md border bg-card/70 p-4 shadow-2xl shadow-primary/10">
            <div className="grid gap-3">
              <div className="rounded-md border bg-background/70 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-muted-foreground">Live operations</span>
                  <Badge className="border-emerald-500/30 bg-emerald-500/10 text-emerald-500">Active</Badge>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  {[
                    ["1,248", "Shipments"],
                    ["97%", "On-time"],
                    ["24/7", "Support"]
                  ].map(([value, label]) => (
                    <div key={label} className="rounded-md border bg-card p-4">
                      <div className="text-2xl font-black">{value}</div>
                      <div className="mt-1 text-xs uppercase tracking-[0.22em] text-muted-foreground">{label}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Card className="glass">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <LockKeyhole className="size-4 text-primary" />
                      Tenant isolation
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm text-muted-foreground">Each logistics company gets a private workspace and role-based access.</CardContent>
                </Card>
                <Card className="glass">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Globe2 className="size-4 text-primary" />
                      Scale ready
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm text-muted-foreground">Built for local, interstate, international, merchant, fleet, and warehouse operations.</CardContent>
                </Card>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto mt-14 grid max-w-7xl gap-4 md:grid-cols-2 xl:grid-cols-3">
          {platformFeatures.map((feature) => {
            const Icon = feature.icon;
            return (
              <Card key={feature.title} className="glass">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Icon className="size-5 text-primary" />
                    {feature.title}
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-sm leading-7 text-muted-foreground">{feature.body}</CardContent>
              </Card>
            );
          })}
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
