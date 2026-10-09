import { existsSync } from "node:fs";
if (existsSync(".env.local")) process.loadEnvFile(".env.local");
const { Redis } = await import("@upstash/redis");
const redis = Redis.fromEnv();
const day = process.argv[2] || new Date().toISOString().slice(0, 10);
const names = ["generation_attempts", "generation_successes", "generation_failures", "reports", "storage_bytes"];
const counts = await Promise.all(names.map((name) => redis.get<number>(`metric:${name}:${day}`)));
console.log(JSON.stringify(Object.fromEntries(names.map((name, index) => [name, counts[index] || 0])), null, 2));
