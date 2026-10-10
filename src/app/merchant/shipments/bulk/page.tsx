import type { Metadata } from "next";
import { MerchantGate } from "@/components/merchant/merchant-gate";
import { MerchantDashboard } from "@/components/merchant/merchant-dashboard";
import { createMetadata } from "@/lib/seo";

export const metadata: Metadata = createMetadata({
  title: "Bulk Shipment Upload - Fly Logistics",
  description: "Protected bulk shipment preparation workspace for Fly Logistics merchants.",
  path: "/merchant/shipments/bulk",
  noIndex: true
});

export default function MerchantBulkShipmentsPage() {
  return (
    <MerchantGate>
      <MerchantDashboard initialSection="bulk" />
    </MerchantGate>
  );
}
