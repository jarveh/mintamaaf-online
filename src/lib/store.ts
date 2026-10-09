import "server-only";
import { supabase } from "./supabase";
import type { JobRecord, PageRecord, VersionRecord } from "./types";

export const PAGE_BUCKET = "pages";
const retention = 60 * 60 * 24 * 60;
const draftRetention = 60 * 60 * 24 * 45;

type PageRow = {
  id: string; slug: string; owner_hash: string; prompt: string;
  recipient_name: string | null; sender_name: string | null; tone: PageRecord["tone"]; language: PageRecord["language"];
  status: PageRecord["status"]; latest_version: number; active_version: number | null; revision_count: number;
  created_at: string; published_at: string | null; expires_at: string | null;
};
type VersionRow = {
  page_id: string; version: number; html_path: string; screenshot_path: string | null;
  provider: string; project_id: string | null; screen_id: string | null; created_at: string;
};
type JobRow = {
  id: string; page_id: string; kind: JobRecord["kind"]; status: JobRecord["status"]; progress_label: string;
  instruction: string | null; error_code: string | null; attempts: number | null;
  created_at: string; finished_at: string | null;
};

function iso(value: string | null): string | undefined {
  return value ? new Date(value).toISOString() : undefined;
}
function toPage(row: PageRow): PageRecord {
  return {
    id: row.id, slug: row.slug, ownerHash: row.owner_hash, prompt: row.prompt,
    recipientName: row.recipient_name || undefined, senderName: row.sender_name || undefined,
    tone: row.tone, language: row.language, status: row.status,
    latestVersion: row.latest_version, activeVersion: row.active_version, revisionCount: row.revision_count,
    createdAt: iso(row.created_at)!, publishedAt: iso(row.published_at), expiresAt: iso(row.expires_at),
  };
}
function toVersion(row: VersionRow): VersionRecord {
  return {
    pageId: row.page_id, version: row.version, htmlPath: row.html_path,
    screenshotPath: row.screenshot_path || undefined, provider: row.provider,
    projectId: row.project_id || undefined, screenId: row.screen_id || undefined, createdAt: iso(row.created_at)!,
  };
}
function toJob(row: JobRow): JobRecord {
  return {
    id: row.id, pageId: row.page_id, kind: row.kind, status: row.status, progressLabel: row.progress_label,
    instruction: row.instruction || undefined, errorCode: row.error_code || undefined,
    attempts: row.attempts ?? undefined, createdAt: iso(row.created_at)!, finishedAt: iso(row.finished_at),
  };
}

function pageRow(page: PageRecord) {
  const cleanupAt = page.status === "published" && page.expiresAt ? Date.parse(page.expiresAt) : Date.parse(page.createdAt) + draftRetention * 1000;
  return {
    id: page.id, slug: page.slug, owner_hash: page.ownerHash, prompt: page.prompt,
    recipient_name: page.recipientName || null, sender_name: page.senderName || null,
    tone: page.tone, language: page.language, status: page.status,
    latest_version: page.latestVersion, active_version: page.activeVersion, revision_count: page.revisionCount,
    created_at: page.createdAt, published_at: page.publishedAt || null, expires_at: page.expiresAt || null,
    cleanup_at: new Date(cleanupAt).toISOString(),
  };
}

export async function savePage(page: PageRecord): Promise<void> {
  const { error } = await supabase.from("pages").upsert(pageRow(page));
  if (error) throw error;
}
export async function getPage(id: string): Promise<PageRecord | null> {
  const { data, error } = await supabase.from("pages").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? toPage(data as PageRow) : null;
}
export async function getPageBySlug(slug: string): Promise<PageRecord | null> {
  const { data, error } = await supabase.from("pages").select("*").eq("slug", slug).maybeSingle();
  if (error) throw error;
  return data ? toPage(data as PageRow) : null;
}

export async function saveJob(job: JobRecord): Promise<void> {
  const { error } = await supabase.from("generation_jobs").upsert({
    id: job.id, page_id: job.pageId, kind: job.kind, status: job.status, progress_label: job.progressLabel,
    instruction: job.instruction || null, error_code: job.errorCode || null, attempts: job.attempts ?? 0,
    created_at: job.createdAt, finished_at: job.finishedAt || null,
  });
  if (error) throw error;
}
export async function getJob(id: string): Promise<JobRecord | null> {
  const { data, error } = await supabase.from("generation_jobs").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? toJob(data as JobRow) : null;
}

