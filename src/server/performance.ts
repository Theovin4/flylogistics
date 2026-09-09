import { logWarn } from "@/server/monitoring";

export async function timedOperation<T>(
  label: string,
  operation: () => Promise<T>,
  context?: Record<string, unknown>,
  slowMs = 900
) {
  const startedAt = Date.now();
  const result = await operation();
  const durationMs = Date.now() - startedAt;
  if (durationMs >= slowMs) {
    logWarn("Slow operation detected.", {
      label,
      durationMs,
      ...context
    });
  }
  return result;
}
