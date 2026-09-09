import { LegalPage } from "@/components/legal/legal-page";
import { getLegalPage } from "@/lib/legal";
import { createMetadata } from "@/lib/seo";

const page = getLegalPage("delivery");

export const metadata = createMetadata({
  title: "Delivery Policy - Fly Logistics",
  description: page.description,
  path: "/delivery-policy",
  keywords: ["delivery policy", "same-day delivery policy", "interstate delivery policy Nigeria"]
});

export default function DeliveryPolicyPage() {
  return <LegalPage page={page} />;
}
