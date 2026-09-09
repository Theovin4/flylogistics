import type { Metadata } from "next";
import { CustomerDashboard } from "@/components/customer/customer-dashboard";
import { createMetadata } from "@/lib/seo";

export const metadata: Metadata = createMetadata({
  title: "Customer Portal - Fly Logistics",
  description: "Secure Fly Logistics customer portal for quote requests, shipments, payment status, timelines, and delivery confirmations.",
  path: "/customer",
  noIndex: true
});

export default function CustomerPage() {
  return <CustomerDashboard />;
}
