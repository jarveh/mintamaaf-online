import "server-only";
import { designGenerator } from "./generator";
import { recordMetric, recordStorageBytes } from "./limits";
import { sanitizeGeneratedHtml } from "./sanitize";
import { claimJob, getJob, getPage, getVersion, retryJob, saveHtml, saveJob, savePage, saveScreenshot, saveVersion } from "./store";
import type { VersionRecord } from "./types";
import { buildPrompt } from "./validation";

export type JobOutcome = "ran" | "busy" | "skipped";

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
  try {
    job.progressLabel = job.kind === "revise" ? "Revising your page" : "Designing your page";
    await saveJob(job);
    const prompt = buildPrompt({ prompt: page.prompt, recipientName: page.recipientName, senderName: page.senderName, tone: page.tone, language: page.language, idempotencyKey: crypto.randomUUID() });
    const previous = job.kind === "revise" ? await getVersion(page.id, page.latestVersion) : null;
    const result = job.kind === "revise"
      ? await designGenerator().revise({ projectId: previous?.projectId, screenId: previous?.screenId, prompt, instruction: job.instruction || "Make it warmer" })
      : await designGenerator().generate(prompt);
    job.progressLabel = "Checking your page";
    await saveJob(job);
    const html = sanitizeGeneratedHtml(result.html, page.language);
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
  }
}
