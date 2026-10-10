import type { Metadata } from "next";
import { RoleGate } from "@/components/auth/role-gate";
import { MerchantOnboarding } from "@/components/merchant/merchant-onboarding";
import { createMetadata } from "@/lib/seo";

export const metadata: Metadata = createMetadata({
  title: "Merchant Onboarding - Fly Logistics",
  description: "Secure business setup for the Fly Logistics Merchant Portal.",
  path: "/merchant/onboarding",
  noIndex: true
});

export default function MerchantOnboardingPage() {
  return <RoleGate allowedRoles={["customer"]}><MerchantOnboarding /></RoleGate>;
}

