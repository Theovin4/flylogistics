import type { Metadata } from "next";
import Link from "next/link";
import type { Route } from "next";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { SiteFooter } from "@/components/brand/site-footer";
import { SiteHeader } from "@/components/brand/site-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cloudBillingPlans, cloudLimitLabel } from "@/lib/cloud-plans";
import { createMetadata } from "@/lib/seo";

export const metadata: Metadata = createMetadata({
  title: "Fly Logistics Cloud Pricing - Logistics Software Plans",
  description:
    "Compare Fly Logistics Cloud subscription plans for delivery companies, courier teams, dispatch operations, customer portals, shipment tracking, billing, and analytics.",
  path: "/cloud/pricing",
  keywords: ["logistics software pricing", "delivery management software pricing", "courier software Nigeria", "shipment tracking SaaS pricing"]
});

export default function CloudPricingPage() {
  const money = (amount: number) => `NGN ${amount.toLocaleString("en-NG")}`;

  return (
    <>
      <SiteHeader />
      <main id="main-content" className="px-4 py-12 sm:px-6 lg:px-8">
        <section className="mx-auto max-w-7xl">
          <Badge className="border-primary/40 bg-primary/10 text-primary">Cloud pricing</Badge>
          <h1 className="mt-5 max-w-4xl text-4xl font-black sm:text-6xl">Plans for logistics teams that want to grow without operational chaos.</h1>
          <p className="mt-5 max-w-3xl text-base leading-8 text-muted-foreground">
            Start with a 14-day free trial. Upgrade when your company is ready for higher volume, stronger analytics, and deeper operational control.
          </p>
          <div className="mt-10 grid gap-4 lg:grid-cols-3">
            {(Object.entries(cloudBillingPlans) as Array<[keyof typeof cloudBillingPlans, (typeof cloudBillingPlans)[keyof typeof cloudBillingPlans]]>).map(([key, plan]) => (
              <Card key={key} className={`glass ${key === "growth" ? "border-primary/50 shadow-xl shadow-primary/10" : ""}`}>
                <CardHeader>
                  <div className="flex items-center justify-between gap-3">
                    <CardTitle>{plan.name}</CardTitle>
                    {key === "growth" && <Badge className="bg-primary text-primary-foreground">Most Popular</Badge>}
                  </div>
                  <div className="mt-4 text-4xl font-black">{money(plan.amount)}</div>
                  <p className="text-sm text-muted-foreground">per month after the 14-day free trial</p>
                </CardHeader>
                <CardContent>
                  <p className="text-sm leading-7 text-muted-foreground">{plan.description}</p>
                  <p className="mt-3 text-sm font-semibold">{cloudLimitLabel(plan.maxUsers, "users")} / {cloudLimitLabel(plan.maxDrivers, "drivers")}</p>
                  <div className="mt-5 grid gap-2">
                    {plan.features.map((feature) => (
                      <div key={feature} className="flex items-center gap-2 text-sm">
                        <CheckCircle2 className="size-4 text-emerald-500" />
                        {feature}
                      </div>
                    ))}
                  </div>
                  <Button asChild className="mt-6 w-full">
                    <Link href={"/cloud/signup" as Route}>
                      Start free trial <ArrowRight />
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
