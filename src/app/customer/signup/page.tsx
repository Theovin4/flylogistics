import { redirect } from "next/navigation";
import type { Route } from "next";
import { createMetadata } from "@/lib/seo";

export const metadata = createMetadata({
  title: "Create Customer Account - Fly Logistics",
  description: "Create a Fly Logistics customer account for booking visibility, shipment history, invoices, saved addresses, support, and notifications.",
  path: "/customer/signup",
  noIndex: true
});

export default function CustomerSignupPage() {
  redirect("/customer/register" as Route);
}
