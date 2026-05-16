import { PublicPage } from "@/components/sections/public-page";
import { publicPages } from "@/lib/site";
export default function Page() { return <PublicPage page={publicPages.find((p) => p.slug === "ai-logistics")!} />; }
