import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { required } from "@/lib/config";
import { processQueuedJob } from "@/lib/job-runner";

export const maxDuration = 300;

function secretOk(header: string | null): boolean {
  if (!header) return false;
  const provided = createHash("sha256").update(header).digest();
  const expected = createHash("sha256").update(required("JOBS_SECRET")).digest();
  return timingSafeEqual(provided, expected);
}

export async function POST(request: NextRequest) {
  if (!secretOk(request.headers.get("x-jobs-secret"))) return new Response("Unauthorized", { status: 401 });
  const input = await request.json().catch(() => null) as { jobId?: string } | null;
  if (!input?.jobId || !/^[0-9a-f-]{36}$/i.test(input.jobId)) return NextResponse.json({ error: "Invalid job" }, { status: 400 });
  const outcome = await processQueuedJob(input.jobId);
  // 503 tells the pg_cron sweep to dispatch this job again once a slot frees up.
  if (outcome === "busy") return NextResponse.json({ error: "Busy" }, { status: 503 });
  return NextResponse.json({ ok: true });
}
