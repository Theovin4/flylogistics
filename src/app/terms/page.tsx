import { LegalPage } from "@/components/legal/legal-page";
import { getLegalPage } from "@/lib/legal";
import { createMetadata } from "@/lib/seo";

const page = getLegalPage("terms");

export const metadata = createMetadata({
  title: "Terms & Conditions - Fly Logistics",
  description: page.description,
  path: "/terms",
  keywords: ["Fly Logistics terms", "delivery terms", "logistics terms Nigeria"]
});

export default function TermsPage() {
  return <LegalPage page={page} />;
}
