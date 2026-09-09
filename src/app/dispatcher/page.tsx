import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { createMetadata } from "@/lib/seo";

export const metadata = createMetadata({
  title: "Dispatcher Portal - Fly Logistics",
  description: "Protected Fly Logistics dispatcher portal for shipment coordination, route monitoring, and live fleet operations.",
  path: "/dispatcher",
  noIndex: true
});

export default function DispatcherPortalPage() {
  return <DashboardShell role="dispatcher" />;
}
