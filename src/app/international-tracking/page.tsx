import type { Metadata } from "next";
import { SiteFooter } from "@/components/brand/site-footer";
import { SiteHeader } from "@/components/brand/site-header";
import { TrackingLookup } from "@/components/shipments/tracking-lookup";
import { JsonLd } from "@/components/seo/json-ld";
import { Badge } from "@/components/ui/badge";
import { createMetadata, faqJsonLd, serviceJsonLd } from "@/lib/seo";

export const metadata: Metadata = createMetadata({
  title: "International Shipment Tracking - Fly Logistics",
  description:
    "Track international imports and exports with Fly Logistics tracking details, customs-aware timeline updates, ETA guidance, and delivery progress.",
  path: "/international-tracking",
  keywords: [
    "international tracking",
    "international shipping from Nigeria",
    "Nigeria import tracking",
    "Nigeria export tracking",
    "global shipment tracking"
  ]
});

const internationalTrackingFaqs = [
  ["Can I track international Fly Logistics shipments?", "Yes. Enter the Fly Logistics tracking ID to see status, ETA, route timeline, assigned fulfilment context, and delivery progress."],
  ["Will public tracking show customs documents?", "No. Public tracking shows safe shipment progress only. Private documents, phone numbers, and sensitive customs data remain protected."]
] as const;

type InternationalTrackingPageProps = {
  searchParams?: Promise<{
    trackingId?: string;
  }>;
};

export default async function InternationalTrackingPage({ searchParams }: InternationalTrackingPageProps) {
  const params = await searchParams;
  const initialTrackingId = typeof params?.trackingId === "string" ? params.trackingId : "";

  return (
    <>
      <SiteHeader />
      <main id="main-content" className="relative overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-96 grid-field opacity-45" aria-hidden="true" />
        <section className="relative mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
          <div className="mb-8 max-w-3xl">
            <Badge className="border-primary/40 bg-primary/10 text-primary">International tracking</Badge>
            <h1 className="mt-5 text-4xl font-black tracking-normal text-balance sm:text-5xl">
              Track imports and exports with Fly Logistics.
            </h1>
            <p className="mt-4 text-sm leading-6 text-muted-foreground sm:text-base sm:leading-7">
              Use your Fly Logistics tracking ID for global movement updates, import/export status, ETA guidance, and safe customer-facing shipment visibility.
            </p>
          </div>
          <TrackingLookup initialTrackingId={initialTrackingId} />
        </section>
      </main>
      <SiteFooter />
      <JsonLd
        data={serviceJsonLd({
          slug: "international-tracking",
          title: "International shipment tracking",
          eyebrow: "International tracking",
          description: "Track international Fly Logistics imports and exports with safe shipment visibility.",
          metrics: ["Import tracking", "Export tracking", "Global delivery visibility"],
          serviceType: "International shipment tracking",
          areaServed: "Global",
          faqs: internationalTrackingFaqs
        })}
      />
      <JsonLd data={faqJsonLd(internationalTrackingFaqs)} />
    </>
  );
}
