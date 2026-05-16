"use client";

import { useState } from "react";
import Image from "next/image";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CloudinaryUpload } from "@/components/cloudinary/cloudinary-upload";
import type { UploadedAsset } from "@/lib/cloudinary";

export function MediaUploadPanel() {
  const [assets, setAssets] = useState<UploadedAsset[]>([]);

  return (
    <Card className="glass">
      <CardHeader>
        <CardTitle>Package and proof media</CardTitle>
        <p className="text-sm text-muted-foreground">
          Foundation for package photos and proof-of-delivery images. Uploads are signed server-side and ready to attach to shipment records.
        </p>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <CloudinaryUpload
            variant="panel"
            folder="fly-logistics/packages"
            label="Upload package photo"
            description="Cargo condition, packaging, and pickup evidence."
            onUploaded={(asset) => setAssets((current) => [asset, ...current])}
          />
          <CloudinaryUpload
            variant="panel"
            folder="fly-logistics/proof-of-delivery"
            label="Upload delivery proof"
            description="Recipient proof, drop-off photo, and exception evidence."
            onUploaded={(asset) => setAssets((current) => [asset, ...current])}
          />
        </div>
        {assets.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-3">
            {assets.map((asset) => (
              <div key={asset.publicId} className="overflow-hidden rounded-md border bg-background/45">
                <Image src={asset.secureUrl} alt="Uploaded logistics media" width={360} height={240} className="h-32 w-full object-cover" />
                <div className="truncate p-2 font-mono text-[11px] text-muted-foreground">{asset.publicId}</div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
