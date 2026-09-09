import { MapPageClient } from "@/app/map/map-page-client";
import { createMetadata } from "@/lib/seo";

export const metadata = createMetadata({
  title: "Live Delivery Map - Fly Logistics Driver and Shipment Tracking",
  description: "View Fly Logistics delivery movement, driver availability, assigned shipments, Lagos delivery activity, and live logistics operations.",
  path: "/map",
  keywords: ["live delivery map", "driver tracking", "fleet map", "Lagos delivery map", "shipment tracking Nigeria"]
});

export default function MapPage() {
  return <MapPageClient />;
}
