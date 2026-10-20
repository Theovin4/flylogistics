import { redirect } from "next/navigation";
import { createMetadata } from "@/lib/seo";

export const metadata = createMetadata({
  title: "Dashboard - Fly Logistics",
  description: "Protected Fly Logistics operations dashboard.",
  path: "/dashboard",
  noIndex: true
});

export default function DashboardIndexPage() {
  redirect("/admin/dashboard");
}
