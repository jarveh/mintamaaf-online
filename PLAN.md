# Mintamaaf MVP implementation plan

## Stage 1 — Foundation and Stitch proof

- [x] Initialize Next.js, TypeScript, Tailwind, tests, environment example, and responsive landing page.
- [x] Pin installed Stitch SDK `0.3.5` and build server-only adapter and spike script against its installed types.
- [x] Run the live Stitch spike with a real account (10 Oct 2026: generate + edit round trip ~94s, HTML/screenshot URLs verified; per-call pricing/quotas still unconfirmed).

## Stage 2 — Complete anonymous journey

- [x] Add private artifacts, page/job records, background generation worker, anonymous ownership, limits, versioning, isolated preview, publish/unpublish, expiry, reports, and share controls.
- [x] Add strict generated HTML and CSS sanitizer, public page CSP, and malicious output tests.
- [x] Consolidate persistence on Supabase (pulled forward from V1.5): Postgres tables replace Upstash Redis, private Storage replaces Vercel Blob, pg_net + pg_cron replace QStash dispatch.
- [x] Verify the journey with connected Supabase and Stitch accounts locally (`npm run doctor` all green, 10 Oct 2026). Full production dispatch (`JOBS_MODE=supabase`) still awaits deployment.

## Stage 2.5 — Beta experience (10 Oct 2026)

- [x] Unlimited usage for beta: limits raised via env/defaults; counting/limit infrastructure retained for later re-tightening.
- [x] Prompt-only creation form (To/From/Tone/Language removed; DB columns kept as legacy) with optional reference-image attachment (PNG/JPG/WebP ≤5MB) uploaded to Stitch via `project.upload` with text-only fallback.
- [x] Verbatim prompt passthrough + quality/technical wrapper in `buildPrompt`; Malay auto-detection replaces the language field.
- [x] Sanitizer allowlist widened for expressive plain CSS (custom properties, `@keyframes`, filters, shadows, gradients); url()/@import still banned.
- [x] `npm run doctor` connectivity checker; `AGENTS.md` agent handbook.

## Stage 3 — Deploy and release

- [ ] Apply `supabase/migrations/0002_form_and_attachments.sql` in the Supabase SQL editor.
- [ ] Purchase/configure `mintamaaf.online`; deploy app and `pages.mintamaaf.online` on Vercel; set `JOBS_MODE=supabase` and the Supabase `app_config` `worker_url`/`jobs_secret` rows.
- [ ] Run the release checklist in README, verify mobile/desktop behavior, provider timeouts, costs, quotas, and security headers.
- [ ] Enable monitoring and review incoming reports.

## V1.5

Add Supabase Auth and design an owner-claim flow for existing anonymous pages. Firebase is out of scope. Later (needs owner approval of an AI key): transcription for voice notes, first-party image serving inside pages, AI image regeneration.
