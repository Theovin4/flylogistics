"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";

const AdminOperationsMapView = dynamic(() => import("./admin-operations-map-view"), {
  ssr: false,
  loading: () => <Skeleton className="mt-8 h-[520px] w-full" />
});

export function AdminOperationsMap() {
  return <AdminOperationsMapView />;
}
