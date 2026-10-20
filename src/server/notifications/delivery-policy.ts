import { cleanEnv } from "@/lib/env";

export type ExternalNotificationDeliveryPolicy = {
  suppressed: boolean;
  reason: "vercel_preview" | null;
};

export function externalNotificationDeliveryPolicy(
  environment: { VERCEL_ENV?: string } = { VERCEL_ENV: process.env.VERCEL_ENV }
): ExternalNotificationDeliveryPolicy {
  const vercelEnvironment = cleanEnv(environment.VERCEL_ENV)?.toLowerCase();
  if (vercelEnvironment === "preview") {
    return { suppressed: true, reason: "vercel_preview" };
  }
  return { suppressed: false, reason: null };
}
