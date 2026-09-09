import type { Metadata } from "next";
import { CustomerPasswordForm } from "@/components/customer/customer-password-form";
import { createMetadata } from "@/lib/seo";

export const metadata: Metadata = createMetadata({
  title: "Set New Customer Password - Fly Logistics",
  description: "Set a new password for your secure Fly Logistics customer account.",
  path: "/customer/reset-password",
  noIndex: true
});

export default function CustomerResetPasswordPage() {
  return <CustomerPasswordForm mode="update" />;
}
