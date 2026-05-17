import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Clock3, MessageCircle, PackageCheck, ShieldCheck, Truck } from "lucide-react";
import { SiteFooter } from "@/components/brand/site-footer";
import { SiteHeader } from "@/components/brand/site-header";
import { QuoteRequestForm } from "@/components/shipments/quote-request-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getWhatsAppUrl, whatsappMessages } from "@/lib/contact";

export const metadata: Metadata = {
  title: "Book a Shipment",
  description: "Request a Fly Logistics booking, get a quote reference, and let the operations team create a trackable shipment."
};

const bookingSteps = [
  { icon: PackageCheck, title: "Submit shipment details", text: "Pickup, delivery, package type, weight, urgency, and special notes." },
  { icon: ShieldCheck, title: "Operations review", text: "Fly Logistics validates route fit, driver availability, risk, and price." },
  { icon: Truck, title: "Tracking issued", text: "Once approved, admins convert the request into a live shipment with a tracking ID." }
] as const;

export default function QuotePage() {
  return (
    <>
      <SiteHeader />
      <main className="overflow-hidden">
        <section className="relative border-b border-border/70">
          <div className="absolute inset-0 grid-field opacity-55" aria-hidden="true" />
          <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[0.88fr_1.12fr] lg:px-8 lg:py-20">
            <div className="relative z-10 flex flex-col justify-center">
              <Badge className="w-fit border-primary/40 bg-primary/10 text-primary">Customer booking</Badge>
              <h1 className="mt-6 text-5xl font-black tracking-normal text-balance sm:text-6xl">
                Book freight with a premium AI logistics control tower.
              </h1>
              <p className="mt-5 max-w-2xl text-lg leading-8 text-muted-foreground">
                Send a quote request in under a minute. Fly Logistics captures the request in Supabase, lets admins assign a driver, and turns approved bookings into trackable shipments.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Button asChild size="lg">
                  <a href="#booking-form">
                    Start booking <ArrowRight />
                  </a>
                </Button>
                <Button asChild size="lg" variant="outline">
                  <Link href="/tracking">
                    Track shipment <Clock3 />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline">
                  <a href={getWhatsAppUrl(whatsappMessages.quoteRequest({ urgency: "critical" }))} target="_blank" rel="noreferrer">
                    Chat on WhatsApp <MessageCircle />
                  </a>
                </Button>
              </div>
              <div className="mt-8 grid gap-3 sm:grid-cols-3">
                {bookingSteps.map((step) => (
                  <div key={step.title} className="rounded-md border bg-background/45 p-4">
                    <step.icon className="size-5 text-primary" />
                    <h2 className="mt-3 text-sm font-semibold">{step.title}</h2>
                    <p className="mt-2 text-xs leading-5 text-muted-foreground">{step.text}</p>
                  </div>
                ))}
              </div>
            </div>
            <div id="booking-form" className="relative z-10 scroll-mt-24">
              <QuoteRequestForm />
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
