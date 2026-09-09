import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { createMetadata } from "@/lib/seo";

export const metadata = createMetadata({
  title: "Dispatcher Dashboard - Fly Logistics",
  description: "Protected dispatcher dashboard for Fly Logistics route and driver operations.",
  path: "/dashboard/dispatcher",
  noIndex: true
});

export default function Page() { return <DashboardShell role="dispatcher" />; }
