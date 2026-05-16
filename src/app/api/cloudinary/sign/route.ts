import { NextResponse } from "next/server";
import { z } from "zod";
import { getCloudinary, isAllowedCloudinaryFolder } from "@/lib/cloudinary";

const signRequestSchema = z.object({
  paramsToSign: z.record(z.union([z.string(), z.number(), z.boolean()]))
});

export async function POST(request: Request) {
  const parsed = signRequestSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid Cloudinary signature request." }, { status: 400 });
  }

  const folder = String(parsed.data.paramsToSign.folder ?? "");
  if (!isAllowedCloudinaryFolder(folder)) {
    return NextResponse.json({ error: "Upload folder is not allowed." }, { status: 403 });
  }

  try {
    const cloudinary = getCloudinary();
    const signature = cloudinary.utils.api_sign_request(parsed.data.paramsToSign, process.env.CLOUDINARY_API_SECRET!);
    return NextResponse.json({ signature });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Cloudinary is not configured." }, { status: 500 });
  }
}
