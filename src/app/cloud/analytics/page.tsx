import type { Metadata } from "next";
import { CloudDashboard } from "@/components/cloud/cloud-dashboard";
import { createMetadata } from "@/lib/seo";

export const metadata: Metadata = createMetadata({
  title: "Cloud Analytics - Fly Logistics",
  description: "View company logistics metrics in Fly Logistics Cloud.",
  path: "/cloud/analytics",
  noIndex: true
});

export default function CloudAnalyticsPage() {
  return <CloudDashboard section="analytics" />;
}
