import type { Metadata } from "next";
import { CustomerProfile } from "@/components/customer/customer-profile";
import { createMetadata } from "@/lib/seo";

export const metadata: Metadata = createMetadata({
  title: "Customer Profile - Fly Logistics",
  description: "Manage your Fly Logistics customer profile and account details.",
  path: "/customer/profile",
  noIndex: true
});

export default function CustomerProfilePage() {
  return <CustomerProfile />;
}
