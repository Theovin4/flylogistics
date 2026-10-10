import type { Metadata } from "next";
import { MerchantGate } from "@/components/merchant/merchant-gate";
import { MerchantDashboard } from "@/components/merchant/merchant-dashboard";
import { createMetadata } from "@/lib/seo";

export const metadata: Metadata = createMetadata({
  title: "Merchant Dashboard - Fly Logistics",
  description: "Protected Fly Logistics merchant workspace for business shipment management, wallet payments, invoices, team access, and analytics.",
  path: "/merchant/dashboard",
  noIndex: true
});

export default function MerchantDashboardPage() {
  return (
    <MerchantGate>
      <MerchantDashboard />
    </MerchantGate>
  );
}
