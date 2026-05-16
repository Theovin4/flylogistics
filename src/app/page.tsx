import { Landing } from "@/components/sections/landing";
import { SiteFooter } from "@/components/brand/site-footer";
import { SiteHeader } from "@/components/brand/site-header";

export default function HomePage() {
  return (
    <>
      <SiteHeader />
      <main>
        <Landing />
      </main>
      <SiteFooter />
    </>
  );
}
