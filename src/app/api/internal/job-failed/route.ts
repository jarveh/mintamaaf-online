import { verifySignatureAppRouter } from "@upstash/qstash/nextjs";
import { NextResponse } from "next/server";
import { recordMetric } from "@/lib/limits";
import { getJob, saveJob } from "@/lib/store";

async function handle(request: Request): Promise<Response> {
  const body = await request.json().catch(() => null) as { sourceBody?: string } | null;
  let jobId: string | undefined;
  try { jobId = JSON.parse(Buffer.from(body?.sourceBody || "", "base64").toString("utf8")).jobId; } catch { /* malformed callback */ }
  if (!jobId) return NextResponse.json({ ok: true });
  const job = await getJob(jobId);
  if (job && job.status !== "succeeded" && job.status !== "failed") {
    job.status = "failed";
    job.errorCode = "DELIVERY_FAILED";
    job.progressLabel = "Generation service unavailable";
    job.finishedAt = new Date().toISOString();
    await saveJob(job);
    await recordMetric("generation_failures");
  }
  return NextResponse.json({ ok: true });
}

export async function POST(request: Request): Promise<Response> {
  return verifySignatureAppRouter(handle)(request);
}
