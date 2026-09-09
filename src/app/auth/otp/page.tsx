import { AuthForm } from "@/components/sections/auth-form";
import { createMetadata } from "@/lib/seo";

export const metadata = createMetadata({
  title: "OTP Verification - Fly Logistics",
  description: "Verify secure Fly Logistics workspace access with a one-time passcode.",
  path: "/auth/otp",
  noIndex: true
});

export default function Page() { return <AuthForm mode="otp" />; }
