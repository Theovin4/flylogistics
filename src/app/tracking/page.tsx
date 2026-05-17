import type { Metadata } from "next";
import { SiteFooter } from "@/components/brand/site-footer";
import { SiteHeader } from "@/components/brand/site-header";
import { TrackingLookup } from "@/components/shipments/tracking-lookup";

export const metadata: Metadata = {
  title: "Track Shipment",
  description: "Track a Fly Logistics shipment with status, ETA, assigned driver, timeline, and proof of delivery."
};

export default function TrackingPage() {
  return (
    <>
      <SiteHeader />
      <main className="relative overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-80 grid-field opacity-45" aria-hidden="true" />
        <section className="relative mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8 lg:py-20">
          <TrackingLookup />
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
