import { createClient, type RedisClientType } from "redis";

let client: RedisClientType | null = null;

export async function getRedis() {
  if (!process.env.REDIS_URL) return null;
  if (!client) {
    client = createClient({ url: process.env.REDIS_URL });
    client.on("error", () => undefined);
    await client.connect();
  }
  return client;
}
