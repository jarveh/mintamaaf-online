import { randomBytes, randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { error, mutationAllowed } from "@/lib/http";
import { createSchema } from "@/lib/validation";
import { currentOwnerToken, hashToken, newOwnerToken, ownerCookie } from "@/lib/owner";
import { generationAllowed, ipAllowed, recordMetric } from "@/lib/limits";
import { enqueueJob } from "@/lib/queue";
import { findIdempotentRecord, saveIdempotentRecord, saveJob, savePage } from "@/lib/store";
import type { JobRecord, PageRecord } from "@/lib/types";

export async function POST(request: NextRequest) {
  if (!mutationAllowed(request)) return error("Invalid origin", 403);
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return error("Please enter a story of 20–1200 characters and choose a tone and language.");
  const token = (await currentOwnerToken()) || newOwnerToken();
  const ownerHash = hashToken(token);
  const previous = await findIdempotentRecord(ownerHash, parsed.data.idempotencyKey);
  if (previous) return NextResponse.json(previous, { status: 202 });
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!(await ipAllowed(ip, "generate", 3)) || !(await generationAllowed(ownerHash))) return error("Today's generation limit has been reached.", 429);

  const now = new Date().toISOString();
  const page: PageRecord = {
    id: randomUUID(), slug: randomBytes(12).toString("base64url"), ownerHash,
    prompt: parsed.data.prompt, recipientName: parsed.data.recipientName, senderName: parsed.data.senderName,
    tone: parsed.data.tone, language: parsed.data.language, status: "draft", latestVersion: 0, activeVersion: null,
    revisionCount: 0, createdAt: now,
  };
  const job: JobRecord = { id: randomUUID(), pageId: page.id, kind: "create", status: "queued", progressLabel: "Waiting to begin", createdAt: now };
  try {
    await savePage(page);
    await saveJob(job);
    await saveIdempotentRecord(ownerHash, parsed.data.idempotencyKey, job.id, page.id);
    await enqueueJob(job.id);
    await recordMetric("generation_attempts");
  } catch (cause) {
    console.error("generation enqueue failed", typeof cause === "object" && cause ? JSON.stringify(cause).slice(0, 300) : String(cause));
    job.status = "failed"; job.errorCode = "QUEUE_UNAVAILABLE"; job.finishedAt = new Date().toISOString();
    await saveJob(job).catch(() => undefined);
    return error("Generation is temporarily unavailable. Please try later.", 503);
  }
  const response = NextResponse.json({ jobId: job.id, pageId: page.id }, { status: 202 });
  response.cookies.set(ownerCookie(token));
  return response;
}
