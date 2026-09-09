import { cleanEnv } from "@/lib/env";

const resendTestSender = "Fly Logistics <onboarding@resend.dev>";
const productionSender = "Fly Logistics <notifications@flylogistics.com.ng>";
const productionReplyTo = "support@flylogistics.com.ng";

function wantsCustomDomainSender() {
  return String(process.env.RESEND_USE_CUSTOM_DOMAIN ?? "").trim().toLowerCase() === "true";
}

export function resendFromEmail() {
  const configuredSender = safeConfiguredSender(cleanEnv(process.env.EMAIL_FROM) ?? cleanEnv(process.env.RESEND_FROM_EMAIL));
  if (configuredSender) return configuredSender;
  if (process.env.NODE_ENV === "production" || wantsCustomDomainSender()) return productionSender;
  return resendTestSender;
}

export function resendReplyToEmail() {
  const inbound = cleanEnv(process.env.RESEND_INBOUND_EMAIL);
  return inbound ?? cleanEnv(process.env.EMAIL_REPLY_TO) ?? productionReplyTo;
}

function safeConfiguredSender(value: string | undefined) {
  if (!value) return undefined;
  const normalized = value.toLowerCase();
  const isOldDomain = normalized.includes("@flylogistics.ng") && !normalized.includes("@flylogistics.com.ng");
  const isTestSenderInProduction = normalized.includes("@resend.dev") && (process.env.NODE_ENV === "production" || wantsCustomDomainSender());
  if (isOldDomain || isTestSenderInProduction) return undefined;
  return value;
}
