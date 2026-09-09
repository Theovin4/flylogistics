import { redirect } from "next/navigation";
import { createMetadata } from "@/lib/seo";

export const metadata = createMetadata({
  title: "Login - Fly Logistics",
  description: "Sign in to Fly Logistics admin, driver, dispatcher, or customer workspaces.",
  path: "/auth/login",
  noIndex: true
});

export default function Page() {
  redirect("/login");
}
