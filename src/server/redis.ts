import { createClient, type RedisClientType } from "redis";
import { cleanEnv } from "@/lib/env";

let client: RedisClientType | null = null;

export async function getRedis() {
  const url = cleanEnv(process.env.REDIS_URL);
  if (!url) return null;
  if (!client) {
    client = createClient({ url });
    client.on("error", () => undefined);
    await client.connect();
  }
  return client;
}
