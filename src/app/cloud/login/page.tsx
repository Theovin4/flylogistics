import type { Metadata } from "next";
import { CloudAuthForm } from "@/components/cloud/cloud-auth-form";
import { createMetadata } from "@/lib/seo";

export const metadata: Metadata = createMetadata({
  title: "Fly Logistics Cloud Login",
  description: "Sign in to your Fly Logistics Cloud company workspace.",
  path: "/cloud/login",
  keywords: ["logistics software login", "delivery management login", "Fly Logistics Cloud login"]
});

export default function CloudLoginPage() {
  return <CloudAuthForm mode="login" />;
}
