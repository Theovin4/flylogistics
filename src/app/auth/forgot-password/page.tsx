import { AuthForm } from "@/components/sections/auth-form";
import { createMetadata } from "@/lib/seo";

export const metadata = createMetadata({
  title: "Reset Password - Fly Logistics",
  description: "Reset secure Fly Logistics workspace access.",
  path: "/auth/forgot-password",
  noIndex: true
});

export default function Page() { return <AuthForm mode="forgot" />; }
