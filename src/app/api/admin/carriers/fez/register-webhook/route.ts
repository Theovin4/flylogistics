import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/request-auth";
import { parseJson } from "@/server/api";
import { redactedFezWebhookUrl, registerFezWebhook } from "@/server/fez-webhooks";
import { logApiError, requestContext } from "@/server/monitoring";

export const dynamic = "force-dynamic";

const registerFezWebhookSchema = z.object({
  webhookUrl: z.string().trim().url().optional()
});

export async function POST(request: Request) {
  const access = await requireRole(request, ["admin"]);
  if (!access.profile) return NextResponse.json({ error: access.error }, { status: access.status });
  if (access.error) return NextResponse.json({ error: access.error }, { status: access.status });

  const parsed = await parseJson(request, registerFezWebhookSchema, "Invalid FEZ webhook registration request.");
  if (parsed.response) return parsed.response;

  try {
    const result = await registerFezWebhook(parsed.data.webhookUrl);
    if (!result.ok) {
      return NextResponse.json({ error: result.error, webhookUrl: redactedFezWebhookUrl(result.webhookUrl) }, { status: result.status && result.status >= 400 ? 502 : 409 });
    }
    return NextResponse.json({ ok: true, webhookUrl: redactedFezWebhookUrl(result.webhookUrl) });
  } catch (error) {
    logApiError(error, "Unable to register FEZ webhook.", requestContext(request));
    return NextResponse.json({ error: "Unable to register FEZ webhook." }, { status: 500 });
  }
}
