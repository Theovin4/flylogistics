import type { Metadata } from "next";
import { SiteFooter } from "@/components/brand/site-footer";
import { SiteHeader } from "@/components/brand/site-header";
import { TrackingLookup } from "@/components/shipments/tracking-lookup";
import { createMetadata } from "@/lib/seo";

export const metadata: Metadata = createMetadata({
  title: "Track Shipment - Fly Logistics Live Delivery Tracking",
  description: "Track a Fly Logistics shipment with live status, ETA, assigned driver, route timeline, and map position.",
  path: "/tracking",
  keywords: ["track shipment", "delivery tracking", "tracking ID", "live logistics tracking", "Nigeria shipment tracking"]
});

type TrackingPageProps = {
  searchParams?: Promise<{
    trackingId?: string;
  }>;
};

export default async function TrackingPage({ searchParams }: TrackingPageProps) {
  const params = await searchParams;
  const initialTrackingId = typeof params?.trackingId === "string" ? params.trackingId : "";

  return (
    <>
      <SiteHeader />
      <main id="main-content" className="relative overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-80 grid-field opacity-45" aria-hidden="true" />
        <section className="relative mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8 lg:py-20">
          <TrackingLookup initialTrackingId={initialTrackingId} />
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
