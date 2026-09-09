import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Clock3, LogIn, MessageCircle, PackageCheck, Truck, UserPlus } from "lucide-react";
import { SiteFooter } from "@/components/brand/site-footer";
import { SiteHeader } from "@/components/brand/site-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getWhatsAppUrl, whatsappMessages } from "@/lib/contact";
import { createMetadata } from "@/lib/seo";

export const metadata: Metadata = createMetadata({
  title: "Get Global Shipping and Nigeria Delivery Prices - Fly Logistics",
  description: "Get a Fly Logistics delivery price estimate for local Nigeria delivery, international import shipping, international export shipping, interstate delivery, Lagos delivery, and business freight.",
  path: "/quote",
  keywords: ["global shipping quote", "international delivery Nigeria", "import shipping Nigeria", "export shipping Nigeria", "worldwide logistics company", "delivery price Nigeria", "get delivery price", "book delivery", "shipment booking", "delivery price estimate", "Nigeria delivery service", "Lagos delivery service", "interstate delivery Nigeria"]
});

const bookingSteps = [
  { icon: UserPlus, title: "Create customer account", text: "Every booking is linked to your portal, wallet, support, and payment history." },
  { icon: PackageCheck, title: "Book inside your account", text: "Enter pickup, receiver, package, delivery type, urgency, and notes securely." },
  { icon: Truck, title: "Pay and track", text: "After payment, a Fly Logistics tracking ID is created for your shipment." }
] as const;

export default function QuotePage() {
  return (
    <>
      <SiteHeader />
      <main id="main-content" className="overflow-hidden">
        <section className="relative border-b border-border/70">
          <div className="absolute inset-0 grid-field opacity-55" aria-hidden="true" />
          <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:px-6 sm:py-14 lg:grid-cols-[0.88fr_1.12fr] lg:px-8 lg:py-20">
            <div className="relative z-10 flex flex-col justify-center">
              <Badge className="w-fit border-primary/40 bg-primary/10 text-primary">Customer booking</Badge>
              <h1 className="mt-6 text-4xl font-black tracking-normal text-balance sm:text-5xl lg:text-6xl">
                Book delivery with a premium logistics team.
              </h1>
              <p className="mt-5 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8">
                Get a delivery price estimate in under a minute for local movement inside Nigeria, imports into Nigeria, and exports to worldwide destinations. Fly Logistics reviews your route, confirms availability, assigns the right operations path, and turns approved bookings into trackable shipments.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Button asChild size="lg" className="w-full sm:w-auto">
                  <Link href="/customer/register">
                    Create customer account <UserPlus />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline" className="w-full sm:w-auto">
                  <Link href="/customer/login?next=/customer">
                    Customer login <LogIn />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline" className="w-full sm:w-auto">
                  <Link href="/tracking">
                    Track shipment <Clock3 />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline" className="w-full sm:w-auto">
                  <a href={getWhatsAppUrl(whatsappMessages.quoteRequest({ urgency: "critical" }))} target="_blank" rel="noreferrer">
                    Chat on WhatsApp <MessageCircle />
                  </a>
                </Button>
              </div>
              <div className="mt-8 grid gap-3 md:grid-cols-3">
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
              <Card className="glass overflow-hidden">
                <CardHeader className="p-5 sm:p-6">
                  <Badge className="w-fit border-primary/40 bg-primary/10 text-primary">Account required</Badge>
                  <CardTitle className="mt-3 text-2xl">Shipping starts inside your customer portal.</CardTitle>
                  <p className="text-sm leading-6 text-muted-foreground">
                    For customer protection, payment security, wallet history, delivery support, and tracking visibility, Fly Logistics does not accept shipment bookings from anonymous public visitors.
                  </p>
                </CardHeader>
                <CardContent className="grid gap-3 p-5 pt-0 sm:p-6 sm:pt-0">
                  <Button asChild size="lg">
                    <Link href="/customer/register">
                      Create customer account <ArrowRight />
                    </Link>
                  </Button>
                  <Button asChild size="lg" variant="outline">
                    <Link href="/customer/login?next=/customer">
                      Sign in to book shipment <LogIn />
                    </Link>
                  </Button>
                  <div className="rounded-md border bg-background/45 p-4 text-sm leading-6 text-muted-foreground">
                    Registered customers can book local Nigeria delivery, import shipments into Nigeria, export shipments worldwide, fund wallet, pay securely, and track all shipments inside the account dashboard.
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
