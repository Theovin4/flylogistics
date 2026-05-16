import { SiteFooter } from "@/components/brand/site-footer";
import { SiteHeader } from "@/components/brand/site-header";
import { Badge } from "@/components/ui/badge";
import { MediaUploadPanel } from "@/components/cloudinary/media-upload-panel";
import { TrackingLookup } from "@/components/shipments/tracking-lookup";

export default function TrackingPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <Badge className="border-primary/40 bg-primary/10 text-primary">Real-time tracking</Badge>
        <section className="mt-6">
          <TrackingLookup />
        </section>
        <section className="mt-8">
          <MediaUploadPanel />
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
