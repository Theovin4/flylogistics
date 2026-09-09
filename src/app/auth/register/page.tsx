import { redirect } from "next/navigation";
import type { Route } from "next";
import { createMetadata } from "@/lib/seo";

export const metadata = createMetadata({
  title: "Register - Fly Logistics",
  description: "Create a Fly Logistics customer, driver, dispatcher, or admin workspace account.",
  path: "/auth/register",
  noIndex: true
});

export default function Page() {
  redirect("/register" as Route);
}
