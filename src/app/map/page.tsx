"use client";

import dynamic from "next/dynamic";
import { SiteHeader } from "@/components/brand/site-header";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

const MapView = dynamic(() => import("./MapView"), {
  ssr: false,
  loading: () => <Skeleton className="h-[68vh] min-h-[520px] w-full" />
});

export default function MapPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <Badge className="border-primary/40 bg-primary/10 text-primary">Fleet command</Badge>
        <div className="mt-4 flex flex-col gap-3 pb-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-4xl font-black tracking-normal">Live driver map</h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Dynamic Supabase drivers, realtime updates, premium status cards, and OpenStreetMap visibility.
            </p>
          </div>
        </div>
        <MapView />
      </main>
    </>
  );
}
