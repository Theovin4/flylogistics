import { getRedis } from "@/server/redis";

export async function rateLimit(key: string) {
  const limit = Number(process.env.RATE_LIMIT_MAX ?? 60);
  const windowSeconds = Number(process.env.RATE_LIMIT_WINDOW_SECONDS ?? 60);
  const redis = await getRedis();
  if (!redis) return { ok: true, remaining: limit };

  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, windowSeconds);
  return { ok: count <= limit, remaining: Math.max(0, limit - count) };
}
