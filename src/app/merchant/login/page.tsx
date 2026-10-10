import type { Metadata } from "next";
import { MerchantAuthForm } from "@/components/merchant/merchant-auth-form";
import { createMetadata } from "@/lib/seo";

export const metadata: Metadata = createMetadata({
  title: "Merchant Login - Fly Logistics Business Shipping Portal",
  description: "Sign in to manage business shipments, recipients, wallet payments, invoices, tracking, and fulfilment analytics with Fly Logistics.",
  path: "/merchant/login",
  noIndex: true
});

export default function MerchantLoginPage() {
  return <MerchantAuthForm mode="login" />;
}

