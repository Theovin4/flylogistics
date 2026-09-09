import { redirect } from "next/navigation";
import { createMetadata } from "@/lib/seo";

export const metadata = createMetadata({
  title: "Create Customer Account - Fly Logistics",
  description: "Create a Fly Logistics customer account to book shipments, fund wallet, pay securely, track deliveries, and manage support.",
  path: "/register",
  keywords: ["create customer delivery account", "book shipment account", "Fly Logistics customer registration"]
});

export default function RegisterPage() {
  redirect("/customer/register");
}
