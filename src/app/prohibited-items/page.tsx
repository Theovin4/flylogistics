import { LegalPage } from "@/components/legal/legal-page";
import { getLegalPage } from "@/lib/legal";
import { createMetadata } from "@/lib/seo";

const page = getLegalPage("prohibited");

export const metadata = createMetadata({
  title: "Prohibited Items Policy - Fly Logistics",
  description: page.description,
  path: "/prohibited-items",
  keywords: ["prohibited items delivery", "restricted items logistics", "items not allowed for delivery"]
});

export default function ProhibitedItemsPage() {
  return <LegalPage page={page} />;
}
