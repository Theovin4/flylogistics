import type { Metadata } from "next";
import { CloudDashboard } from "@/components/cloud/cloud-dashboard";
import { createMetadata } from "@/lib/seo";

export const metadata: Metadata = createMetadata({
  title: "Cloud Billing - Fly Logistics",
  description: "Manage Fly Logistics Cloud trial, subscription plan, billing status, and secure checkout.",
  path: "/cloud/billing",
  noIndex: true
});

export default function CloudBillingPage() {
  return <CloudDashboard section="billing" />;
}