// Atomically claim a queued, due job (queued -> running). Returns null when the
// job is unknown/finished/not due or the MAX_CONCURRENT_JOBS cap is reached;
// the cron sweep re-dispatches busy jobs later.
export async function claimJob(id: string): Promise<JobRecord | null> {
  const { data, error } = await supabase.rpc("claim_job", { p_job_id: id });
  if (error) throw error;
  // PostgREST renders a null composite return as an all-null row object.
  const row = data as JobRow | null;
  return row && row.id ? toJob(row) : null;
}

// Hand a transiently failed job back to the dispatch sweep with backoff.
export async function retryJob(job: JobRecord, label: string): Promise<void> {
  const nextAttemptAt = new Date(Date.now() + 30_000 * Math.max(1, job.attempts || 1)).toISOString();
  const { error } = await supabase.from("generation_jobs").update({ status: "queued", progress_label: label, next_attempt_at: nextAttemptAt }).eq("id", job.id);
  if (error) throw error;
}

export async function saveVersion(version: VersionRecord): Promise<void> {
  const { error } = await supabase.from("page_versions").upsert({
    page_id: version.pageId, version: version.version, html_path: version.htmlPath,
    screenshot_path: version.screenshotPath || null, provider: version.provider,
    project_id: version.projectId || null, screen_id: version.screenId || null, created_at: version.createdAt,
  });
  if (error) throw error;
}
export async function getVersion(pageId: string, version: number): Promise<VersionRecord | null> {
  const { data, error } = await supabase.from("page_versions").select("*").eq("page_id", pageId).eq("version", version).maybeSingle();
  if (error) throw error;
  return data ? toVersion(data as VersionRow) : null;
}

async function uploadObject(path: string, body: string | Uint8Array, contentType: string): Promise<void> {
  const { error } = await supabase.storage.from(PAGE_BUCKET).upload(path, body, { contentType, upsert: true });
  if (error) throw error;
}
async function downloadObject(path: string): Promise<Blob | null> {
  const { data, error } = await supabase.storage.from(PAGE_BUCKET).download(path);
  if (error) {
    if (/not found/i.test(error.message)) return null;
    throw error;
  }
  return data;
}

export async function saveHtml(pageId: string, version: number, html: string): Promise<string> {
  const path = `pages/${pageId}/v${version}.html`;
  await uploadObject(path, html, "text/html; charset=utf-8");
  return path;
}
export async function loadHtml(path: string): Promise<string | null> {
  const blob = await downloadObject(path);
  return blob ? await blob.text() : null;
}
export async function saveScreenshot(pageId: string, version: number, bytes: Uint8Array, format: "png" | "jpeg"): Promise<string> {
  const path = `pages/${pageId}/v${version}.${format === "jpeg" ? "jpg" : "png"}`;
  await uploadObject(path, bytes, format === "jpeg" ? "image/jpeg" : "image/png");
  return path;
}
export async function loadScreenshot(path: string): Promise<Uint8Array | null> {
  const blob = await downloadObject(path);
  if (!blob) return null;
  return new Uint8Array(await blob.arrayBuffer());
}

export async function deletePageData(page: PageRecord): Promise<void> {
  const paths: string[] = [];
  for (let versionNumber = 1; versionNumber <= page.latestVersion; versionNumber++) {
    const version = await getVersion(page.id, versionNumber);
    if (version) paths.push(version.htmlPath, ...(version.screenshotPath ? [version.screenshotPath] : []));
  }
  if (paths.length) await supabase.storage.from(PAGE_BUCKET).remove(paths);
  const { error } = await supabase.from("pages").delete().eq("id", page.id);
  if (error) throw error;
}

export async function findIdempotentRecord(ownerHash: string, key: string): Promise<{ jobId: string; pageId: string } | null> {
  const { data, error } = await supabase.from("idempotency_keys").select("job_id, page_id").eq("owner_hash", ownerHash).eq("key", key).maybeSingle();
  if (error) throw error;
  return data ? { jobId: data.job_id as string, pageId: data.page_id as string } : null;
}
export async function saveIdempotentRecord(ownerHash: string, key: string, jobId: string, pageId: string): Promise<void> {
  const { error } = await supabase.from("idempotency_keys").insert({ owner_hash: ownerHash, key, job_id: jobId, page_id: pageId });
  if (error) throw error;
}
