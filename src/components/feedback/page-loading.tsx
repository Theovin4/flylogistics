import { Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function PageLoading({ label = "Loading secure workspace..." }: { label?: string }) {
  return (
    <main className="min-h-[70vh] px-4 py-10">
      <div className="mx-auto grid w-full max-w-6xl gap-4">
        <Card className="glass">
          <CardContent className="grid gap-5 p-6">
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              {label}
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <Skeleton className="h-28 rounded-md" />
              <Skeleton className="h-28 rounded-md" />
              <Skeleton className="h-28 rounded-md" />
            </div>
            <Skeleton className="h-64 rounded-md" />
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
