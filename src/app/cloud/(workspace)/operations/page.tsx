import type { Metadata } from "next";
import { CloudDashboard } from "@/components/cloud/cloud-dashboard";
import { createMetadata } from "@/lib/seo";

export const metadata: Metadata = createMetadata({
  title: "Cloud Operations - Fly Logistics",
  description: "Assign drivers and manage company shipment progress.",
  path: "/cloud/operations",
  noIndex: true
});

export default function CloudOperationsPage() {
  return <CloudDashboard section="operations" />;
}
