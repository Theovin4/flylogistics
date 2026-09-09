import type { Metadata } from "next";
import type { Route } from "next";
import Link from "next/link";
import { ArrowRight, Building2, CheckCircle2, CreditCard, FileSpreadsheet, ShieldCheck, Users } from "lucide-react";
import { SiteFooter } from "@/components/brand/site-footer";
import { SiteHeader } from "@/components/brand/site-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LeadCaptureForm } from "@/components/growth/lead-capture-form";
import { createMetadata } from "@/lib/seo";

export const metadata: Metadata = createMetadata({
  title: "Business Logistics and Merchant Shipping - Fly Logistics",
  description: "Create a Fly Logistics business account for bulk shipment booking, wallet payments, invoices, saved addresses, team access, and delivery analytics.",
  keywords: [
    "business logistics Nigeria",
    "merchant shipping Nigeria",
    "bulk shipment Lagos",
    "business delivery service",
    "logistics company for businesses"
  ],
  path: "/merchant"
});

const features = [
  { icon: FileSpreadsheet, title: "Bulk shipment upload", text: "Upload shipment rows, preview costs, and create bookings faster." },
  { icon: CreditCard, title: "Wallet and invoices", text: "Fund a business wallet, review transactions, and download invoices." },
  { icon: Users, title: "Team access", text: "Invite staff into a controlled business shipping workspace." },
  { icon: ShieldCheck, title: "Trackable operations", text: "Every confirmed shipment keeps Fly Logistics tracking visibility." }
] as const;

export default function MerchantPage() {
  return (
    <>
      <SiteHeader />
      <main id="main-content" className="relative overflow-hidden">
        <section className="relative border-b border-border/70">
          <div className="absolute inset-0 grid-field opacity-50" aria-hidden="true" />
          <div className="mx-auto grid max-w-7xl gap-8 px-4 py-16 sm:px-6 lg:grid-cols-[0.95fr_1.05fr] lg:px-8 lg:py-24">
            <div className="relative z-10">
              <Badge className="border-primary/40 bg-primary/10 text-primary">Business logistics</Badge>
              <h1 className="mt-5 max-w-4xl text-4xl font-black tracking-normal text-balance sm:text-6xl">
                A cleaner way for businesses to ship every day.
              </h1>
              <p className="mt-5 max-w-2xl text-base leading-8 text-muted-foreground">
                Open a Fly Logistics business account to manage bulk shipments, delivery prices, wallet payments, invoices, saved addresses, and tracking from one secure workspace.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Button asChild size="lg">
                  <Link href={"/customer/login?next=/merchant/dashboard" as Route}>
                    Merchant login <ArrowRight />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline">
                  <Link href={"/customer/register?next=/merchant/dashboard" as Route}>
                    Create business account
                  </Link>
                </Button>
              </div>
            </div>

            <Card className="glass relative z-10 overflow-hidden">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="size-5 text-primary" />
                  Merchant onboarding
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4">
                {[
                  "Sign in or create a customer account.",
                  "Create your company profile inside the merchant workspace.",
                  "Save pickup and delivery addresses.",
                  "Upload shipment batches, fund wallet, and track delivery performance."
                ].map((step, index) => (
                  <div key={step} className="flex gap-3 rounded-md border bg-background/45 p-4 text-sm">
                    <span className="grid size-8 shrink-0 place-items-center rounded-md bg-primary text-sm font-black text-primary-foreground">{index + 1}</span>
                    <span className="leading-6 text-muted-foreground">{step}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </section>

        <section className="mx-auto grid max-w-7xl gap-4 px-4 py-14 sm:px-6 md:grid-cols-2 lg:grid-cols-4 lg:px-8">
          {features.map((feature) => (
            <Card key={feature.title} className="glass">
              <CardContent className="p-5">
                <feature.icon className="size-6 text-primary" />
                <h2 className="mt-4 font-semibold">{feature.title}</h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{feature.text}</p>
              </CardContent>
            </Card>
          ))}
        </section>

        <section className="mx-auto grid max-w-7xl gap-6 px-4 pb-16 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:px-8">
          <Card className="glass">
            <CardHeader>
              <CardTitle>Business onboarding checklist</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm text-muted-foreground">
              {[
                "Confirm company contact details.",
                "Add common pickup and delivery addresses.",
                "Fund wallet or set billing terms.",
                "Upload shipment batches or create orders manually.",
                "Track shipments and payment history from the merchant workspace."
              ].map((item) => (
                <div key={item} className="flex gap-2 rounded-md border bg-background/45 p-3">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
                  <span>{item}</span>
                </div>
              ))}
            </CardContent>
          </Card>
          <LeadCaptureForm
            title="Talk to Fly Logistics business team"
            description="Tell us about your delivery volume, routes, and operational needs. This request feeds the Fly Logistics growth dashboard for follow-up."
            leadType="merchant"
            source="merchant_page"
            campaign="business_onboarding"
          />
        </section>

        <section className="mx-auto max-w-7xl px-4 pb-16 sm:px-6 lg:px-8">
          <div className="rounded-md border bg-background/45 p-5 sm:p-7">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex items-center gap-2 text-sm font-semibold text-primary">
                  <CheckCircle2 className="size-4" />
                  Built for Nigerian businesses and global lanes
                </div>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                  The merchant workspace is protected. Public visitors see onboarding first; logged-in businesses can open the dashboard after sign-in.
                </p>
              </div>
              <Button asChild variant="outline">
                <Link href={"/merchant/dashboard" as Route}>Open merchant workspace</Link>
              </Button>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
