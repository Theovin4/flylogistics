import { LegalPage } from "@/components/legal/legal-page";
import { getLegalPage } from "@/lib/legal";
import { createMetadata } from "@/lib/seo";

const page = getLegalPage("privacy");

export const metadata = createMetadata({
  title: "Privacy Policy - Fly Logistics",
  description: page.description,
  path: "/privacy",
  keywords: ["Fly Logistics privacy", "logistics privacy policy", "delivery data privacy"]
});

export default function PrivacyPage() {
  return <LegalPage page={page} />;
}
