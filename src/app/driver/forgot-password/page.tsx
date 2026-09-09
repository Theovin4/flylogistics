import type { Metadata } from "next";
import { DriverPasswordForm } from "@/components/auth/driver-password-form";
import { createMetadata } from "@/lib/seo";

export const metadata: Metadata = createMetadata({
  title: "Driver Password Reset - Fly Logistics",
  description: "Reset your Fly Logistics driver or rider portal password securely.",
  path: "/driver/forgot-password",
  noIndex: true
});

export default function DriverForgotPasswordPage() {
  return <DriverPasswordForm mode="request" />;
}
