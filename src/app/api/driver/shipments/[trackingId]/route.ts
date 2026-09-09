import { NextResponse } from "next/server";
import { z } from "zod";
import { normalizeShipmentStatus, shipmentCustomerMessage } from "@/lib/shipments";
import {
  appendTimelineEvent,
  fetchShipmentByTracking,
  makeTimelineEvent,
  shipmentWithDriverSelect
} from "@/lib/shipment-data";
import { whatsappMessages } from "@/lib/whatsapp";
import { requireRole } from "@/lib/request-auth";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { enforceRateLimit, parseJson } from "@/server/api";
import { writeAuditLog } from "@/server/audit";
import { logShipmentWorkflowError, requestContext } from "@/server/monitoring";
import { getCustomerNotificationPreferences } from "@/server/notifications/preferences";
import { sendCustomerNotification, smsMessages } from "@/server/notifications/service";
import { writeOperationalEvent } from "@/server/operational-events";

const assignmentSchema = z.object({
  action: z.enum(["accept", "reject"]),
  reason: z.string().trim().max(500).optional()
});

export async function PATCH(request: Request, { params }: { params: Promise<{ trackingId: string }> }) {
  const limited = await enforceRateLimit(request, "driver-shipment-assignment", { limit: 80, windowSeconds: 60 });
  if (limited) return limited;

  const { trackingId } = await params;
  const access = await requireRole(request, ["driver"]);
  if (!access.profile) return NextResponse.json({ error: access.error }, { status: access.status });
  if (access.error) return NextResponse.json({ error: access.error }, { status: access.status });
  if (!access.profile.driver_id) return NextResponse.json({ error: "Driver account is not linked to a driver record." }, { status: 403 });

  const parsed = await parseJson(request, assignmentSchema, "Choose accept or reject for this assignment.");
  if (parsed.response) return parsed.response;

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Driver shipment updates are temporarily unavailable." }, { status: 503 });

  const current = await fetchShipmentByTracking(supabase, trackingId);
  if (current.error) {
    logShipmentWorkflowError(current.error, "Unable to load assigned shipment.", requestContext(request, { trackingId }));
    return NextResponse.json({ error: "Unable to load shipment." }, { status: 500 });
  }
  if (!current.data) return NextResponse.json({ error: "Shipment not found." }, { status: 404 });
  if (String(current.data.driver_id ?? "") !== String(access.profile.driver_id)) {
    return NextResponse.json({ error: "This shipment is not assigned to your driver account." }, { status: 403 });
  }
  const assignedDriverApproval = current.data.assigned_driver?.approval_status;
  if (assignedDriverApproval !== undefined && assignedDriverApproval !== null && assignedDriverApproval !== "approved") {
    return NextResponse.json({ error: "Driver account must be approved before responding to assignments." }, { status: 403 });
  }

  const currentStatus = normalizeShipmentStatus(current.data.status);
  if (currentStatus === "DELIVERED" || currentStatus === "CANCELLED") {
    return NextResponse.json({ error: "Completed or cancelled shipments cannot be changed by the driver." }, { status: 409 });
  }

  const driverName = current.data.assigned_driver?.name ?? access.profile.full_name ?? "Driver";
  const now = new Date().toISOString();
  const rejectingAfterPickup = parsed.data.action === "reject" && !["PENDING", "CONFIRMED", "DRIVER_ASSIGNED"].includes(currentStatus);
  if (rejectingAfterPickup) {
    return NextResponse.json({ error: "Rejecting is only available before pickup. Contact dispatch for help." }, { status: 409 });
  }

  const timeline =
    parsed.data.action === "accept"
      ? appendTimelineEvent(current.data.timeline, makeTimelineEvent("Driver accepted assignment", current.data.pickup_address))
      : appendTimelineEvent(current.data.timeline, makeTimelineEvent("Driver rejected assignment", current.data.pickup_address));

  const nextInternalNotes =
    parsed.data.action === "reject"
      ? `${current.data.internal_notes ? `${current.data.internal_notes}\n\n` : ""}${driverName} rejected assignment${parsed.data.reason ? `: ${parsed.data.reason}` : "."}`
      : current.data.internal_notes;

  const updates =
    parsed.data.action === "accept"
      ? {
          status: "DRIVER_ASSIGNED",
          customer_status_message: shipmentCustomerMessage("DRIVER_ASSIGNED"),
          timeline,
          updated_at: now
        }
      : {
          status: "CONFIRMED",
          driver_id: null,
          customer_status_message: "Your shipment is confirmed and dispatch is assigning another driver.",
          internal_notes: nextInternalNotes,
          timeline,
          updated_at: now
        };

  const { data, error } = await supabase
    .from("shipments")
    .update(updates)
    .eq("tracking_id", current.data.tracking_id)
    .select(shipmentWithDriverSelect)
    .single();

  if (error) {
    logShipmentWorkflowError(error, "Unable to update driver assignment response.", requestContext(request, { trackingId }));
    return NextResponse.json({ error: "Unable to update assignment." }, { status: 500 });
  }

  let customerNotification: { ok: boolean; provider: string; mode: string } | null = null;
  if (current.data.customer_phone || current.data.customer_email) {
    try {
      const message =
        parsed.data.action === "accept"
          ? whatsappMessages.driverAssigned(data)
          : whatsappMessages.deliveryUpdate(data);
      const result = await sendCustomerNotification({
        to: current.data.customer_phone,
        message,
        workflow: parsed.data.action === "accept" ? "driver_assignment_accepted" : "driver_assignment_rejected",
        entityType: "shipment",
        entityId: current.data.tracking_id,
        metadata: { trackingId: current.data.tracking_id, driverId: access.profile.driver_id, action: parsed.data.action },
        preferences: await getCustomerNotificationPreferences(supabase, current.data.customer_email),
        smsFallback: parsed.data.action === "reject",
        smsMessage: parsed.data.action === "reject"
          ? smsMessages.criticalShipmentAlert(current.data.tracking_id, "Driver assignment needs dispatch attention")
          : undefined
      });
      customerNotification = {
        ok: result.ok,
        provider: result.results.whatsapp?.provider ?? result.results.sms?.provider ?? "multi_channel",
        mode: result.results.whatsapp?.mode ?? result.results.sms?.mode ?? "failed"
      };
    } catch (notificationError) {
      logShipmentWorkflowError(notificationError, "Unable to prepare driver assignment notification.", requestContext(request, { trackingId }));
    }
  }

  await writeAuditLog(supabase, {
    actor: access.profile,
    action: `shipment.assignment_${parsed.data.action}`,
    entityType: "shipment",
    entityId: current.data.tracking_id,
    metadata: { driverId: access.profile.driver_id, reason: parsed.data.reason, customerNotification },
    request
  });

  await writeOperationalEvent(supabase, {
    category: "shipment",
    severity: parsed.data.action === "reject" ? "warning" : "info",
    message: parsed.data.action === "accept" ? "Driver accepted shipment assignment." : "Driver rejected shipment assignment.",
    entityType: "shipment",
    entityId: current.data.tracking_id,
    metadata: { driverId: access.profile.driver_id, reason: parsed.data.reason, customerNotification },
    request
  });

  return NextResponse.json(data);
}
