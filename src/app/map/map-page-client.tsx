"use client";

import dynamic from "next/dynamic";
import { SiteHeader } from "@/components/brand/site-header";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

const MapView = dynamic(() => import("./MapView"), {
  ssr: false,
  loading: () => <Skeleton className="h-[56vh] min-h-[360px] w-full sm:h-[64vh] sm:min-h-[460px]" />
});

export function MapPageClient() {
  return (
    <>
      <SiteHeader />
      <main id="main-content" className="mx-auto max-w-7xl px-4 py-5 sm:px-6 sm:py-8 lg:px-8">
        <Badge className="border-primary/40 bg-primary/10 text-primary">Live coverage</Badge>
        <div className="mt-4 flex flex-col gap-3 pb-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-3xl font-black tracking-normal sm:text-4xl">Live rider map</h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              See active Fly Logistics riders currently available across the delivery network.
            </p>
          </div>
        </div>
        <MapView />
      </main>
    </>
  );
}
