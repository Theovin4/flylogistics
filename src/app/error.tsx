"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="grid min-h-[70vh] place-items-center px-4 py-10">
      <Card className="glass w-full max-w-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="size-5 text-primary" />
            We hit a route issue
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 text-sm text-muted-foreground">
          <p>Fly Logistics could not load this workspace cleanly. Try again, or return to tracking while the operations layer recovers.</p>
          {error.digest && <p className="font-mono text-xs">Error reference: {error.digest}</p>}
          <div className="flex flex-wrap gap-3">
            <Button type="button" onClick={reset}>
              <RotateCcw />
              Try again
            </Button>
            <Button asChild variant="outline">
              <Link href="/tracking">Track shipment</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
