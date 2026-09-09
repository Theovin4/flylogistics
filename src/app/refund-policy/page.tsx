import { LegalPage } from "@/components/legal/legal-page";
import { getLegalPage } from "@/lib/legal";
import { createMetadata } from "@/lib/seo";

const page = getLegalPage("refund");

export const metadata = createMetadata({
  title: "Refund Policy - Fly Logistics",
  description: page.description,
  path: "/refund-policy",
  keywords: ["refund policy", "delivery refund", "shipment cancellation"]
});

export default function RefundPolicyPage() {
  return <LegalPage page={page} />;
}
