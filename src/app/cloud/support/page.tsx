import type { Metadata } from "next";
import { CloudDashboard } from "@/components/cloud/cloud-dashboard";
import { createMetadata } from "@/lib/seo";

export const metadata: Metadata = createMetadata({
  title: "Cloud Support - Fly Logistics",
  description: "Open and manage protected Fly Logistics Cloud support conversations.",
  path: "/cloud/support",
  noIndex: true
});

export default function CloudSupportPage() {
  return <CloudDashboard section="support" />;
}
