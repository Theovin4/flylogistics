import { NextResponse } from "next/server";
import { z } from "zod";
import { shipmentCustomerMessage } from "@/lib/shipments";
import { appendStatusProgressionEvents, fetchShipmentByTracking, shipmentWithDriverSelect } from "@/lib/shipment-data";
import { whatsappMessages } from "@/lib/whatsapp";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { parseJson } from "@/server/api";
import { writeAuditLog } from "@/server/audit";
import { logShipmentWorkflowError, requestContext } from "@/server/monitoring";
import { sendCustomerNotification } from "@/server/notifications/service";
import { getCustomerNotificationPreferences } from "@/server/notifications/preferences";
import { writeOperationalEvent } from "@/server/operational-events";
import { sendShipmentLifecycleEmail } from "@/server/shipment-emails";
import { isShipmentDriver, requireCloudFeature } from "@/server/tenancy";

const proofSchema = z.object({
  proofImageUrl: z.string().url(),
  deliveryOtp: z.string().trim().max(32).optional().nullable(),
  recipientName: z.string().trim().max(160).optional().nullable(),
  recipientSignatureUrl: z.string().url().optional().or(z.literal("")),
  proofLat: z.coerce.number().min(-90).max(90).optional(),
  proofLng: z.coerce.number().min(-180).max(180).optional(),
  capturedAt: z.string().datetime().optional()
});

const optionalProofColumns = new Set([
  "delivery_otp",
  "delivery_otp_verified_at",
  "recipient_name",
  "recipient_signature_url",
  "proof_lat",
  "proof_lng",
  "proof_uploaded_at"
]);

function missingColumnFromPostgrest(error: { code?: string; message?: string } | null | undefined) {
  if (!error?.message) return null;
  const postgrestMatch = error.message.match(/'([^']+)' column/i);
  if (postgrestMatch?.[1]) return postgrestMatch[1];
  const postgresMatch = error.message.match(/column\s+(?:\w+\.)?"?([a-zA-Z_][\w]*)"?\s+does not exist/i);
  return postgresMatch?.[1] ?? null;
}

async function updateShipmentProofWithSchemaFallback(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  trackingId: string,
  payload: Record<string, unknown>
) {
  const nextPayload = { ...payload };
  const removedColumns: string[] = [];

  for (let attempt = 0; attempt <= optionalProofColumns.size; attempt += 1) {
    const result = await supabase
      .from("shipments")
      .update(nextPayload)
      .eq("tracking_id", trackingId.toUpperCase())
      .select(shipmentWithDriverSelect)
      .single();

    if (!result.error) return { ...result, removedColumns };

    const missingColumn = missingColumnFromPostgrest(result.error);
    if (!missingColumn || !optionalProofColumns.has(missingColumn) || !(missingColumn in nextPayload)) {
      return { ...result, removedColumns };
    }

    delete nextPayload[missingColumn];
    removedColumns.push(missingColumn);
  }

  return {
    data: null,
    error: new Error("Unable to save proof of delivery after retrying schema-compatible payload."),
    removedColumns
  };
}

async function insertProofEvent(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  payload: Record<string, unknown>
) {
  const { error } = await supabase.from("proof_of_delivery_events").insert(payload);
  if (error?.code !== "42P01" && error?.code !== "42703") return error;
  return null;
}

