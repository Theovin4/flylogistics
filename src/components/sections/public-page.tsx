import Link from "next/link";
import type { Route } from "next";
import { ArrowRight, CheckCircle2, Clock3, Download, Mail, MapPin, MessageCircle, PackageSearch, Phone, ShieldCheck } from "lucide-react";
import { SiteFooter } from "@/components/brand/site-footer";
import { SiteHeader } from "@/components/brand/site-header";
import { ComplianceAndTimelineSection, EnterpriseTrustSection, PricingComparisonSection } from "@/components/sections/enterprise-trust";
import { JsonLd } from "@/components/seo/json-ld";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getWhatsAppUrl, whatsappMessages } from "@/lib/contact";
import { conversionLinks, siteConfig, type PublicPageConfig } from "@/lib/site";
import { breadcrumbJsonLd, faqJsonLd, serviceJsonLd } from "@/lib/seo";

const nigeriaLocations = new Set(["lagos-delivery-services", "abuja-logistics", "ogun-courier-service", "port-harcourt-logistics"]);

function isInternationalPage(page: PublicPageConfig) {
  return [
    "international",
    "global",
    "air-freight",
    "ocean-freight",
    "nigeria-to-",
    "ecommerce-fulfillment-worldwide"
  ].some((token) => page.slug.includes(token));
}

function pageContent(page: PublicPageConfig) {
  const service = page.serviceType ?? page.eyebrow;
  const area = page.areaServed ?? "Nigeria and global delivery lanes";
  const international = isInternationalPage(page);
  const locationPage = nigeriaLocations.has(page.slug);
  const warehousePage = page.slug.includes("warehouse") || page.slug.includes("warehousing");
  const aiPage = page.slug.includes("ai");
  const businessPage = page.slug.includes("business") || page.slug.includes("enterprise") || page.slug === "services";

  const serviceAreas = international
    ? [
        "Nigeria export and import request review",
        `${area} destination planning and documentation checks`,
        "Air, ocean, and specialist fulfilment where available",
        "Fly Logistics tracking for every approved shipment"
      ]
    : locationPage
      ? [
          `${area} pickup and delivery coordination`,
          "Same-state delivery requests with complete sender and receiver details",
          "Interstate handoff review for business and personal packages",
          "Customer support through Fly Logistics tracking and WhatsApp"
        ]
      : warehousePage
        ? [
            "Storage, sorting, and fulfilment preparation",
            "Warehouse-to-dispatch handoff visibility",
            "Business inventory movement and shipment release planning",
            "Delivery confirmation and private proof handling"
          ]
        : businessPage
          ? [
              "Quote-to-shipment workflow for operations teams",
              "Driver, dispatcher, customer, and admin visibility",
              "Revenue, payment, wallet, and delivery performance reporting",
              "Role-based access for growing logistics operations"
            ]
          : [
              `${service} across ${area}`,
              "Delivery price estimate and operations review",
              "Shipment timeline updates with Fly Logistics tracking",
              "Customer support before, during, and after delivery"
            ];

  const process = international
    ? [
        "Confirm the origin country, destination country, package value, customs information, and import or export direction.",
        "Review the route, documents, declared value, duties, taxes, service speed, and available fulfilment options.",
        "Create the Fly Logistics shipment record first so the customer receives one reliable tracking number.",
        "Map operational updates into a clear Fly Logistics timeline until delivery is completed."
      ]
    : [
        "Collect full sender details, receiver details, pickup address, destination address, state, phone numbers, package type, and weight.",
        `Calculate the ${service.toLowerCase()} price from route, delivery category, urgency, and weight before payment.`,
        "Confirm payment, generate the Fly Logistics tracking number, and prepare the shipment for pickup.",
        "Update the timeline from pickup to in-transit, arrival, and delivered status while keeping private details protected."
      ];

  const pricing = international
    ? [
        "International quotes depend on origin, destination, package value, chargeable weight, documents, duties, taxes, and freight mode.",
        "Air freight is usually selected for urgent cargo, documents, and lighter packages where speed matters.",
        "Ocean freight is better for larger, less urgent shipments where landed cost control matters.",
        "Final pricing may require operations review when customs, restricted items, insurance, or oversized cargo apply."
      ]
    : [
        "Same-state delivery starts from the current local price engine and includes a defined weight band before extra-kilogram charges apply.",
        "Interstate delivery is priced by state-to-state route, vehicle requirement, package weight, and ETA window.",
        "Urgent or difficult-address shipments may require operations review before final confirmation.",
        "Customers can pay securely and track with the Fly Logistics tracking number after confirmation."
      ];

  const trust = aiPage
    ? "Fly Logistics uses AI-assisted summaries to help customers understand status, ETA, delivery risk, and next steps without exposing internal operations systems."
    : international
      ? "Fly Logistics keeps one consistent customer experience, so customers track international movement through Fly Logistics across every supported route."
      : "Fly Logistics protects customer and recipient privacy by showing only safe tracking information publicly while keeping sensitive operational records restricted.";

  return { service, area, serviceAreas, process, pricing, trust };
}

