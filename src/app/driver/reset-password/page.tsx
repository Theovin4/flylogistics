import type { Metadata } from "next";
import { DriverPasswordForm } from "@/components/auth/driver-password-form";
import { createMetadata } from "@/lib/seo";

export const metadata: Metadata = createMetadata({
  title: "Set New Driver Password - Fly Logistics",
  description: "Set a new password for your secure Fly Logistics driver or rider account.",
  path: "/driver/reset-password",
  noIndex: true
});

export default function DriverResetPasswordPage() {
  return <DriverPasswordForm mode="update" />;
}
