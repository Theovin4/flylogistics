import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MerchantGate } from "@/components/merchant/merchant-gate";
import { MerchantDashboard, type MerchantSection } from "@/components/merchant/merchant-dashboard";
import { createMetadata } from "@/lib/seo";

const routeSections: Record<string, MerchantSection> = {
  shipments: "shipments",
  recipients: "recipients",
  wallet: "wallet",
  invoices: "invoices",
  analytics: "analytics",
  team: "team",
  support: "support",
  settings: "security"
};

export const metadata: Metadata = createMetadata({
  title: "Merchant Workspace - Fly Logistics",
  description: "Protected Fly Logistics merchant workspace.",
  path: "/merchant/dashboard",
  noIndex: true
});

export default async function MerchantSectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  const initialSection = routeSections[section];
  if (!initialSection) notFound();
  return (
    <MerchantGate>
      <MerchantDashboard initialSection={initialSection} />
    </MerchantGate>
  );
}
