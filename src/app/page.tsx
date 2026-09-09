import { createMetadata } from "@/lib/seo";
import { Landing } from "@/components/sections/landing";
import { SiteFooter } from "@/components/brand/site-footer";
import { SiteHeader } from "@/components/brand/site-header";

export const metadata = createMetadata({
  title: "Fly Logistics - Global Shipping, Nigeria Delivery, Freight, and Tracking",
  description: "Book local Nigeria delivery, international import and export shipping, interstate freight, business logistics, warehouse services, and live shipment tracking with Fly Logistics.",
  path: "/",
  keywords: ["global shipping company", "worldwide logistics company", "international delivery Nigeria", "import shipping Nigeria", "export shipping Nigeria", "Nigeria logistics company", "Lagos delivery service", "same-day delivery", "interstate delivery", "business logistics", "warehouse services", "freight management"]
});

export default function HomePage() {
  return (
    <>
      <SiteHeader />
      <main id="main-content">
        <Landing />
      </main>
      <SiteFooter />
    </>
  );
}
