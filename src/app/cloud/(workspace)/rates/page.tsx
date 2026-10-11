import type { Metadata } from "next";
import { CloudDashboard } from "@/components/cloud/cloud-dashboard";
import { createMetadata } from "@/lib/seo";

export const metadata: Metadata = createMetadata({
  title: "Cloud Rate Cards - Fly Logistics",
  description: "Manage company delivery prices, weight charges, and delivery estimates.",
  path: "/cloud/rates",
  noIndex: true
});

export default function CloudRatesPage() {
  return <CloudDashboard section="rates" />;
}
