import { sendEmailNotification } from "@/server/notifications/email";
import { sendInAppNotification } from "@/server/notifications/in-app";
import { sendSmsNotification } from "@/server/notifications/sms";
import { sendWhatsAppNotification } from "@/server/notifications/whatsapp";
import type { NotificationRequest } from "@/server/notifications/shared";
import { whiteLabelCustomerText } from "@/server/notifications/white-label";

export type CustomerNotificationChannel = "email" | "whatsapp" | "sms" | "in_app";

export type CustomerNotificationPreferences = {
  userId?: string | null;
  email?: string | null;
  emailEnabled?: boolean | null;
  whatsappEnabled?: boolean | null;
  smsEnabled?: boolean | null;
};

export type MultiChannelNotificationInput = NotificationRequest & {
  channels?: CustomerNotificationChannel[];
  preferences?: CustomerNotificationPreferences | null;
  emailTo?: string | null;
  emailSubject?: string | null;
  emailTitle?: string | null;
  emailCtaUrl?: string | null;
  emailCtaLabel?: string | null;
  inAppUserId?: string | null;
  inAppTitle?: string | null;
  inAppBody?: string | null;
  inAppCategory?: string | null;
  smsFallback?: boolean;
  smsMessage?: string;
  smsRoute?: "dnd" | "generic";
};

function compactSms(message: string) {
  return message.replace(/\s+/g, " ").trim().slice(0, 459);
}

export async function sendWhatsApp(input: NotificationRequest) {
  return sendWhatsAppNotification(input);
}

export async function sendSms(input: NotificationRequest & { route?: "dnd" | "generic" }) {
  return sendSmsNotification(input);
}

export async function sendEmail(input: Parameters<typeof sendEmailNotification>[0]) {
  return sendEmailNotification(input);
}

export async function sendInApp(input: Parameters<typeof sendInAppNotification>[0]) {
  return sendInAppNotification(input);
}

export async function sendCustomerNotification(input: MultiChannelNotificationInput) {
  const customerInput: MultiChannelNotificationInput = {
    ...input,
    message: whiteLabelCustomerText(input.message),
    emailSubject: input.emailSubject ? whiteLabelCustomerText(input.emailSubject, "Fly Logistics update") : input.emailSubject,
    emailTitle: input.emailTitle ? whiteLabelCustomerText(input.emailTitle, "Fly Logistics update") : input.emailTitle,
    inAppTitle: input.inAppTitle ? whiteLabelCustomerText(input.inAppTitle, "Fly Logistics update") : input.inAppTitle,
    inAppBody: input.inAppBody ? whiteLabelCustomerText(input.inAppBody) : input.inAppBody,
    smsMessage: input.smsMessage ? whiteLabelCustomerText(input.smsMessage) : input.smsMessage
  };
  const preferences = customerInput.preferences ?? {};
  const defaultChannels: CustomerNotificationChannel[] = customerInput.smsFallback || customerInput.smsMessage
    ? ["in_app", "email", "whatsapp", "sms"]
    : ["in_app", "email", "whatsapp"];
  const channels = new Set<CustomerNotificationChannel>(customerInput.channels ?? defaultChannels);
  const emailEnabled = preferences.emailEnabled !== false;
  const whatsappEnabled = preferences.whatsappEnabled !== false;
  const smsEnabled = preferences.smsEnabled !== false;
  const emailTo = customerInput.emailTo ?? preferences.email;
  const inAppUserId = customerInput.inAppUserId ?? preferences.userId;
  const results: {
    email?: Awaited<ReturnType<typeof sendEmailNotification>>;
    whatsapp?: Awaited<ReturnType<typeof sendWhatsAppNotification>>;
    sms?: Awaited<ReturnType<typeof sendSmsNotification>>;
    inApp?: Awaited<ReturnType<typeof sendInAppNotification>>;
  } = {};

  if (channels.has("in_app") && inAppUserId) {
    results.inApp = await sendInAppNotification({
      ...customerInput,
      userId: inAppUserId,
      title: customerInput.inAppTitle ?? customerInput.emailTitle,
      body: customerInput.inAppBody ?? customerInput.message,
      category: customerInput.inAppCategory ?? customerInput.workflow ?? "account"
    });
  }

  if (channels.has("email") && emailEnabled && emailTo) {
    results.email = await sendEmailNotification({
      ...customerInput,
      emailTo,
      subject: customerInput.emailSubject,
      title: customerInput.emailTitle ?? customerInput.inAppTitle,
      ctaUrl: customerInput.emailCtaUrl,
      ctaLabel: customerInput.emailCtaLabel
    });
  }

  if (channels.has("whatsapp") && whatsappEnabled) {
    results.whatsapp = await sendWhatsAppNotification(customerInput);
  }

  const shouldSendSms =
    smsEnabled &&
    channels.has("sms") &&
    (customerInput.smsFallback ? !results.whatsapp?.ok || results.whatsapp.status === "NOT_CONFIGURED" : true);

  if (shouldSendSms) {
    results.sms = await sendSmsNotification({
      ...customerInput,
      message: compactSms(customerInput.smsMessage ?? customerInput.message),
      route: customerInput.smsRoute ?? "dnd"
    });
  }

  return {
    ok: Boolean(results.inApp?.ok || results.email?.ok || results.whatsapp?.ok || results.sms?.ok),
    results
  };
}

export const smsMessages = {
  paymentConfirmed(reference?: string | null) {
    return `Fly Logistics payment confirmed${reference ? ` for ${reference}` : ""}. We will continue processing your shipment.`;
  },
  criticalShipmentAlert(trackingId?: string | null, status?: string | null) {
    return `Fly Logistics alert${trackingId ? ` for ${trackingId}` : ""}: ${status ?? "your shipment needs attention"}. Our operations team is reviewing it.`;
  },
  deliveryFailure(trackingId?: string | null) {
    return `Fly Logistics delivery alert${trackingId ? ` for ${trackingId}` : ""}: delivery could not be completed. Our team will contact you with next steps.`;
  },
  otpFallback(code: string) {
    return `Your Fly Logistics verification code is ${code}. Do not share this code.`;
  }
};
