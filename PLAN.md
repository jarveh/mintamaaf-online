# Mintamaaf MVP implementation plan

## Stage 1 — Foundation and Stitch proof

- [x] Initialize Next.js, TypeScript, Tailwind, tests, environment example, and responsive landing page.
- [x] Pin installed Stitch SDK `0.3.5` and build server-only adapter and spike script against its installed types.
- [ ] Run the live Stitch spike with a real account; record access, latency, limits, terms, and screenshot shape.

## Stage 2 — Complete anonymous journey

- [x] Add private artifacts, page/job records, background generation worker, anonymous ownership, limits, versioning, isolated preview, publish/unpublish, expiry, reports, and share controls.
- [x] Add strict generated HTML and CSS sanitizer, public page CSP, and malicious output tests.
- [x] Consolidate persistence on Supabase (pulled forward from V1.5): Postgres tables replace Upstash Redis, private Storage replaces Vercel Blob, pg_net + pg_cron replace QStash dispatch.
- [ ] Verify the full journey with connected Supabase and Stitch accounts.

## Stage 3 — Deploy and release

- [ ] Purchase/configure `mintamaaf.online`; deploy app and `pages.mintamaaf.online` on Vercel; set `JOBS_MODE=supabase` and the Supabase `app_config` `worker_url`/`jobs_secret` rows.
- [ ] Run the release checklist in README, verify mobile/desktop behavior, provider timeouts, costs, quotas, and security headers.
- [ ] Enable monitoring and review incoming reports.

## V1.5

Add Supabase Auth and design an owner-claim flow for existing anonymous pages. Firebase is out of scope.
