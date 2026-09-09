import type { Metadata } from "next";
import { CustomerPasswordForm } from "@/components/customer/customer-password-form";
import { createMetadata } from "@/lib/seo";

export const metadata: Metadata = createMetadata({
  title: "Customer Password Reset - Fly Logistics",
  description: "Reset your Fly Logistics customer portal password securely.",
  path: "/customer/forgot-password",
  noIndex: true
});

export default function CustomerForgotPasswordPage() {
  return <CustomerPasswordForm mode="request" />;
}
