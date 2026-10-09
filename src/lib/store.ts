import "server-only";
import { del, get, put } from "@vercel/blob";
import { Redis } from "@upstash/redis";
import type { JobRecord, PageRecord, VersionRecord } from "./types";

let redisClient: Redis | undefined;
export const redis: Redis = new Proxy({} as Redis, {
  get(_target, property) {
    redisClient ||= Redis.fromEnv();
    const value = Reflect.get(redisClient, property);
    return typeof value === "function" ? value.bind(redisClient) : value;
  }
});
const retention = 60 * 60 * 24 * 60;
const draftRetention = 60 * 60 * 24 * 45;

export async function savePage(page: PageRecord): Promise<void> {
  await redis.set(`page:${page.id}`, page, { ex: retention });
  await redis.set(`slug:${page.slug}`, page.id, { ex: retention });
  const cleanupAt = page.status === "published" && page.expiresAt ? Date.parse(page.expiresAt) : Date.parse(page.createdAt) + draftRetention * 1000;
  await redis.zadd("pages:cleanup", { score: cleanupAt, member: page.id });
}
export async function getPage(id: string): Promise<PageRecord | null> { return redis.get(`page:${id}`); }
export async function getPageBySlug(slug: string): Promise<PageRecord | null> {
  const id = await redis.get<string>(`slug:${slug}`);
  return id ? getPage(id) : null;
}
export async function saveJob(job: JobRecord): Promise<void> { await redis.set(`job:${job.id}`, job, { ex: retention }); }
export async function getJob(id: string): Promise<JobRecord | null> { return redis.get(`job:${id}`); }
export async function saveVersion(version: VersionRecord): Promise<void> { await redis.set(`version:${version.pageId}:${version.version}`, version, { ex: retention }); }
export async function getVersion(pageId: string, version: number): Promise<VersionRecord | null> { return redis.get(`version:${pageId}:${version}`); }

export async function saveHtml(pageId: string, version: number, html: string): Promise<string> {
  const pathname = `pages/${pageId}/v${version}.html`;
  await put(pathname, html, { access: "private", addRandomSuffix: false, contentType: "text/html; charset=utf-8" });
  return pathname;
}
export async function loadHtml(pathname: string): Promise<string | null> {
  const result = await get(pathname, { access: "private" });
  if (!result || result.statusCode !== 200 || !result.stream) return null;
  return new Response(result.stream).text();
}
export async function saveScreenshot(pageId: string, version: number, bytes: Uint8Array, format: "png" | "jpeg"): Promise<string> {
  const pathname = `pages/${pageId}/v${version}.${format === "jpeg" ? "jpg" : "png"}`;
  await put(pathname, Buffer.from(bytes), { access: "private", addRandomSuffix: false, contentType: format === "jpeg" ? "image/jpeg" : "image/png" });
  return pathname;
}
export async function loadScreenshot(pathname: string): Promise<Uint8Array | null> {
  const result = await get(pathname, { access: "private" });
  if (!result || result.statusCode !== 200 || !result.stream) return null;
  const buffer = await new Response(result.stream).arrayBuffer();
  return new Uint8Array(buffer);
}

export async function deletePageData(page: PageRecord): Promise<void> {
  for (let versionNumber = 1; versionNumber <= page.latestVersion; versionNumber++) {
    const version = await getVersion(page.id, versionNumber);
    if (version) await del([version.htmlPath, ...(version.screenshotPath ? [version.screenshotPath] : [])]);
    await redis.del(`version:${page.id}:${versionNumber}`);
  }
  await redis.del(`page:${page.id}`, `slug:${page.slug}`);
  await redis.zrem("pages:cleanup", page.id);
}
