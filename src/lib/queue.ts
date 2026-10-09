import "server-only";
import { Client } from "@upstash/qstash";
import { APP_ORIGIN, required } from "./config";

export async function enqueueJob(jobId: string): Promise<void> {
  const client = new Client({ token: required("QSTASH_TOKEN") });
  await client.publishJSON({ url: `${APP_ORIGIN}/api/internal/jobs`, body: { jobId }, retries: 10, timeout: 300, failureCallback: `${APP_ORIGIN}/api/internal/job-failed` });
}
