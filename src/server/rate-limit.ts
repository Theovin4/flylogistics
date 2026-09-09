import { getRedis } from "@/server/redis";
import { logWarn } from "@/server/monitoring";

export type RateLimitOptions = {
  limit?: number;
  windowSeconds?: number;
};

function defaultLimit() {
  return Number(process.env.RATE_LIMIT_MAX ?? 60);
}

function defaultWindowSeconds() {
  return Number(process.env.RATE_LIMIT_WINDOW_SECONDS ?? 60);
}

export function clientIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip") || "local";
}

export async function rateLimit(key: string, options?: RateLimitOptions) {
  const limit = options?.limit ?? defaultLimit();
  const windowSeconds = options?.windowSeconds ?? defaultWindowSeconds();

  try {
    const redis = await getRedis();
    if (!redis) return { ok: true, remaining: limit, retryAfterSeconds: 0 };

    const count = await redis.incr(key);
    if (count === 1) await redis.expire(key, windowSeconds);

    return {
      ok: count <= limit,
      remaining: Math.max(0, limit - count),
      retryAfterSeconds: count > limit ? windowSeconds : 0
    };
  } catch (error) {
    logWarn("Redis rate limiter unavailable; allowing request.", {
      key,
      reason: error instanceof Error ? error.message : String(error)
    });
    return { ok: true, remaining: limit, retryAfterSeconds: 0 };
  }
}

export function rateLimitRequest(request: Request, scope: string, options?: RateLimitOptions) {
  return rateLimit(`${scope}:${clientIp(request)}`, options);
}
