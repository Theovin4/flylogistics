import type { Metadata } from "next";
import { Clock3, Headphones, LineChart, ShieldCheck } from "lucide-react";
import { SiteFooter } from "@/components/brand/site-footer";
import { SiteHeader } from "@/components/brand/site-header";
import { CloudDemoForm } from "@/components/cloud/cloud-demo-form";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createMetadata } from "@/lib/seo";

export const metadata: Metadata = createMetadata({
  title: "Request Fly Logistics Cloud Demo",
  description:
    "Request a Fly Logistics Cloud demo for your logistics company and see shipment tracking, customer portals, dispatch operations, billing, analytics, and white-label basics.",
  path: "/cloud/demo",
  keywords: ["logistics software demo", "courier software demo", "delivery management SaaS demo", "shipment tracking demo"]
});

export default function CloudDemoPage() {
  return (
    <>
      <SiteHeader />
      <main id="main-content" className="px-4 py-12 sm:px-6 lg:px-8">
        <section className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
          <div>
            <Badge className="border-primary/40 bg-primary/10 text-primary">Book a demo</Badge>
            <h1 className="mt-5 text-4xl font-black sm:text-6xl">See how Fly Logistics Cloud can run your delivery operations.</h1>
            <p className="mt-5 text-base leading-8 text-muted-foreground">
              Tell us about your team, branches, shipment volume, and current process. We will prepare a practical walkthrough focused on your daily logistics workflow.
            </p>
            <div className="mt-8 grid gap-4">
              {[
                { title: "30-minute operational walkthrough", body: "See shipment creation, tracking, customer portal, and dashboard flow.", icon: Clock3 },
                { title: "Security and role review", body: "Understand admin, dispatcher, driver, customer, and company workspace boundaries.", icon: ShieldCheck },
                { title: "Growth planning", body: "Review onboarding, pricing, analytics, and launch readiness for your company.", icon: LineChart },
                { title: "Support guidance", body: "Get recommendations for rollout, staff training, and customer communication.", icon: Headphones }
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <Card key={item.title} className="glass">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-lg">
                        <Icon className="size-5 text-primary" />
                        {item.title}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="text-sm leading-7 text-muted-foreground">{item.body}</CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
          <CloudDemoForm />
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
