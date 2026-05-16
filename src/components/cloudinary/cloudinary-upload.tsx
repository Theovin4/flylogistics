"use client";

import { useState } from "react";
import { CldUploadWidget, type CloudinaryUploadWidgetResults } from "next-cloudinary";
import { ImagePlus, Loader2, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { CloudinaryUploadFolder, UploadedAsset } from "@/lib/cloudinary";

type CloudinaryInfo = {
  public_id?: string;
  secure_url?: string;
  width?: number;
  height?: number;
  format?: string;
  bytes?: number;
};

function getUploadedAsset(results: CloudinaryUploadWidgetResults): UploadedAsset | null {
  if (typeof results.info !== "object" || results.info === null) return null;
  const info = results.info as CloudinaryInfo;
  if (!info.secure_url || !info.public_id) return null;
  return {
    publicId: info.public_id,
    secureUrl: info.secure_url,
    width: info.width,
    height: info.height,
    format: info.format,
    bytes: info.bytes
  };
}

type CloudinaryUploadProps = {
  folder: CloudinaryUploadFolder;
  label: string;
  description?: string;
  variant?: "button" | "panel";
  onUploaded?: (asset: UploadedAsset) => Promise<void> | void;
};

export function CloudinaryUpload({ folder, label, description, variant = "button", onUploaded }: CloudinaryUploadProps) {
  const [state, setState] = useState<"idle" | "saving" | "success" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;

  if (!cloudName) {
    return (
      <div className={variant === "panel" ? "rounded-md border bg-background/45 p-4" : ""}>
        {variant === "panel" && (
          <div className="mb-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="font-semibold">{label}</h3>
                {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
              </div>
              <Badge className="border-primary/40 bg-primary/10 text-primary">Cloudinary</Badge>
            </div>
          </div>
        )}
        <Button type="button" variant="outline" disabled>
          <ImagePlus />
          Configure Cloudinary
        </Button>
        <p className="mt-2 text-xs text-muted-foreground">Set NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME to enable uploads.</p>
      </div>
    );
  }

  return (
    <CldUploadWidget
      signatureEndpoint="/api/cloudinary/sign"
      options={{
        folder,
        multiple: false,
        maxFileSize: 5_000_000,
        resourceType: "image",
        clientAllowedFormats: ["jpg", "jpeg", "png", "webp"],
        sources: ["local", "camera", "url"],
        styles: {
          palette: {
            window: "#090b12",
            sourceBg: "#111827",
            windowBorder: "#ff9f1c",
            tabIcon: "#ff9f1c",
            inactiveTabIcon: "#9ca3af",
            menuIcons: "#ff9f1c",
            link: "#ff9f1c",
            action: "#ff9f1c",
            inProgress: "#ff9f1c",
            complete: "#10b981",
            error: "#ef4444",
            textDark: "#f9fafb",
            textLight: "#111827"
          }
        }
      }}
      onSuccess={async (results) => {
        const asset = getUploadedAsset(results);
        if (!asset) {
          setState("error");
          setMessage("Cloudinary upload finished without an image URL.");
          return;
        }
        setState("saving");
        setMessage("Saving media URL...");
        try {
          await onUploaded?.(asset);
          setState("success");
          setMessage("Upload saved.");
        } catch (error) {
          console.error(error);
          setState("error");
          setMessage(error instanceof Error ? error.message : "Upload succeeded, but saving failed.");
        }
      }}
      onError={(error) => {
        console.error(error);
        setState("error");
        setMessage("Cloudinary upload failed. Try a JPG, PNG, or WebP under 5 MB.");
      }}
    >
      {({ open, isLoading }) => {
        const busy = isLoading || state === "saving";
        return (
          <div className={variant === "panel" ? "rounded-md border bg-background/45 p-4" : ""}>
            {variant === "panel" && (
              <div className="mb-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="font-semibold">{label}</h3>
                    {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
                  </div>
                  <Badge className="border-primary/40 bg-primary/10 text-primary">Cloudinary</Badge>
                </div>
              </div>
            )}
            <Button type="button" variant={variant === "panel" ? "default" : "outline"} onClick={() => open()} disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : variant === "panel" ? <UploadCloud /> : <ImagePlus />}
              {busy ? "Uploading" : label}
            </Button>
            {message && (
              <p className={`mt-2 text-xs ${state === "error" ? "text-destructive" : state === "success" ? "text-emerald-500" : "text-muted-foreground"}`}>
                {message}
              </p>
            )}
          </div>
        );
      }}
    </CldUploadWidget>
  );
}