function relatedLinksFor(page: PublicPageConfig) {
  const hrefs = new Set<string>();
  const add = (href: string) => {
    if (href !== `/${page.slug}`) hrefs.add(href);
  };

  add("/quote");
  add("/tracking");
  if (isInternationalPage(page)) {
    ["/international-shipping-from-nigeria", "/air-freight-services", "/ocean-freight-services", "/global-freight-solutions", "/service-areas"].forEach(add);
  } else if (nigeriaLocations.has(page.slug)) {
    ["/same-day-delivery", "/interstate-delivery", "/business-logistics", "/service-areas", "/pricing"].forEach(add);
  } else if (page.slug.includes("warehouse") || page.slug.includes("warehousing")) {
    ["/warehouse-services", "/warehousing", "/business-logistics", "/enterprise-logistics", "/pricing"].forEach(add);
  } else {
    conversionLinks.slice(0, 8).forEach((link) => add(link.href));
  }

  const labels = new Map<string, string>([
    ["/quote", "Get Delivery Price"],
    ["/tracking", "Track Shipment"],
    ["/same-day-delivery", "Same-day Delivery"],
    ["/interstate-delivery", "Interstate Delivery"],
    ["/business-logistics", "Business Logistics"],
    ["/warehouse-services", "Warehouse Services"],
    ["/warehousing", "Warehousing"],
    ["/enterprise-logistics", "Enterprise Logistics"],
    ["/pricing", "Delivery Pricing"],
    ["/service-areas", "Service Areas"],
    ["/international-shipping-from-nigeria", "International Shipping from Nigeria"],
    ["/air-freight-services", "Air Freight Services"],
    ["/ocean-freight-services", "Ocean Freight Services"],
    ["/global-freight-solutions", "Global Freight Solutions"]
  ]);

  return [...hrefs].slice(0, 6).map((href) => ({ href, label: labels.get(href) ?? href.replace("/", "").replaceAll("-", " ") }));
}

