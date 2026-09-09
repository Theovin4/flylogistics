import { PublicPage } from "@/components/sections/public-page";
import { getPublicPage } from "@/lib/site";
import { publicPageMetadata } from "@/lib/seo";

const page = getPublicPage("international-shipping-from-nigeria");

export const metadata = publicPageMetadata(page);

export default function Page() {
  return <PublicPage page={page} />;
}
