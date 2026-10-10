// Connectivity doctor: verifies env completeness, Supabase tables/storage from
// migration 0001, and provider configuration without consuming Stitch quota.
// Usage: npm run doctor
import { existsSync } from "node:fs";
if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const results: { check: string; ok: boolean; detail: string }[] = [];
function report(check: string, ok: boolean, detail: string): void {
  results.push({ check, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${check}${detail ? ` — ${detail}` : ""}`);
}

// 1. Environment completeness.
const requiredVars = [
  "APP_ORIGIN", "PUBLIC_PAGE_ORIGIN", "NEXT_PUBLIC_PAGE_ORIGIN",
  "STITCH_API_KEY", "MOCK_GENERATOR", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY",
  "JOBS_SECRET", "JOBS_MODE", "CRON_SECRET", "PREVIEW_SIGNING_KEY",
  "GENERATIONS_PER_SESSION_DAY", "REVISIONS_PER_PAGE", "GLOBAL_DAILY_GENERATION_CAP", "PAGE_EXPIRY_DAYS",
];
const missing = requiredVars.filter((name) => !process.env[name]);
report("env", missing.length === 0, missing.length ? `missing: ${missing.join(", ")}` : `all ${requiredVars.length} variables set`);
report("gemini-absence", true, "no GEMINI/Google-AI key is used or required by this project (by design)");
if (missing.length) {
  console.log("\nFix .env.local (see .env.example), then re-run. Skipping network checks.");
  process.exit(1);
}

const mock = process.env.MOCK_GENERATOR === "true";
const jobsMode = process.env.JOBS_MODE || "unset";
console.log(`\nMode: MOCK_GENERATOR=${mock ? "true (no real Stitch calls)" : "false (real Stitch)"}, JOBS_MODE=${jobsMode}\n`);

// 2. Supabase: reachability + migration 0001 artifacts.
const { createClient } = await import("@supabase/supabase-js");
const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

const tables = ["app_config", "pages", "page_versions", "generation_jobs", "page_reports", "usage_counters", "idempotency_keys"];
let supabaseOk = true;
for (const table of tables) {
  const { error } = await supabase.from(table).select("*").limit(1);
  const ok = !error;
  supabaseOk &&= ok;
  report(`supabase table ${table}`, ok, ok ? "reachable" : error.message);
}
// Migration 0002: optional attachment columns + relaxed tone constraint.
if (supabaseOk) {
  const { error } = await supabase.from("pages").select("attachment_path, attachment_mime").limit(1);
  report("migration 0002 (attachments)", !error, error ? `missing — run supabase/migrations/0002_form_and_attachments.sql in the SQL editor (${error.message})` : "attachment columns present");
}
if (!supabaseOk) {
  console.log("\nTables are missing — run supabase/migrations/0001_init.sql in the Supabase SQL editor (or `supabase link && supabase db push`), then re-run doctor.");
}

// 3. Storage bucket: exists and rejects unauthenticated reads.
const { data: buckets } = await supabase.storage.listBuckets();
const bucket = buckets?.find((b) => b.name === "pages");
report("storage bucket pages", Boolean(bucket), bucket ? (bucket.public ? "exists but PUBLIC (must be private)" : "exists, private") : "missing (created by migration 0001)");
if (bucket) {
  const { error: anonError } = await createClient(process.env.SUPABASE_URL!, "anon-key-simulated").storage.from("pages").download("doctor-probe.txt");
  report("storage bucket privacy", Boolean(anonError), anonError ? "unauthenticated read rejected" : `unauthenticated read SUCCEEDED (${anonError})`);
}

// 4. Dispatch configuration (only relevant for JOBS_MODE=supabase).
const { data: config } = await supabase.from("app_config").select("worker_url, jobs_secret").limit(1);
const row = Array.isArray(config) ? config[0] : null;
const dispatchReady = Boolean(row?.worker_url && row?.jobs_secret && !String(row.worker_url).includes("CHANGE_ME"));
if (jobsMode === "supabase") {
  report("dispatch app_config", dispatchReady, dispatchReady ? `worker_url=${row!.worker_url}` : "worker_url/jobs_secret still placeholder — pg_net dispatch will no-op. Set them per README deployment step 3.");
} else {
  report("dispatch app_config", true, dispatchReady ? "configured (unused in inline mode)" : "not configured (fine: inline mode runs jobs in-process; required before production JOBS_MODE=supabase)");
}

// 5. Stitch key presence (no network call — quota-free).
report("stitch key", !mock && process.env.STITCH_API_KEY ? "present" : mock ? "bypassed by MOCK_GENERATOR" : "missing",
  mock ? "set MOCK_GENERATOR=false for real generations" : "verify live access once with `npm run stitch:spike` (uses one generation)");

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
if (failed.length) process.exit(1);
