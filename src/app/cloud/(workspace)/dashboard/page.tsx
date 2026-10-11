import type { Metadata } from "next";
import { CloudDashboard } from "@/components/cloud/cloud-dashboard";
import { createMetadata } from "@/lib/seo";

export const metadata: Metadata = createMetadata({
  title: "Fly Logistics Cloud Dashboard",
  description: "View your company logistics operations, shipments, drivers, quotes, and activity.",
  path: "/cloud/dashboard",
  noIndex: true
});

export default function CloudDashboardPage() {
  return <CloudDashboard section="overview" />;
}
