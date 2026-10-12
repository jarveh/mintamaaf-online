import "server-only";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { designGenerator, isProviderEmbeddedImageSrc } from "./generator";
import { recordMetric, recordStorageBytes } from "./limits";
import { sanitizeGeneratedHtml } from "./sanitize";
import { claimJob, getJob, getPage, getVersion, loadAttachment, retryJob, saveHtml, saveJob, savePage, saveScreenshot, saveVersion } from "./store";
import type { PageRecord, VersionRecord } from "./types";
import { ATTACHMENT_IMAGE_TOKEN, buildPrompt, detectLanguage } from "./validation";

export type JobOutcome = "ran" | "busy" | "skipped";

// First-party URL where the page's attached photo is served from (public, keyed
// by the unguessable page UUID; see src/app/api/attachments/[id]/route.ts).
function attachmentSrcFor(page: PageRecord): string | undefined {
  return page.attachmentPath ? `/api/attachments/${page.id}` : undefined;
}

// The prompt asks Stitch to place the attached photo via the placeholder
// element; swap it for the real first-party URL. Stitch doesn't always copy the
// token — live it emits its own placeholder asset (or a provider-hosted image)
// for the attached photo — so re-point those srcs at the real file too. The
// sanitizer would strip every other src and leave a hole where the photo
// belongs.
function embedAttachment(html: string, attachmentSrc: string): string {
  const withToken = html.split(ATTACHMENT_IMAGE_TOKEN).join(attachmentSrc);
  if (withToken.includes(attachmentSrc)) return withToken;
  return withToken.replace(/(<img\b[^>]*?\bsrc=)(["'])([^"']+)\2/gi, (whole, lead: string, quote: string, url: string) =>
    isProviderEmbeddedImageSrc(url) ? `${lead}${quote}${attachmentSrc}${quote}` : whole);
}

// Write the stored attachment to a temp file for the SDK's upload(path) API.
// Returns the temp dir alongside the file so the caller can clean it up.
// Returns undefined when anything is off — the generation continues text-only.
async function attachmentImagePath(page: PageRecord): Promise<{ dir: string; file: string } | undefined> {
  if (!page.attachmentPath) return undefined;
  try {
    const bytes = await loadAttachment(page.attachmentPath);
    if (!bytes) return undefined;
    const dir = await mkdtemp(join(tmpdir(), "mintamaaf-"));
    const ext = page.attachmentMime === "image/jpeg" ? "jpg" : page.attachmentMime === "image/webp" ? "webp" : "png";
    const file = join(dir, `attachment.${ext}`);
    await writeFile(file, bytes);
    return { dir, file };
  } catch {
    return undefined;
  }
}

// Claim and run one queued job end-to-end. "busy" means the concurrency cap is
// hit or the job is not yet due (the dispatch caller should try again later);
// "skipped" means the job is unknown, already finished, or its page is gone.
export async function processQueuedJob(jobId: string): Promise<JobOutcome> {
  const job = await claimJob(jobId);
  if (!job) {
    const existing = await getJob(jobId);
    return existing && (existing.status === "succeeded" || existing.status === "failed") ? "skipped" : "busy";
  }
  const page = await getPage(job.pageId);
  if (!page || page.status === "blocked") {
    job.status = "failed";
    job.errorCode = "PAGE_UNAVAILABLE";
    job.progressLabel = "We couldn't make this page";
    job.finishedAt = new Date().toISOString();
    await saveJob(job);
    return "skipped";
  }
  let attachmentDir: string | undefined;
  try {
    job.progressLabel = job.kind === "revise" ? "Revising your page" : "Designing your page";
    await saveJob(job);
    const prompt = buildPrompt(page.prompt, { mode: page.mode, withAttachment: Boolean(page.attachmentPath) });
    const attachmentSrc = attachmentSrcFor(page);
    // Revises pass the image too: unused when the Stitch screen carries
    // forward, but keeps the attachment in play if revise falls back to a
    // fresh text generation.
    const imagePath = await attachmentImagePath(page);
    attachmentDir = imagePath?.dir;
    const previous = job.kind === "revise" ? await getVersion(page.id, page.latestVersion) : null;
    const result = job.kind === "revise"
      ? await designGenerator().revise({ projectId: previous?.projectId, screenId: previous?.screenId, prompt, instruction: job.instruction || "Make it warmer", imagePath: imagePath?.file, mode: page.mode })
      : await designGenerator().generate({ prompt, imagePath: imagePath?.file, mode: page.mode });
    job.progressLabel = "Checking your page";
    await saveJob(job);
    const html = sanitizeGeneratedHtml(attachmentSrc ? embedAttachment(result.html, attachmentSrc) : result.html, detectLanguage(page.prompt), { attachmentSrc });
    if (attachmentSrc && html.includes(attachmentSrc)) recordMetric("generation_attachment_embeds").catch(() => undefined);
    const versionNumber = page.latestVersion + 1;
    const htmlPath = await saveHtml(page.id, versionNumber, html);
    let screenshotPath: string | undefined;
    if (result.screenshot) {
      const bytes = Buffer.from(result.screenshot);
      const format = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ? "png" : bytes[0] === 0xff && bytes[1] === 0xd8 ? "jpeg" : null;
      if (format) screenshotPath = await saveScreenshot(page.id, versionNumber, result.screenshot, format).catch(() => undefined);
    }
    const version: VersionRecord = { pageId: page.id, version: versionNumber, htmlPath, screenshotPath, provider: result.provider, projectId: result.projectId, screenId: result.screenId, createdAt: new Date().toISOString() };
    await saveVersion(version);
    await recordStorageBytes(Buffer.byteLength(html, "utf8") + (result.screenshot?.byteLength || 0));
    page.latestVersion = versionNumber;
    await savePage(page);
    job.status = "succeeded";
    job.progressLabel = "Ready to preview";
    job.finishedAt = new Date().toISOString();
    await saveJob(job);
    await recordMetric("generation_successes");
    return "ran";
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "unknown";
    const transient = /429|rate.?limit|timeout|timed out|network|fetch failed|temporarily/i.test(message);
    if (transient && (job.attempts || 0) < 2) {
      job.progressLabel = "Provider is busy; retrying";
      await retryJob(job, job.progressLabel);
      return "ran";
    }
    job.status = "failed";
    job.errorCode = /safety|unsafe|HTML|CSS|content/i.test(message) ? "UNSAFE_OUTPUT" : /STITCH_API_KEY|auth|401|403/i.test(message) ? "PROVIDER_ACCESS" : "GENERATION_FAILED";
    job.progressLabel = "We couldn't make this page";
    job.finishedAt = new Date().toISOString();
    await saveJob(job);
    await recordMetric("generation_failures");
    console.error("generation failed", { jobId: job.id, code: job.errorCode, message: message.slice(0, 160) });
    return "ran";
  } finally {
    if (attachmentDir) await rm(attachmentDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
