import type { Metadata } from "next";
import { CloudDashboard } from "@/components/cloud/cloud-dashboard";
import { createMetadata } from "@/lib/seo";

export const metadata: Metadata = createMetadata({
  title: "Cloud Shipments - Fly Logistics",
  description: "View company shipments in Fly Logistics Cloud.",
  path: "/cloud/shipments",
  noIndex: true
});

export default function CloudShipmentsPage() {
  return <CloudDashboard section="shipments" />;
}
