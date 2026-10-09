import "server-only";
import { after } from "next/server";
import { supabase } from "./supabase";
import { processQueuedJob } from "./job-runner";

export type JobsMode = "inline" | "supabase";

export function jobsMode(): JobsMode {
  const mode = process.env.JOBS_MODE;
  if (mode === "inline" || mode === "supabase") return mode;
  return process.env.NODE_ENV === "production" ? "supabase" : "inline";
}

// Dispatch a queued job. Supabase mode asks the database to POST the worker
// endpoint (pg_net), with the pg_cron sweep as the retry/stuck-job net; inline
// mode (local dev) runs the job in-process once the response is sent, so no
// public URL is needed.
export async function enqueueJob(jobId: string): Promise<void> {
  if (jobsMode() === "inline") {
    after(() => runInline(jobId));
    return;
  }
  const { error } = await supabase.rpc("app_dispatch_job", { p_job_id: jobId });
  if (error) throw error;
}

async function runInline(jobId: string): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const outcome = await processQueuedJob(jobId);
    if (outcome !== "busy") return;
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
}
