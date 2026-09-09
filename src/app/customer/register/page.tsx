import type { Metadata } from "next";
import { CustomerAuthForm } from "@/components/customer/customer-auth-form";
import { createMetadata } from "@/lib/seo";

export const metadata: Metadata = createMetadata({
  title: "Create Customer Account - Fly Logistics Delivery and Freight Portal",
  description: "Create a Fly Logistics customer account to book deliveries, manage shipment history, save addresses, view invoices, and receive delivery updates.",
  path: "/customer/register",
  keywords: ["create logistics account", "book delivery Nigeria", "customer delivery portal", "Lagos delivery account"]
});

export default function CustomerRegisterPage() {
  return <CustomerAuthForm mode="signup" />;
}
