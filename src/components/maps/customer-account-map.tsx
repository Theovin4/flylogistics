"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";
import type { ShipmentRecord } from "@/lib/shipments";

const CustomerAccountMapView = dynamic(() => import("./customer-account-map-view"), {
  ssr: false,
  loading: () => <Skeleton className="h-[420px] w-full" />
});

export function CustomerAccountMap({ shipments }: { shipments: ShipmentRecord[] }) {
  return <CustomerAccountMapView shipments={shipments} />;
}
