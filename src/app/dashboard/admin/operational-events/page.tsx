import { AdminOperationalEventsViewer } from "@/components/admin/admin-operational-events-viewer";
import { createMetadata } from "@/lib/seo";

export const metadata = createMetadata({
  title: "Operational Events - Fly Logistics Admin",
  description: "Admin-only Fly Logistics operational events viewer for production workflow monitoring.",
  path: "/dashboard/admin/operational-events",
  noIndex: true
});

export default function AdminOperationalEventsPage() {
  return <AdminOperationalEventsViewer />;
}