export async function PATCH(request: Request, { params }: { params: Promise<{ trackingId: string }> }) {
  const { trackingId } = await params;
  const access = await requireCloudFeature(request, "operations", ["owner", "admin", "dispatcher", "driver"]);
  if (!access.profile) return NextResponse.json({ error: access.error }, { status: access.status });
  if (access.error) return NextResponse.json({ error: access.error }, { status: access.status });

  const parsed = await parseJson(request, proofSchema, "A valid proof image URL is required.");
  if (parsed.response) return parsed.response;

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Delivery proof uploads are temporarily unavailable." }, { status: 503 });

  const current = await fetchShipmentByTracking(supabase, trackingId);
  if (current.error) {
    logShipmentWorkflowError(current.error, "Unable to load shipment before proof upload.", requestContext(request, { trackingId }));
    return NextResponse.json({ error: "Unable to load shipment before proof upload." }, { status: 500 });
  }
  if (!current.data) {
    return NextResponse.json({ error: "Shipment not found." }, { status: 404 });
  }
  if (access.tenant?.schemaReady && access.tenant.companyId && (current.data as { company_id?: string | null }).company_id !== access.tenant.companyId) {
    return NextResponse.json({ error: "Shipment not found." }, { status: 404 });
  }

  const isDriver = isShipmentDriver(access.profile.role, access.tenant?.companyRole);
  if (isDriver && (!access.profile.driver_id || String(current.data.driver_id ?? "") !== String(access.profile.driver_id))) {
    return NextResponse.json({ error: "This shipment is not assigned to your driver account." }, { status: 403 });
  }
  const assignedDriverApproval = current.data.assigned_driver?.approval_status;
  if (isDriver && assignedDriverApproval !== "approved") {
    return NextResponse.json({ error: "Driver account must be approved before uploading proof of delivery." }, { status: 403 });
  }

  const capturedAt = parsed.data.capturedAt ?? new Date().toISOString();
  const recipientName = parsed.data.recipientName?.trim() || current.data.recipient_name || null;
  const deliveryOtp = parsed.data.deliveryOtp?.trim() || current.data.delivery_otp || null;
  const recipientSignatureUrl = parsed.data.recipientSignatureUrl || current.data.recipient_signature_url || null;
  const proofLat = parsed.data.proofLat ?? current.data.proof_lat ?? null;
  const proofLng = parsed.data.proofLng ?? current.data.proof_lng ?? null;
  const proofPayload = {
    proof_image_url: parsed.data.proofImageUrl,
    status: "DELIVERED",
    customer_status_message: shipmentCustomerMessage("DELIVERED"),
    delivery_otp: deliveryOtp,
    delivery_otp_verified_at: deliveryOtp ? current.data.delivery_otp_verified_at || capturedAt : null,
    recipient_name: recipientName,
    recipient_signature_url: recipientSignatureUrl,
    proof_lat: proofLat,
    proof_lng: proofLng,
    proof_uploaded_at: capturedAt,
    timeline: appendStatusProgressionEvents(current.data.timeline, "DELIVERED", {
      pickupAddress: current.data.pickup_address,
      deliveryAddress: current.data.delivery_address
    }),
    updated_at: capturedAt
  };

  const { data, error, removedColumns } = await updateShipmentProofWithSchemaFallback(supabase, trackingId, proofPayload);

  if (error) {
    logShipmentWorkflowError(error, "Unable to save proof of delivery.", requestContext(request, { trackingId }));
    return NextResponse.json({ error: "Unable to save proof of delivery." }, { status: 500 });
  }

  await insertProofEvent(supabase, {
    shipment_id: current.data.id,
    tracking_id: current.data.tracking_id,
    proof_image_url: parsed.data.proofImageUrl,
    delivery_otp: deliveryOtp,
    otp_verified_at: deliveryOtp ? current.data.delivery_otp_verified_at || capturedAt : null,
    recipient_name: recipientName,
    recipient_signature_url: recipientSignatureUrl,
    latitude: proofLat,
    longitude: proofLng,
    captured_by: access.profile.id,
    captured_at: capturedAt,
    metadata: { schemaFallbackRemovedColumns: removedColumns }
  });

  let customerNotification: { ok: boolean; provider: string; mode: string } | null = null;
  if (current.data.customer_phone || current.data.customer_email) {
    try {
      const preferences = await getCustomerNotificationPreferences(supabase, current.data.customer_email);
      const result = await sendCustomerNotification({
        to: current.data.customer_phone,
        message: whatsappMessages.deliveredConfirmation(data),
        workflow: "delivered_confirmation",
        entityType: "shipment",
        entityId: data.tracking_id,
        metadata: { trackingId: data.tracking_id, proofImageUrl: parsed.data.proofImageUrl, recipientName },
        smsFallback: true,
        smsMessage: `Fly Logistics delivery completed for ${data.tracking_id}. Thank you for shipping with us.`,
        preferences
      });
      customerNotification = {
        ok: result.ok,
        provider: result.results.whatsapp?.provider ?? result.results.sms?.provider ?? "multi_channel",
        mode: result.results.whatsapp?.mode ?? result.results.sms?.mode ?? "failed"
      };
    } catch (notificationError) {
      logShipmentWorkflowError(notificationError, "Unable to prepare proof-of-delivery notification.", requestContext(request, { trackingId }));
    }
  }
  const lifecycleEmail = await sendShipmentLifecycleEmail(supabase, data, "delivered", request);

  await writeAuditLog(supabase, {
    actor: access.profile,
    action: "shipment.proof_upload",
    entityType: "shipment",
    entityId: trackingId.toUpperCase(),
    metadata: { proofImageUrl: parsed.data.proofImageUrl, recipientName, schemaFallbackRemovedColumns: removedColumns, customerNotification, lifecycleEmail },
    request
  });

  await writeOperationalEvent(supabase, {
    category: "shipment",
    message: "Proof of delivery uploaded and shipment marked delivered.",
    entityType: "shipment",
    entityId: trackingId.toUpperCase(),
    metadata: { proofImageUrl: parsed.data.proofImageUrl, recipientName, schemaFallbackRemovedColumns: removedColumns, customerNotification, lifecycleEmail },
    request
  });

  return NextResponse.json(data);
}
