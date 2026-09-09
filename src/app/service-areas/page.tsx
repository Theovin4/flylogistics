import Link from "next/link";
import { ArrowRight, Building2, Globe2, MapPin, MessageCircle, Plane, Ship, Truck } from "lucide-react";
import { SiteFooter } from "@/components/brand/site-footer";
import { SiteHeader } from "@/components/brand/site-header";
import { JsonLd } from "@/components/seo/json-ld";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getWhatsAppUrl, whatsappMessages } from "@/lib/contact";
import { createMetadata, faqJsonLd } from "@/lib/seo";
import { siteConfig } from "@/lib/site";

const serviceAreas = [
  {
    title: "Nigeria delivery network",
    icon: Truck,
    description: "Local, same-state, interstate, business, and urgent delivery coverage across major Nigerian commercial lanes.",
    links: [
      { label: "Lagos Delivery Service", href: "/lagos-delivery-services" },
      { label: "Abuja Logistics", href: "/abuja-logistics" },
      { label: "Ogun Courier Service", href: "/ogun-courier-service" },
      { label: "Port Harcourt Logistics", href: "/port-harcourt-logistics" }
    ]
  },
  {
    title: "Africa shipping lanes",
    icon: Globe2,
    description: "Export support from Nigeria into key African trade destinations with customs-aware review and Fly Logistics tracking.",
    links: [
      { label: "Nigeria to Ghana Shipping", href: "/nigeria-to-ghana-shipping" },
      { label: "Nigeria to Kenya Shipping", href: "/nigeria-to-kenya-shipping" },
      { label: "Nigeria to South Africa Shipping", href: "/nigeria-to-south-africa-shipping" }
    ]
  },
  {
    title: "Global freight services",
    icon: Plane,
    description: "International import, export, air freight, ocean freight, and worldwide fulfilment workflows under the Fly Logistics brand.",
    links: [
      { label: "International Shipping from Nigeria", href: "/international-shipping-from-nigeria" },
      { label: "Global Freight Solutions", href: "/global-freight-solutions" },
      { label: "Air Freight Services", href: "/air-freight-services" },
      { label: "Ocean Freight Services", href: "/ocean-freight-services" },
      { label: "E-commerce Fulfillment Worldwide", href: "/ecommerce-fulfillment-worldwide" }
    ]
  }
] as const;

const faqs = [
  ["Where does Fly Logistics operate?", "Fly Logistics supports local, interstate, business, warehouse, and international shipment requests across Nigeria and global trade lanes."],
  ["Can I track every shipment with Fly Logistics?", "Yes. Confirmed shipments use Fly Logistics tracking numbers so customers can follow status, ETA, and timeline updates in one branded experience."],
  ["Can businesses ship at scale?", "Yes. Business and merchant customers can manage multiple shipments, saved addresses, wallet payments, invoices, and operational reporting."]
] as const;

export const metadata = createMetadata({
  title: "Service Areas - Nigeria Delivery, Africa Shipping, and Global Freight",
  description:
    "Explore Fly Logistics service areas for Lagos delivery, Abuja logistics, Ogun courier service, Port Harcourt freight, Africa shipping lanes, and worldwide logistics from Nigeria.",
  path: "/service-areas",
  keywords: ["service areas", "Nigeria delivery network", "Africa shipping", "worldwide logistics", "global freight from Nigeria"]
});

export default function ServiceAreasPage() {
  return (
    <>
      <SiteHeader />
      <main id="main-content">
        <section className="relative overflow-hidden">
          <div className="absolute inset-0 grid-field opacity-60" aria-hidden="true" />
          <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
            <Badge className="border-primary/40 bg-primary/10 text-primary">Service areas</Badge>
            <h1 className="mt-6 max-w-4xl text-4xl font-black tracking-normal text-balance sm:text-5xl lg:text-6xl">
              Local delivery, interstate movement, and international freight from one trusted network.
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8">
              Fly Logistics helps customers and businesses move packages across Nigeria, Africa, and global lanes with clear pricing, branded tracking, and operations support.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg" className="w-full sm:w-auto">
                <Link href="/customer/register">
                  Create account <ArrowRight />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="w-full sm:w-auto">
                <Link href="/tracking">Track shipment</Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="w-full sm:w-auto">
                <a href={getWhatsAppUrl(whatsappMessages.generalSupport())} target="_blank" rel="noreferrer">
                  <MessageCircle />
                  WhatsApp support
                </a>
              </Button>
            </div>
          </div>
        </section>

        <section className="mx-auto grid max-w-7xl gap-5 px-4 pb-14 sm:px-6 sm:pb-20 lg:px-8">
          {serviceAreas.map((group) => (
            <Card key={group.title} className="glass">
              <CardHeader>
                <group.icon className="size-6 text-primary" />
                <CardTitle>{group.title}</CardTitle>
                <p className="text-sm leading-6 text-muted-foreground">{group.description}</p>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {group.links.map((link) => (
                  <Link key={link.href} href={link.href} className="group rounded-md border bg-background/45 p-4 transition hover:border-primary/50">
                    <span className="flex items-center justify-between gap-3 font-semibold">
                      {link.label}
                      <ArrowRight className="size-4 text-primary transition group-hover:translate-x-1" />
                    </span>
                  </Link>
                ))}
              </CardContent>
            </Card>
          ))}
        </section>

        <section className="border-y border-border/70 bg-foreground/[0.025]">
          <div className="mx-auto grid max-w-7xl gap-5 px-4 py-14 sm:px-6 md:grid-cols-3 lg:px-8">
            {[
              { icon: MapPin, title: "Operations office", value: siteConfig.contact.address },
              { icon: Ship, title: "International support", value: "Import, export, air freight, ocean freight, and global fulfilment review." },
              { icon: Building2, title: "Business logistics", value: "Merchant accounts, invoices, wallet payments, shipment history, and operational visibility." }
            ].map((item) => (
              <Card key={item.title} className="glass">
                <CardHeader>
                  <item.icon className="size-5 text-primary" />
                  <CardTitle className="text-base">{item.title}</CardTitle>
                </CardHeader>
                <CardContent className="text-sm leading-6 text-muted-foreground">{item.value}</CardContent>
              </Card>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
          <div className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr]">
            <div>
              <Badge className="border-primary/40 bg-primary/10 text-primary">FAQ</Badge>
              <h2 className="mt-4 text-3xl font-black tracking-normal">Coverage questions before booking.</h2>
            </div>
            <dl className="grid gap-3">
              {faqs.map(([question, answer]) => (
                <div key={question} className="rounded-md border bg-background/45 p-4">
                  <dt className="font-semibold">{question}</dt>
                  <dd className="mt-2 text-sm leading-6 text-muted-foreground">{answer}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>
      </main>
      <SiteFooter />
      <JsonLd data={faqJsonLd(faqs)} />
    </>
  );
}
