import { getSupabaseAdmin } from "@/lib/supabase-server";
import { recordNotificationAttempt, type NotificationDeliveryResult, type NotificationRequest } from "@/server/notifications/shared";

type InAppNotificationInput = NotificationRequest & {
  userId?: string | null;
  title?: string | null;
  body?: string | null;
  category?: string | null;
};

export type InAppNotificationResult = NotificationDeliveryResult & {
  provider: "fly_in_app";
};

function titleFromWorkflow(workflow?: string | null) {
  return String(workflow ?? "Fly Logistics update")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function isMissingInAppTable(error: { code?: string; message?: string } | null | undefined) {
  return error?.code === "42P01" || error?.code === "42703" || error?.message?.includes("customer_notifications");
}

export async function sendInAppNotification(input: InAppNotificationInput): Promise<InAppNotificationResult> {
  const supabase = getSupabaseAdmin();
  let result: InAppNotificationResult;

  if (!supabase) {
    result = {
      ok: false,
      mode: "not_configured",
      provider: "fly_in_app",
      status: "NOT_CONFIGURED",
      reason: "Customer notification storage is not configured."
    };
  } else if (!input.userId) {
    result = {
      ok: false,
      mode: "failed",
      provider: "fly_in_app",
      status: "FAILED",
      reason: "A customer account is required for in-app notification delivery."
    };
  } else {
    const insert = await supabase
      .from("customer_notifications")
      .insert({
        user_id: input.userId,
        title: input.title ?? titleFromWorkflow(input.workflow),
        body: input.body ?? input.message,
        category: input.category ?? input.workflow ?? "account",
        entity_type: input.entityType ?? null,
        entity_id: input.entityId === undefined || input.entityId === null ? null : String(input.entityId)
      })
      .select("id")
      .single();

    if (insert.error) {
      result = {
        ok: false,
        mode: isMissingInAppTable(insert.error) ? "not_configured" : "failed",
        provider: "fly_in_app",
        status: isMissingInAppTable(insert.error) ? "NOT_CONFIGURED" : "FAILED",
        reason: isMissingInAppTable(insert.error) ? "Customer notification storage is not installed yet." : insert.error.message
      };
    } else {
      result = {
        ok: true,
        mode: "sent",
        provider: "fly_in_app",
        status: "DELIVERED",
        providerMessageId: String(insert.data.id),
        providerStatus: "stored"
      };
    }
  }

  await recordNotificationAttempt(
    "in_app",
    {
      ...input,
      to: input.userId,
      message: input.body ?? input.message,
      metadata: {
        ...(input.metadata ?? {}),
        title: input.title ?? titleFromWorkflow(input.workflow),
        customerNotificationId: result.providerMessageId
      }
    },
    result
  );
  return result;
}
