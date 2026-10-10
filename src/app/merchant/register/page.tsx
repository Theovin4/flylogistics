import type { Metadata } from "next";
import { MerchantAuthForm } from "@/components/merchant/merchant-auth-form";
import { createMetadata } from "@/lib/seo";

export const metadata: Metadata = createMetadata({
  title: "Open a Merchant Account - Fly Logistics",
  description: "Create a Fly Logistics Merchant Account for recurring business deliveries, bulk shipment tools, business pricing, invoices, and team access.",
  path: "/merchant/register",
  noIndex: true
});

export default function MerchantRegisterPage() {
  return <MerchantAuthForm mode="register" />;
}

