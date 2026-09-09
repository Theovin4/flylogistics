import type { Metadata } from "next";
import { CloudDashboard } from "@/components/cloud/cloud-dashboard";
import { createMetadata } from "@/lib/seo";

export const metadata: Metadata = createMetadata({
  title: "Cloud Drivers - Fly Logistics",
  description: "Manage company driver visibility and operations in Fly Logistics Cloud.",
  path: "/cloud/drivers",
  noIndex: true
});

export default function CloudDriversPage() {
  return <CloudDashboard section="drivers" />;
}