export function PublicPage({ page }: { page: PublicPageConfig }) {
  const content = pageContent(page);
  const faqs = page.faqs ?? [
    ["How do I start with Fly Logistics?", "Start by requesting a quote, then the operations team can review details and create a trackable shipment."],
    ["Can I track my shipment online?", "Yes. Public tracking shows status, timeline, assigned driver, ETA, and delivery confirmation updates."]
  ];
  const relatedLinks = relatedLinksFor(page);

  return (
    <>
      <SiteHeader />
      <main id="main-content">
        <section className="relative overflow-hidden">
          <div className="absolute inset-0 grid-field opacity-60" aria-hidden="true" />
          <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
            <nav aria-label="Breadcrumb" className="mb-6 flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              <Link href="/" className="hover:text-foreground">Home</Link>
              <span aria-hidden>/</span>
              <span className="text-primary">{page.eyebrow}</span>
            </nav>
            <Badge className="border-primary/40 bg-primary/10 text-primary">{page.eyebrow}</Badge>
            <h1 className="mt-6 max-w-4xl text-4xl font-black tracking-normal text-balance sm:text-5xl lg:text-6xl">{page.title}</h1>
            <p className="mt-6 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8">{page.description}</p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg" className="w-full sm:w-auto">
                <Link href="/quote">
                  Get Quote <ArrowRight />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="w-full sm:w-auto">
                <Link href="/tracking">
                  Track Shipment <PackageSearch />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="w-full sm:w-auto">
                <a href={getWhatsAppUrl(whatsappMessages.generalSupport())} target="_blank" rel="noreferrer">
                  Contact on WhatsApp <MessageCircle />
                </a>
              </Button>
            </div>
          </div>
        </section>
        <section aria-label={`${page.eyebrow} proof points`} className="mx-auto grid max-w-7xl gap-5 px-4 pb-14 sm:px-6 sm:pb-20 md:grid-cols-3 lg:px-8">
          {page.metrics.map((metric) => (
            <Card key={metric} className="glass">
              <CardHeader className="flex-row items-center gap-3">
                <CheckCircle2 className="size-5 text-primary" />
                <CardTitle>{metric}</CardTitle>
              </CardHeader>
            </Card>
          ))}
        </section>
        <EnterpriseTrustSection compact />
        <section className="mx-auto max-w-7xl px-4 pb-14 sm:px-6 sm:pb-20 lg:px-8" aria-label={`${page.eyebrow} service details`}>
          <div className="grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
            <div>
              <Badge className="border-primary/40 bg-primary/10 text-primary">Coverage</Badge>
              <h2 className="mt-4 text-3xl font-black tracking-normal text-balance">
                {content.service} across {content.area}.
              </h2>
              <p className="mt-4 text-sm leading-7 text-muted-foreground">
                {content.trust}
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {content.serviceAreas.map((item) => (
                <div key={item} className="rounded-md border bg-background/45 p-4">
                  <CheckCircle2 className="size-5 text-primary" />
                  <p className="mt-3 text-sm leading-6 text-muted-foreground">{item}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
        <section className="border-y border-border/70 bg-foreground/[0.025]" aria-label={`${page.eyebrow} process and pricing`}>
          <div className="mx-auto grid max-w-7xl gap-8 px-4 py-14 sm:px-6 sm:py-20 lg:grid-cols-2 lg:px-8">
            <div>
              <Badge className="border-primary/40 bg-primary/10 text-primary">Delivery process</Badge>
              <h2 className="mt-4 text-3xl font-black tracking-normal">From request to delivery.</h2>
              <ol className="mt-6 grid gap-3">
                {content.process.map((step, index) => (
                  <li key={step} className="rounded-md border bg-background/55 p-4">
                    <span className="font-mono text-xs font-bold text-primary">STEP {index + 1}</span>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">{step}</p>
                  </li>
                ))}
              </ol>
            </div>
            <div>
              <Badge className="border-primary/40 bg-primary/10 text-primary">Pricing guidance</Badge>
              <h2 className="mt-4 text-3xl font-black tracking-normal">Price and ETA factors.</h2>
              <div className="mt-6 grid gap-3">
                {content.pricing.map((item) => (
                  <div key={item} className="rounded-md border bg-background/55 p-4 text-sm leading-6 text-muted-foreground">
                    {item}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
        {page.slug === "pricing" ? (
          <>
            <PricingComparisonSection />
            <section className="mx-auto max-w-7xl px-4 pb-14 sm:px-6 sm:pb-20 lg:px-8" aria-label="Download Fly Logistics pricing guides">
              <Card className="glass">
                <CardHeader>
                  <Badge className="w-fit border-primary/40 bg-primary/10 text-primary">Pricing guides</Badge>
                  <CardTitle>Download current Fly Logistics delivery rates.</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-3 sm:grid-cols-3">
                  {[
                    { label: "Local Nigeria rates", href: "/pricing/fly-logistics-local-delivery-rates.pdf" },
                    { label: "International rates", href: "/pricing/fly-logistics-international-delivery-rates.pdf" },
                    { label: "Pricing summary", href: "/pricing/fly-logistics-pricing-summary.pdf" }
                  ].map((item) => (
                    <Button key={item.href} asChild variant="outline" className="w-full justify-between">
                      <a href={item.href} target="_blank" rel="noreferrer">
                        {item.label}
                        <Download className="size-4" />
                      </a>
                    </Button>
                  ))}
                </CardContent>
              </Card>
            </section>
          </>
        ) : null}
        {page.slug === "enterprise-logistics" || page.slug === "business-logistics" || page.slug === "services" ? (
          <ComplianceAndTimelineSection />
        ) : null}
        <section className="mx-auto grid max-w-7xl gap-5 px-4 pb-14 sm:px-6 sm:pb-20 md:grid-cols-2 lg:grid-cols-4 lg:px-8" aria-label="Fly Logistics trust signals">
          {[
            { icon: MapPin, label: "Operations office", value: siteConfig.contact.address },
            { icon: Mail, label: "Support email", value: siteConfig.contact.supportEmail, href: `mailto:${siteConfig.contact.supportEmail}` },
            { icon: Phone, label: "Support phone", value: siteConfig.contact.supportPhone, href: `tel:${siteConfig.contact.supportPhone.replaceAll(" ", "")}` },
            { icon: ShieldCheck, label: "Service promise", value: siteConfig.guarantees[0] }
          ].map((item) => (
            <Card key={item.label} className="glass">
              <CardHeader>
                <item.icon className="size-5 text-primary" />
                <CardTitle className="text-base">{item.label}</CardTitle>
              </CardHeader>
              <CardContent className="text-sm leading-6 text-muted-foreground">
                {item.href ? <a href={item.href} className="hover:text-foreground">{item.value}</a> : item.value}
              </CardContent>
            </Card>
          ))}
        </section>
        <section className="border-y border-border/70 bg-foreground/[0.025]">
          <div className="mx-auto grid max-w-7xl gap-6 px-4 py-14 sm:px-6 lg:grid-cols-[0.8fr_1.2fr] lg:px-8">
            <div>
              <Badge className="border-primary/40 bg-primary/10 text-primary">Next step</Badge>
              <h2 className="mt-4 text-3xl font-black tracking-normal text-balance">Ready to ship?</h2>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                Get a delivery price or track an existing shipment.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {conversionLinks.map((link) => (
                <Link key={link.href} href={link.href as Route} className="group rounded-md border bg-background/45 p-4 transition hover:border-primary/50">
                  <span className="flex items-center justify-between gap-3 text-sm font-semibold">
                    {link.label}
                    <ArrowRight className="size-4 text-primary transition group-hover:translate-x-1" />
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </section>
        <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-20 lg:px-8" aria-label="Related Fly Logistics services">
          <div className="grid gap-6 lg:grid-cols-[0.75fr_1.25fr]">
            <div>
              <Badge className="border-primary/40 bg-primary/10 text-primary">Related services</Badge>
              <h2 className="mt-4 text-3xl font-black tracking-normal">Related services.</h2>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {relatedLinks.map((link) => (
                <Link key={link.href} href={link.href as Route} className="group rounded-md border bg-background/45 p-4 transition hover:border-primary/50">
                  <span className="flex items-center justify-between gap-3 text-sm font-semibold capitalize">
                    {link.label}
                    <ArrowRight className="size-4 text-primary transition group-hover:translate-x-1" />
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </section>
        <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
          <div className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr]">
            <div>
              <Badge className="border-primary/40 bg-primary/10 text-primary">FAQ</Badge>
              <h2 className="mt-4 text-3xl font-black tracking-normal">Questions customers ask before booking.</h2>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                Answers are written for quick decisions, search visibility, and mobile scanning.
              </p>
            </div>
            <dl className="grid gap-3">
              {faqs.map(([question, answer]) => (
                <div key={question} className="rounded-md border bg-background/45 p-4">
                  <dt className="flex items-start gap-2 font-semibold">
                    <Clock3 className="mt-0.5 size-4 shrink-0 text-primary" />
                    {question}
                  </dt>
                  <dd className="mt-2 text-sm leading-6 text-muted-foreground">{answer}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>
      </main>
      <SiteFooter />
      <JsonLd data={serviceJsonLd(page)} />
      <JsonLd data={breadcrumbJsonLd([{ name: "Home", href: "/" }, { name: page.title, href: `/${page.slug}` }])} />
      <JsonLd data={faqJsonLd(faqs)} />
    </>
  );
}
