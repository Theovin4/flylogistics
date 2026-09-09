import { LegalPage } from "@/components/legal/legal-page";
import { getLegalPage } from "@/lib/legal";
import { createMetadata } from "@/lib/seo";

const page = getLegalPage("deletion");

export const metadata = createMetadata({
  title: "User Data Deletion Instructions - Fly Logistics",
  description: page.description,
  path: "/data-deletion",
  keywords: ["Fly Logistics data deletion", "delete Fly Logistics account", "privacy request"]
});

export default function DataDeletionPage() {
  return <LegalPage page={page} />;
}
