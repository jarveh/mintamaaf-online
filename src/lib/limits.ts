import { LIMITS } from "./config";
import { redis } from "./store";
import { createHash } from "node:crypto";

function day(): string { return new Date().toISOString().slice(0, 10); }

async function incrementLimited(key: string, limit: number): Promise<boolean> {
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, 60 * 60 * 48);
  return count <= limit;
}

export async function generationAllowed(ownerHash: string): Promise<boolean> {
  const ownerOk = await incrementLimited(`limit:owner:${ownerHash}:${day()}`, LIMITS.generationsPerSessionDay);
  if (!ownerOk) return false;
  return incrementLimited(`limit:global:${day()}`, LIMITS.globalDailyGenerationCap);
}

export async function ipAllowed(ip: string, action: string, limit: number): Promise<boolean> {
  const digest = createHash("sha256").update(ip).digest("hex");
  return incrementLimited(`limit:ip:${action}:${digest}:${day()}`, limit);
}

export async function recordMetric(name: string): Promise<void> {
  const key = `metric:${name}:${day()}`;
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, 60 * 60 * 60 * 90);
}

export async function recordStorageBytes(bytes: number): Promise<void> {
  const key = `metric:storage_bytes:${day()}`;
  await redis.incrby(key, bytes);
  await redis.expire(key, 60 * 60 * 24 * 90);
}
