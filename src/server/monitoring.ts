type LogContext = Record<string, unknown>;

function redact(value: unknown, seen = new WeakSet<object>(), depth = 0): unknown {
  if (typeof value === "string") {
    if (value.length > 160) return `${value.slice(0, 157)}...`;
    return value;
  }

  if (!value || typeof value !== "object") return value;
  if (depth > 8) return "[max-depth]";
  if (seen.has(value)) return "[circular]";
  seen.add(value);

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entry]) => {
      const lowered = key.toLowerCase();
      if (lowered.includes("token") || lowered.includes("secret") || lowered.includes("key") || lowered.includes("password")) {
        return [key, "[redacted]"];
      }
      return [key, redact(entry, seen, depth + 1)];
    })
  );
}

function payload(level: "info" | "warn" | "error", message: string, context?: LogContext) {
  return {
    level,
    message,
    app: "fly-logistics",
    timestamp: new Date().toISOString(),
    ...(context ? { context: redact(context) } : {})
  };
}

export function requestContext(request: Request, extras?: LogContext) {
  return {
    method: request.method,
    path: new URL(request.url).pathname,
    requestId: request.headers.get("x-vercel-id") ?? request.headers.get("x-fly-request-id") ?? crypto.randomUUID(),
    ...extras
  };
}

export function logInfo(message: string, context?: LogContext) {
  console.info(JSON.stringify(payload("info", message, context)));
}

export function logWarn(message: string, context?: LogContext) {
  console.warn(JSON.stringify(payload("warn", message, context)));
}

export function logError(error: unknown, message: string, context?: LogContext) {
  const errorContext =
    error instanceof Error
      ? { name: error.name, message: error.message, stack: process.env.NODE_ENV === "development" ? error.stack : undefined }
      : { error };

  console.error(JSON.stringify(payload("error", message, { ...context, ...errorContext })));
}

export function logApiError(error: unknown, message: string, context?: LogContext) {
  logError(error, message, { category: "api", ...context });
}

export function logAuthError(error: unknown, message: string, context?: LogContext) {
  logError(error, message, { category: "auth", ...context });
}

export function logPaymentError(error: unknown, message: string, context?: LogContext) {
  logError(error, message, { category: "payment", ...context });
}

export function logShipmentWorkflowError(error: unknown, message: string, context?: LogContext) {
  logError(error, message, { category: "shipment_workflow", ...context });
}

export function logOperationalEvent(message: string, context?: LogContext) {
  logInfo(message, { category: "operational_event", ...context });
}
