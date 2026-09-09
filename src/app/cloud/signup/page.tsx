import type { Metadata } from "next";
import { CloudAuthForm } from "@/components/cloud/cloud-auth-form";
import { createMetadata } from "@/lib/seo";

export const metadata: Metadata = createMetadata({
  title: "Create Fly Logistics Cloud Workspace",
  description: "Create a secure Fly Logistics Cloud workspace for your logistics company.",
  path: "/cloud/signup",
  keywords: ["create logistics software account", "logistics SaaS signup", "delivery management platform"]
});

export default function CloudSignupPage() {
  return <CloudAuthForm mode="signup" />;
}
