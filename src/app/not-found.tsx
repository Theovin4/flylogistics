import Link from "next/link";
import { MapPinned, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function NotFound() {
  return (
    <main className="grid min-h-[70vh] place-items-center px-4 py-10">
      <Card className="glass w-full max-w-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPinned className="size-5 text-primary" />
            Route not found
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 text-sm text-muted-foreground">
          <p>This Fly Logistics route is not available. You can return to tracking or request a new shipment quote.</p>
          <div className="flex flex-wrap gap-3">
            <Button asChild>
              <Link href="/tracking">
                <Search />
                Track shipment
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/quote">Get quote</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
