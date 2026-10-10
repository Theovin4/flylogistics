import type { Metadata } from "next";
import { MerchantGate } from "@/components/merchant/merchant-gate";
import { MerchantDashboard } from "@/components/merchant/merchant-dashboard";
import { createMetadata } from "@/lib/seo";

export const metadata: Metadata = createMetadata({
  title: "Business Shipments - Fly Logistics",
  description: "Protected shipment and quote workspace for Fly Logistics merchants.",
  path: "/merchant/shipments",
  noIndex: true
});

export default function MerchantShipmentsPage() {
  return (
    <MerchantGate>
      <MerchantDashboard initialSection="shipments" />
    </MerchantGate>
  );
}
