import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/request-auth";
import { getCloudinary, isAllowedCloudinaryFolder } from "@/lib/cloudinary";
import { cleanEnv } from "@/lib/env";
import { enforceRateLimit, parseJson } from "@/server/api";
import { logApiError, requestContext } from "@/server/monitoring";

const signRequestSchema = z.object({
  paramsToSign: z.record(z.union([z.string(), z.number(), z.boolean()]))
});

const allowedSignatureParams = new Set([
  "folder",
  "timestamp",
  "public_id",
  "tags",
  "context",
  "upload_preset",
  "source",
  "resource_type",
  "resourceType",
  "max_file_size",
  "allowed_formats",
  "client_allowed_formats",
  "unique_filename",
  "use_filename"
]);

export async function POST(request: Request) {
  const limited = await enforceRateLimit(request, "cloudinary-sign", { limit: 30, windowSeconds: 60 });
  if (limited) return limited;

  const access = await requireRole(request, ["admin", "dispatcher", "driver", "customer"]);
  if (!access.profile) return NextResponse.json({ error: access.error }, { status: access.status });
  if (access.error) return NextResponse.json({ error: access.error }, { status: access.status });

  const parsed = await parseJson(request, signRequestSchema, "Invalid upload request.");
  if (parsed.response) return parsed.response;

  const disallowedParams = Object.keys(parsed.data.paramsToSign).filter((key) => !allowedSignatureParams.has(key));
  if (disallowedParams.length > 0) {
    return NextResponse.json({ error: "Upload request contains unsupported signing parameters." }, { status: 400 });
  }

  const folder = String(parsed.data.paramsToSign.folder ?? "");
  if (!isAllowedCloudinaryFolder(folder)) {
    return NextResponse.json({ error: "Upload folder is not allowed." }, { status: 403 });
  }

  const isInternationalDocument = folder.startsWith("fly-logistics/packages/international-documents");
  const resourceType = String(parsed.data.paramsToSign.resource_type ?? parsed.data.paramsToSign.resourceType ?? "image");
  if (resourceType !== "image" && !(isInternationalDocument && resourceType === "raw")) {
    return NextResponse.json({ error: "This upload type is not allowed." }, { status: 400 });
  }

  const maxFileSize = Number(parsed.data.paramsToSign.max_file_size ?? 0);
  const sizeLimit = isInternationalDocument ? 10_000_000 : 5_000_000;
  if (Number.isFinite(maxFileSize) && maxFileSize > sizeLimit) {
    return NextResponse.json({ error: isInternationalDocument ? "Shipment documents must be 10 MB or less." : "Image uploads must be 5 MB or less." }, { status: 400 });
  }

  try {
    const cloudinary = getCloudinary();
    const apiSecret = cleanEnv(process.env.CLOUDINARY_API_SECRET);
    if (!apiSecret) throw new Error("Cloudinary API secret is not configured.");
    const signature = cloudinary.utils.api_sign_request(parsed.data.paramsToSign, apiSecret);
    return NextResponse.json({ signature });
  } catch (error) {
    logApiError(error, "Cloudinary signature generation failed.", requestContext(request, { folder }));
    return NextResponse.json({ error: "Secure upload is temporarily unavailable." }, { status: 500 });
  }
}
