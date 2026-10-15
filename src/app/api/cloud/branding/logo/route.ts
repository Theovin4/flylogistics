import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { getCloudinary } from "@/lib/cloudinary";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { enforceRateLimit } from "@/server/api";
import { logApiError, requestContext } from "@/server/monitoring";
import { requireCloudFeature } from "@/server/tenancy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_LOGO_BYTES = 5_000_000;

function detectedFormat(bytes: Uint8Array) {
  if (bytes.length >= 8 && bytes.slice(0, 8).every((value, index) => value === [137, 80, 78, 71, 13, 10, 26, 10][index])) return "png";
  if (bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "jpg";
  if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") return "webp";
  return null;
}

async function authorize(request: Request) {
  const access = await requireCloudFeature(request, "basic_branding", ["owner", "admin"]);
  if (!access.profile || !access.tenant || access.error || !access.tenant.companyId) return { access, response: NextResponse.json({ error: access.error ?? "Company workspace is not configured." }, { status: access.status || 403 }) };
  return { access, response: null };
}

export async function POST(request: Request) {
  const limited = await enforceRateLimit(request, "cloud-brand-logo", { limit: 10, windowSeconds: 300 });
  if (limited) return limited;
  const authorized = await authorize(request);
  if (authorized.response) return authorized.response;
  const { access } = authorized;

  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "Choose a PNG, JPEG, or WebP logo." }, { status: 400 });
    if (file.size < 1 || file.size > MAX_LOGO_BYTES) return NextResponse.json({ error: "Logo must be 5 MB or less." }, { status: 400 });
    const bytes = new Uint8Array(await file.arrayBuffer());
    const format = detectedFormat(bytes);
    if (!format) return NextResponse.json({ error: "Logo content must be a valid PNG, JPEG, or WebP image." }, { status: 400 });

    const supabase = getSupabaseAdmin();
    if (!supabase) return NextResponse.json({ error: "Brand asset storage is temporarily unavailable." }, { status: 503 });
    const companyId = access.tenant!.companyId!;
    const oldPath = access.tenant!.company?.logo_storage_path ?? null;
    const publicId = `logo-${Date.now()}-${crypto.randomUUID()}`;
    const cloudinary = getCloudinary();
    const uploaded = await cloudinary.uploader.upload(`data:image/${format};base64,${Buffer.from(bytes).toString("base64")}`, {
      folder: `fly-logistics/company-media/${companyId}/logo`,
      public_id: publicId,
      resource_type: "image",
      overwrite: false,
      unique_filename: true,
      transformation: [{ width: 1200, height: 600, crop: "limit", quality: "auto:good", fetch_format: "auto" }]
    });

    const updated = await supabase.from("companies").update({
      logo_url: uploaded.secure_url,
      logo_storage_path: uploaded.public_id,
      branding_updated_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }).eq("id", companyId).select("id,name,slug,logo_url,logo_storage_path,brand_color,accent_color,public_address,public_phone,public_whatsapp,public_support_email,show_contact_on_tracking,branding_updated_at,plan").single();

    if (updated.error) {
      await cloudinary.uploader.destroy(uploaded.public_id).catch(() => undefined);
      throw updated.error;
    }
    if (oldPath && oldPath !== uploaded.public_id) await cloudinary.uploader.destroy(oldPath).catch(() => undefined);
    return NextResponse.json({ company: updated.data, logoUrl: uploaded.secure_url });
  } catch (error) {
    logApiError(error, "Cloud tenant logo upload failed.", requestContext(request, { companyId: access.tenant?.companyId }));
    return NextResponse.json({ error: "Unable to upload the company logo. Please try again." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const limited = await enforceRateLimit(request, "cloud-brand-logo-delete", { limit: 10, windowSeconds: 300 });
  if (limited) return limited;
  const authorized = await authorize(request);
  if (authorized.response) return authorized.response;
  const { access } = authorized;
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Brand asset storage is temporarily unavailable." }, { status: 503 });
  const oldPath = access.tenant!.company?.logo_storage_path ?? null;
  const updated = await supabase.from("companies").update({
    logo_url: null,
    logo_storage_path: null,
    branding_updated_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }).eq("id", access.tenant!.companyId!).select("id,name,slug,logo_url,logo_storage_path,brand_color,accent_color,public_address,public_phone,public_whatsapp,public_support_email,show_contact_on_tracking,branding_updated_at,plan").single();
  if (updated.error) return NextResponse.json({ error: "Unable to remove the company logo." }, { status: 500 });
  if (oldPath) await getCloudinary().uploader.destroy(oldPath).catch(() => undefined);
  return NextResponse.json({ company: updated.data });
}
