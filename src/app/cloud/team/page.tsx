import type { Metadata } from "next";
import { CloudDashboard } from "@/components/cloud/cloud-dashboard";
import { createMetadata } from "@/lib/seo";

export const metadata: Metadata = createMetadata({
  title: "Cloud Team - Fly Logistics",
  description: "Manage company workspace roles and team access.",
  path: "/cloud/team",
  noIndex: true
});

export default function CloudTeamPage() {
  return <CloudDashboard section="team" />;
}
