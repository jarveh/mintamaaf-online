import { NextResponse, type NextRequest } from "next/server";
import { appRequest, error, safeId } from "@/lib/http";
import { currentOwnerToken, ownsPage } from "@/lib/owner";
import { getJob, getPage } from "@/lib/store";

export async function GET(request: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  if (!appRequest(request)) return error("Not found", 404);
  const { jobId } = await params;
  if (!safeId(jobId)) return error("Not found", 404);
  const job = await getJob(jobId);
  const page = job && await getPage(job.pageId);
  if (!job || !page || !ownsPage(page.ownerHash, await currentOwnerToken())) return error("Not found", 404);
  return NextResponse.json({ status: job.status, progressLabel: job.progressLabel, errorCode: job.errorCode, pageId: page.id, previewUrl: job.status === "succeeded" ? `/preview/${page.id}` : undefined });
}
