import { v2 as cloudinary } from "cloudinary";
import { cleanEnv } from "@/lib/env";

const allowedUploadFolders = [
  "fly-logistics/drivers",
  "fly-logistics/packages",
  "fly-logistics/proof-of-delivery",
  "fly-logistics/company-media"
] as const;

export type CloudinaryUploadFolder = (typeof allowedUploadFolders)[number];

export type UploadedAsset = {
  publicId: string;
  secureUrl: string;
  width?: number;
  height?: number;
  format?: string;
  bytes?: number;
};

export function getCloudinary() {
  const cloudName = cleanEnv(process.env.CLOUDINARY_CLOUD_NAME) ?? cleanEnv(process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME);
  const apiKey = cleanEnv(process.env.CLOUDINARY_API_KEY);
  const apiSecret = cleanEnv(process.env.CLOUDINARY_API_SECRET);

  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error("Cloudinary server credentials are not configured.");
  }

  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
    secure: true
  });

  return cloudinary;
}

export function isAllowedCloudinaryFolder(folder: string): folder is CloudinaryUploadFolder {
  return allowedUploadFolders.some((allowed) => folder === allowed || folder.startsWith(`${allowed}/`));
}

export function getCloudinaryCloudName() {
  return cleanEnv(process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME) ?? cleanEnv(process.env.CLOUDINARY_CLOUD_NAME) ?? "";
}
