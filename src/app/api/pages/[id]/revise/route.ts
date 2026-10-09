import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { LIMITS } from "@/lib/config";
import { error, mutationAllowed, ownedPage, safeId } from "@/lib/http";
import { enqueueJob } from "@/lib/queue";
import { saveJob, savePage } from "@/lib/store";
import type { JobRecord } from "@/lib/types";
import { reviseSchema } from "@/lib/validation";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!mutationAllowed(request)) return error("Invalid origin", 403);
  const { id } = await params;
  if (!safeId(id)) return error("Not found", 404);
  const page = await ownedPage(id);
  if (!page) return error("Not found", 404);
  if (page.status === "blocked" || page.latestVersion < 1) return error("This page cannot be revised", 409);
  if (page.revisionCount >= LIMITS.revisionsPerPage) return error("This page has used its revision", 429);
  const parsed = reviseSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return error("Enter a revision of 10–500 characters.");
  const job: JobRecord = { id: randomUUID(), pageId: id, kind: "revise", instruction: parsed.data.instruction, status: "queued", progressLabel: "Waiting to revise", createdAt: new Date().toISOString() };
  page.revisionCount += 1;
  await savePage(page);
  await saveJob(job);
  try { await enqueueJob(job.id); }
  catch { page.revisionCount -= 1; await savePage(page); job.status = "failed"; job.errorCode = "QUEUE_UNAVAILABLE"; await saveJob(job); return error("Revision is temporarily unavailable", 503); }
  return NextResponse.json({ jobId: job.id }, { status: 202 });
}
