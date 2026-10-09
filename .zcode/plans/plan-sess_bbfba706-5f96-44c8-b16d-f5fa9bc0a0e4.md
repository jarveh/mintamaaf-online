# Replace Upstash + QStash + Vercel Blob with Supabase

## Goal
Consolidate on one free Supabase project, as the blueprint originally specced (§5–6): **Postgres** replaces Upstash Redis (the primary datastore), **Storage** replaces Vercel Blob, and **pg_net + pg_cron** replace QStash for job dispatch (your chosen option). Vercel stays as the Next.js host — we only drop the Blob service. `STITCH_API_KEY` stays exactly as is; the generator adapter (`src/lib/generator.ts`) is untouched.

After this, the only setup left is: create a Supabase project, run one SQL file, fill `.env.local`. Full local end-to-end (create → generate → revise → publish → open link) becomes testable on localhost — no Upstash account, no QStash public-URL requirement, no deploy needed first.

## 1. New file: `supabase/migrations/0001_init.sql`
Runnable via `supabase db push` OR pasted into the Supabase SQL editor. Contains:
- Extensions: `pg_cron`, `pg_net`.
- Tables adapted from blueprint §6: `pages` (adds `latest_version`, `active_version`, `revision_count` ints, `cleanup_at` timestamptz replacing the Redis cleanup zset), `page_versions` (PK `(page_id, version)`), `generation_jobs` (adds `kind`, `instruction`, `progress_label`, `attempts`, `next_attempt_at`, `locked_at`), `page_reports`, plus `usage_counters (scope, period, amount)` for rate limits/metrics, `idempotency_keys (owner_hash, key, job_id)` for dedup, and `app_config (key, value)` holding `worker_url`, `jobs_secret`, `max_concurrent_jobs` for the cron functions (with `EDIT-ME` placeholder rows at the top of the file).
- RLS enabled on every table with **no public policies** (deny anon/authenticated; the server uses the service-role key, which bypasses RLS). Private `pages` storage bucket, no storage policies either.
- Security-definer RPCs: `bump_counter` (atomic increment-and-return, powers all limits/metrics), `claim_job` (atomic queued→running transition honoring `next_attempt_at` and the concurrency cap), `app_dispatch_job` (single job → `net.http_post` to the worker with the secret header), and `app_dispatch_due_jobs` (re-queues running jobs stale >15 min — replaces QStash's stuck-job recovery — then dispatches due queued jobs up to the cap; scheduled via `cron.schedule` every minute).

## 2. Code changes (swap the adapters, keep route signatures)
- **`src/lib/supabase.ts` (new):** lazy server-only service-role client (same Proxy pattern as the old Redis one).
- **`src/lib/store.ts`:** same exported functions (`savePage`, `getPage`, `getPageBySlug`, `saveJob`, `getJob`, `saveVersion`, `getVersion`, `saveHtml`, `loadHtml`, `saveScreenshot`, `loadScreenshot`, `deletePageData`) reimplemented over Postgres tables + the private Storage bucket (`pages/{pageId}/v{n}.html|.png`). Records keep their camelCase TS shapes; a small row↔record mapper handles snake_case columns.
- **`src/lib/limits.ts`:** same exports (`generationAllowed`, `ipAllowed`, `recordMetric`, `recordStorageBytes`) via `bump_counter`.
- **`src/lib/job-runner.ts` (new):** the generation pipeline extracted from the worker route verbatim (buildPrompt → generate/revise → sanitize → save artifacts → update records; transient-error retry policy ≤2 attempts with backoff, error-code classification unchanged) so both dispatch modes share it.
- **`src/lib/queue.ts`:** `enqueueJob` keeps inserting the job row, then — in `JOBS_MODE=supabase` — calls `app_dispatch_job`; in `JOBS_MODE=inline` (local dev) runs the job in-process via `next/server`'s `after()`.
- **`src/app/api/internal/jobs/route.ts`:** QStash signature verification → `x-jobs-secret` header check (timing-safe) against `JOBS_SECRET`; claims the job via `claim_job` (replaces Redis slot locks); 503 when at cap (the cron sweep re-dispatches). `maxDuration = 300` stays.
- **Delete `src/app/api/internal/job-failed/route.ts`** (QStash failure callback — obsolete).
- **`src/app/api/internal/cleanup/route.ts`:** keeps Vercel Cron + `CRON_SECRET`; now queries `pages WHERE cleanup_at < now()` and also purges expired idempotency keys / old counters.
- **Route touch-ups:** `generations` (idempotency via `idempotency_keys` insert-on-conflict), `revise`, `report` (→ `page_reports`) — minimal edits since store/limits signatures are preserved.
- **`scripts/moderate.mts`, `scripts/metrics.mts`:** rewritten from raw Redis to the Supabase client.
- **`package.json`:** remove `@upstash/redis`, `@upstash/qstash`, `@vercel/blob`; add `@supabase/supabase-js`.
- **`.env.example`:** remove the five Upstash/QStash vars + `BLOB_READ_WRITE_TOKEN`; add `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `JOBS_SECRET`, `JOBS_MODE`. `CRON_SECRET` and `PREVIEW_SIGNING_KEY` stay.
- **`README.md` + `PLAN.md`:** setup steps rewritten (Supabase project → run migration → copy URL + service key → generate the three local secrets with `openssl rand -base64 48`); PLAN.md notes the V1.5 persistence move pulled into MVP.

## 3. Verification
- `npm run build` + `vitest` green.
- Local e2e with your real `STITCH_API_KEY` and `JOBS_MODE=inline`: create → poll → preview → revise → publish → open the `/p/:slug` link.
- Cron dispatch can only be proven post-deploy (Supabase must reach a public URL) — noted in README as the one deploy-time check.

## Assumption to flag
Vercel remains the host (only the Blob service is dropped) — the app is Next.js and the blueprint/README already assume Vercel hosting with its daily cleanup cron.