import { redirect } from "next/navigation";
import { createMetadata } from "@/lib/seo";

export const metadata = createMetadata({
  title: "Instant Quote - Fly Logistics",
  description: "Start a Fly Logistics quote request for delivery, warehousing, and business logistics services.",
  path: "/instant-quote",
  keywords: ["instant quote", "delivery quote", "logistics quote"]
});

export default function InstantQuotePage() {
  redirect("/quote");
}
