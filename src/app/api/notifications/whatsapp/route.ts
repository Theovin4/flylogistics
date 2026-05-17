import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/request-auth";
import { sendWhatsAppNotification } from "@/server/notifications/whatsapp";

const whatsappNotificationSchema = z.object({
  to: z.string().trim().optional(),
  message: z.string().trim().min(1).max(2000),
  metadata: z.record(z.unknown()).optional()
});

export async function POST(request: Request) {
  const access = await requireRole(request, ["admin", "dispatcher"]);
  if (!access.profile) return NextResponse.json({ error: access.error }, { status: access.status });
  if (access.error) return NextResponse.json({ error: access.error }, { status: access.status });

  const parsed = whatsappNotificationSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "A recipient and WhatsApp message are required." }, { status: 400 });
  }

  const result = await sendWhatsAppNotification(parsed.data);
  return NextResponse.json(result, { status: result.ok ? 200 : 202 });
}
