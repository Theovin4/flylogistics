import { NextResponse } from "next/server";
import type { ZodError, ZodType } from "zod";
import { rateLimitRequest, type RateLimitOptions } from "@/server/rate-limit";
import { logApiError, logWarn, requestContext } from "@/server/monitoring";

type ParseJsonResult<T> =
  | { data: T; response: null }
  | { data: null; response: NextResponse };

type ApiErrorOptions = {
  status?: number;
  details?: unknown;
  headers?: HeadersInit;
};

export const MAX_JSON_BODY_BYTES = 1_000_000;

function formatIssues(error: ZodError) {
  return error.issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message
  }));
}

export function apiError(message: string, options?: ApiErrorOptions) {
  return NextResponse.json(
    {
      error: message,
      ...(process.env.NODE_ENV === "development" && options?.details ? { details: options.details } : {})
    },
    {
      status: options?.status ?? 500,
      headers: options?.headers
    }
  );
}

export async function parseJson<T>(request: Request, schema: ZodType<T>, errorMessage: string): Promise<ParseJsonResult<T>> {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_JSON_BODY_BYTES) {
    logWarn("Rejected oversized API payload.", requestContext(request, { contentLength, maxBytes: MAX_JSON_BODY_BYTES }));
    return {
      data: null,
      response: apiError("Request payload is too large.", { status: 413 })
    };
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);

  if (!parsed.success) {
    logWarn("Rejected invalid API payload.", requestContext(request, { issues: formatIssues(parsed.error) }));
    return {
      data: null,
      response: apiError(errorMessage, {
        status: 400,
        details: formatIssues(parsed.error)
      })
    };
  }

  return { data: parsed.data, response: null };
}

export async function enforceRateLimit(request: Request, scope: string, options?: RateLimitOptions) {
  try {
    const result = await rateLimitRequest(request, scope, options);
    if (result.ok) return null;

    return apiError("Too many requests. Please wait a moment and try again.", {
      status: 429,
      headers: {
        "Retry-After": String(result.retryAfterSeconds ?? options?.windowSeconds ?? process.env.RATE_LIMIT_WINDOW_SECONDS ?? 60),
        "X-RateLimit-Remaining": String(result.remaining)
      }
    });
  } catch (error) {
    logApiError(error, "Rate limit check failed open.", requestContext(request, { scope }));
    return null;
  }
}

export function handleApiError(error: unknown, request: Request, fallback = "Unable to complete this request.") {
  logApiError(error, fallback, requestContext(request));
  return apiError(fallback, { status: 500 });
}
