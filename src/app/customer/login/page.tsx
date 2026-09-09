import type { Metadata } from "next";
import { CustomerAuthForm } from "@/components/customer/customer-auth-form";
import { createMetadata } from "@/lib/seo";

export const metadata: Metadata = createMetadata({
  title: "Customer Login - Fly Logistics Shipment Tracking and Delivery Portal",
  description: "Sign in to the Fly Logistics customer portal for shipment tracking, delivery updates, invoices, support, saved addresses, and delivery confirmations.",
  path: "/customer/login",
  keywords: ["customer logistics portal", "shipment tracking login", "delivery account Nigeria", "Fly Logistics customer login"]
});

export default function CustomerLoginPage() {
  return <CustomerAuthForm mode="login" />;
}
