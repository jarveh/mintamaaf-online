import { randomBytes, randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { error, mutationAllowed } from "@/lib/http";
import { ATTACHMENT_MIMES, LIMITS } from "@/lib/config";
import { createSchema } from "@/lib/validation";
import { currentOwnerToken, hashToken, newOwnerToken, ownerCookie } from "@/lib/owner";
import { generationAllowed, ipAllowed, recordMetric } from "@/lib/limits";
import { enqueueJob } from "@/lib/queue";
import { findIdempotentRecord, saveAttachment, saveIdempotentRecord, saveJob, savePage } from "@/lib/store";
import type { JobRecord, PageRecord } from "@/lib/types";

const MAX_ATTACHMENT_BYTES = 5_000_000;

// Content-type headers are client-controlled; sniff the actual bytes so only
// real PNG/JPEG/WebP files ever reach storage or the provider.
function sniffImage(bytes: Uint8Array): boolean {
  if (bytes.length < 12) return false;
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return true;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return true;
  return String.fromCharCode(...bytes.subarray(0, 4)) === "RIFF" && String.fromCharCode(...bytes.subarray(8, 12)) === "WEBP";
}

export async function POST(request: NextRequest) {
  if (!mutationAllowed(request)) return error("Invalid origin", 403);
  const form = await request.formData().catch(() => null);
  if (!form) return error("Please write your story (20–1200 characters).");
  // `?? undefined` so a missing mode field (stale cached client, curl) takes
  // the schema default instead of failing — zod .default() only sees undefined.
  const parsed = createSchema.safeParse({ prompt: form.get("prompt"), idempotencyKey: form.get("idempotencyKey"), mode: form.get("mode") ?? undefined });
  if (!parsed.success) return error("Please write a story of 20–1200 characters.");
  const file = form.get("attachment");
  let attachment: { bytes: Uint8Array; mime: string } | null = null;
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_ATTACHMENT_BYTES) return error("Images are limited to 5 MB.", 413);
    if (!ATTACHMENT_MIMES.includes(file.type)) return error("Attachments must be a PNG, JPG, or WebP image.", 415);
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!sniffImage(bytes)) return error("That file does not look like a valid PNG, JPG, or WebP image.", 415);
    attachment = { bytes, mime: file.type };
  }

  const token = (await currentOwnerToken()) || newOwnerToken();
  const ownerHash = hashToken(token);
  const previous = await findIdempotentRecord(ownerHash, parsed.data.idempotencyKey);
  if (previous) return NextResponse.json(previous, { status: 202 });
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!(await ipAllowed(ip, "generate", LIMITS.generationsPerIpDay)) || !(await generationAllowed(ownerHash))) return error("Today's generation limit has been reached.", 429);

  const now = new Date().toISOString();
  const page: PageRecord = {
    id: randomUUID(), slug: randomBytes(12).toString("base64url"), ownerHash,
    prompt: parsed.data.prompt, mode: parsed.data.mode, status: "draft", latestVersion: 0, activeVersion: null,
    revisionCount: 0, createdAt: now,
  };
  const job: JobRecord = { id: randomUUID(), pageId: page.id, kind: "create", status: "queued", progressLabel: "Waiting to begin", createdAt: now };
  try {
    await savePage(page);
    if (attachment) {
      // Best-effort: any failure here must not cancel the generation — it
      // just proceeds without the reference image.
      try {
        const path = await saveAttachment(page.id, attachment.bytes, attachment.mime);
        await savePage({ ...page, attachmentPath: path, attachmentMime: attachment.mime });
        page.attachmentPath = path;
        page.attachmentMime = attachment.mime;
      } catch (cause) {
        console.error("attachment save failed", typeof cause === "object" && cause ? JSON.stringify(cause).slice(0, 200) : String(cause));
      }
    }
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
