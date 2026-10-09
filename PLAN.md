# Mintamaaf MVP implementation plan

## Stage 1 — Foundation and Stitch proof

- [x] Initialize Next.js, TypeScript, Tailwind, tests, environment example, and responsive landing page.
- [x] Pin installed Stitch SDK `0.3.5` and build server-only adapter and spike script against its installed types.
- [ ] Run the live Stitch spike with a real account; record access, latency, limits, terms, and screenshot shape.

## Stage 2 — Complete anonymous journey

- [x] Add private Blob artifacts, Redis page/job records, signed QStash worker, anonymous ownership, limits, versioning, isolated preview, publish/unpublish, expiry, reports, and share controls.
- [x] Add strict generated HTML and CSS sanitizer, public page CSP, and malicious output tests.
- [ ] Verify the full journey with connected Vercel Blob, Upstash, QStash, and Stitch accounts.

## Stage 3 — Deploy and release

- [ ] Purchase/configure `mintamaaf.online`; deploy app and `pages.mintamaaf.online` on Vercel with private Blob and Upstash credentials.
- [ ] Run the release checklist in README, verify mobile/desktop behavior, provider timeouts, costs, quotas, and security headers.
- [ ] Enable monitoring and review incoming reports.

## V1.5

Move records/artifacts to Supabase, add Supabase Auth, and design an owner-claim flow for existing anonymous pages. Firebase is out of scope.
