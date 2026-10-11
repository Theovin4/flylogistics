import type { Metadata } from "next";
import { CloudDashboard } from "@/components/cloud/cloud-dashboard";
import { createMetadata } from "@/lib/seo";

export const metadata: Metadata = createMetadata({
  title: "Cloud Customers - Fly Logistics",
  description: "View company customer and member activity in Fly Logistics Cloud.",
  path: "/cloud/customers",
  noIndex: true
});

export default function CloudCustomersPage() {
  return <CloudDashboard section="customers" />;
}
