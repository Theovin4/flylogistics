import type { Metadata } from "next";
import Link from "next/link";
import type { Route } from "next";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { SiteFooter } from "@/components/brand/site-footer";
import { SiteHeader } from "@/components/brand/site-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cloudPlanDefinitions, cloudLimitLabel, type CloudBillingPlan } from "@/lib/cloud-plans";
import { formatCloudBillingMoney } from "@/lib/tenant-locale";
import { createMetadata } from "@/lib/seo";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { listPublicCloudPlanPrices } from "@/server/cloud-plan-prices";

export const metadata: Metadata = createMetadata({
  title: "Fly Logistics Cloud Pricing - Logistics Software Plans",
  description:
    "Compare Fly Logistics Cloud subscription plans for delivery companies, courier teams, dispatch operations, customer portals, shipment tracking, billing, and analytics.",
  path: "/cloud/pricing",
  keywords: ["logistics software pricing", "delivery management software pricing", "courier software Nigeria", "shipment tracking SaaS pricing"]
});

export const dynamic = "force-dynamic";

export default async function CloudPricingPage({ searchParams }: { searchParams: Promise<{ currency?: string }> }) {
  const catalog = await listPublicCloudPlanPrices(getSupabaseAdmin());
  const requestedCurrency = String((await searchParams).currency ?? "NGN").toUpperCase();
  const currency = catalog.currencies.includes(requestedCurrency as (typeof catalog.currencies)[number])
    ? requestedCurrency
    : catalog.currencies.includes("NGN") ? "NGN" : catalog.currencies[0];
  const prices = new Map(catalog.prices.filter((price) => price.currency === currency).map((price) => [price.plan, price]));

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
          {catalog.currencies.length > 0 ? <div className="mt-6 flex flex-wrap items-center gap-2" aria-label="Billing currency selector"><span className="mr-1 text-sm font-semibold">Billed in:</span>{catalog.currencies.map((option) => <Button key={option} asChild size="sm" variant={option === currency ? "default" : "outline"}><Link href={`/cloud/pricing?currency=${option}` as Route}>{option}</Link></Button>)}</div> : <div className="mt-6 rounded-md border border-amber-500/30 bg-amber-500/10 p-4 text-sm">Subscription checkout is temporarily unavailable while billing plans are configured.</div>}
          <div className="mt-10 grid gap-4 lg:grid-cols-3">
            {(Object.entries(cloudPlanDefinitions) as Array<[CloudBillingPlan, (typeof cloudPlanDefinitions)[CloudBillingPlan]]>).map(([key, plan]) => {
              const price = prices.get(key);
              return (
              <Card key={key} className={`glass ${key === "growth" ? "border-primary/50 shadow-xl shadow-primary/10" : ""}`}>
                <CardHeader>
                  <div className="flex items-center justify-between gap-3">
                    <CardTitle>{plan.name}</CardTitle>
                    {key === "growth" && <Badge className="bg-primary text-primary-foreground">Most Popular</Badge>}
                  </div>
                  <div className="mt-4 text-4xl font-black">{price ? formatCloudBillingMoney(price.amount, price.currency as (typeof catalog.currencies)[number]) : "Contact sales"}</div>
                  <p className="text-sm text-muted-foreground">{price ? `Billed as ${price.currency} per month after the 14-day free trial` : "Billing plan configuration required"}</p>
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
              );
            })}
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
