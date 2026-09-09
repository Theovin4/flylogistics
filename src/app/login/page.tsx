import { redirect } from "next/navigation";
import { createMetadata } from "@/lib/seo";

export const metadata = createMetadata({
  title: "Customer Login - Fly Logistics",
  description: "Sign in to the Fly Logistics customer portal to book shipments, manage payments, track deliveries, and contact support.",
  path: "/login",
  keywords: ["Fly Logistics customer login", "shipment tracking account", "delivery account login"]
});

export default function LoginPage() {
  redirect("/customer/login");
}
