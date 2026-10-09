import { verifySignatureAppRouter } from "@upstash/qstash/nextjs";
import { NextResponse } from "next/server";
import { LIMITS } from "@/lib/config";
import { designGenerator } from "@/lib/generator";
import { recordMetric, recordStorageBytes } from "@/lib/limits";
import { sanitizeGeneratedHtml } from "@/lib/sanitize";
import { getJob, getPage, getVersion, redis, saveHtml, saveJob, savePage, saveScreenshot, saveVersion } from "@/lib/store";
import type { VersionRecord } from "@/lib/types";
import { buildPrompt } from "@/lib/validation";

export const maxDuration = 300;

async function run(request: Request): Promise<Response> {
  const input = await request.json().catch(() => null) as { jobId?: string } | null;
  if (!input?.jobId || !/^[0-9a-f-]{36}$/i.test(input.jobId)) return NextResponse.json({ error: "Invalid job" }, { status: 400 });
  const job = await getJob(input.jobId);
  if (!job) return NextResponse.json({ error: "Unknown job" }, { status: 404 });
  if (job.status === "succeeded" || job.status === "failed") return NextResponse.json({ ok: true });
  const page = await getPage(job.pageId);
  if (!page || page.status === "blocked") return NextResponse.json({ ok: true });
  let lockKey: string | undefined;
  for (let slot = 0; slot < Math.max(1, LIMITS.maxConcurrentJobs); slot++) {
    const candidate = `generation:slot:${slot}`;
    const acquired = await redis.set(candidate, job.id, { nx: true, ex: 330 });
    if (acquired) { lockKey = candidate; break; }
  }
  if (!lockKey) return NextResponse.json({ error: "Busy" }, { status: 503 });
  try {
    job.status = "running";
    job.attempts = (job.attempts || 0) + 1;
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
    return NextResponse.json({ ok: true });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "unknown";
    const transient = /429|rate.?limit|timeout|timed out|network|fetch failed|temporarily/i.test(message);
    if (transient && (job.attempts || 0) < 2) {
      job.status = "queued";
      job.progressLabel = "Provider is busy; retrying";
      await saveJob(job);
      return NextResponse.json({ error: "Retrying" }, { status: 503 });
    }
    job.status = "failed";
    job.errorCode = /safety|unsafe|HTML|CSS|content/i.test(message) ? "UNSAFE_OUTPUT" : /STITCH_API_KEY|auth|401|403/i.test(message) ? "PROVIDER_ACCESS" : "GENERATION_FAILED";
    job.progressLabel = "We couldn't make this page";
    job.finishedAt = new Date().toISOString();
    await saveJob(job);
    await recordMetric("generation_failures");
    console.error("generation failed", { jobId: job.id, code: job.errorCode, message: message.slice(0, 160) });
    return NextResponse.json({ ok: true });
  } finally {
    if (lockKey && await redis.get(lockKey) === job.id) await redis.del(lockKey);
  }
}

export async function POST(request: Request): Promise<Response> {
  return verifySignatureAppRouter(run)(request);
}
