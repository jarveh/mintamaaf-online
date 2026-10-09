import { existsSync } from "node:fs";
if (existsSync(".env.local")) process.loadEnvFile(".env.local");
const { Redis } = await import("@upstash/redis");
const redis = Redis.fromEnv();
const [action, pageId] = process.argv.slice(2);

if (action === "list") {
  const reports = await redis.lrange<{ pageId: string; reason: string; createdAt: string }>("reports:pending", 0, 49);
  console.log(JSON.stringify(reports, null, 2));
} else if (action === "block" && pageId && /^[0-9a-f-]{36}$/i.test(pageId)) {
  const page = await redis.get<Record<string, unknown>>(`page:${pageId}`);
  if (!page) throw new Error("Page not found");
  page.status = "blocked";
  page.activeVersion = null;
  await redis.set(`page:${pageId}`, page, { ex: 60 * 60 * 24 * 60 });
  console.log(`Blocked ${pageId}`);
} else if (action === "delete" && pageId && /^[0-9a-f-]{36}$/i.test(pageId)) {
  const page = await redis.get<{ slug: string; latestVersion: number }>(`page:${pageId}`);
  if (!page) throw new Error("Page not found");
  const { del } = await import("@vercel/blob");
  for (let version = 1; version <= page.latestVersion; version++) {
    const record = await redis.get<{ htmlPath: string; screenshotPath?: string }>(`version:${pageId}:${version}`);
    if (record) await del([record.htmlPath, ...(record.screenshotPath ? [record.screenshotPath] : [])]);
    await redis.del(`version:${pageId}:${version}`);
  }
  await redis.del(`page:${pageId}`, `slug:${page.slug}`);
  await redis.zrem("pages:cleanup", pageId);
  console.log(`Deleted ${pageId}`);
} else {
  console.error("Usage: npm run moderate -- list | block <page-id> | delete <page-id>");
  process.exitCode = 1;
}
