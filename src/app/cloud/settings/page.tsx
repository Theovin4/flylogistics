import type { Metadata } from "next";
import { CloudDashboard } from "@/components/cloud/cloud-dashboard";
import { createMetadata } from "@/lib/seo";

export const metadata: Metadata = createMetadata({
  title: "Cloud Company Settings - Fly Logistics",
  description: "Manage your logistics company name, logo, brand color, support email, and support phone.",
  path: "/cloud/settings",
  noIndex: true
});

export default function CloudSettingsPage() {
  return <CloudDashboard section="settings" />;
}
