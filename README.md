# Mintamaaf

An anonymous, short-lived apology-page generator. Next.js hosts the editor; Google Stitch creates a draft; a Supabase-dispatched job sanitizes and stores it; an isolated host serves approved pages.

## Status

The application builds and sanitizer tests pass. Persistence and job dispatch run on a single Supabase project (Postgres tables, private Storage bucket, pg_cron/pg_net dispatch); Vercel remains only the host. A live end-to-end run needs the owner's Stitch key and a Supabase project; local end-to-end works fully on localhost with `JOBS_MODE=inline`. No secrets are included in this repository. Set `MOCK_GENERATOR=true` only for local or staging integration tests; production should use the real provider.

**Verified live (10 Oct 2026):** the configured Supabase project passes every `npm run doctor` check (tables, private bucket, RLS), and the configured Stitch key completes a real generate + edit round trip (~94s).

**Beta posture:** usage is unlimited for now — the counting and limit infrastructure stays active (see `src/lib/limits.ts`), so re-tightening is only an env-var change. The creation form is prompt-only plus an optional reference image (PNG/JPG/WebP ≤ 5 MB) that is uploaded to Stitch as design input and, since 2026-10-12, also embedded into the finished page: it is served first-party from `/api/attachments/{pageId}` (public but keyed by the unguessable page UUID) and is the only image a sanitized page may reference. There are no image or voice generations: the project intentionally requires no Gemini/Google-AI key — the only AI credential is `STITCH_API_KEY`.

**SDK finding:** npm currently installed `@google/stitch-sdk@0.3.5`, pinned exactly in `package.json`. Its installed API uses `stitch.createProject(title)`, `project.generate(prompt, deviceType)` returning one screen (guided pages design at `MOBILE` width, freestyle at `DESKTOP`), and `screen.getHtml()` / `getImage()` returning download URLs. This differs from the repository's [v1 migration guide](https://github.com/google-labs-code/stitch-sdk/blob/main/MIGRATION-1.0.md). The code follows the installed 0.3.5 types. Verified live: HTML downloads come from `contribution.usercontent.google.com` and screenshots from `lh3.googleusercontent.com` (both allowlisted in `src/lib/generator.ts`); a generation takes roughly 60–120 seconds; `getHtml()` can throw a transient `get_screen: Request contains an invalid argument` error when its cached URL is missing, so bounded retries are in place. Quotas and per-call pricing are still unconfirmed.

## Setup

1. Install Node 20+ and run `npm ci`.
2. Create one free Supabase project. In the SQL editor, run `supabase/migrations/0001_init.sql` then `0002_form_and_attachments.sql` (or `supabase link && supabase db push` with the CLI). They create the tables, the private `pages` storage bucket, RLS, the dispatch RPCs, the every-minute cron sweep, and the attachment columns. `npm run doctor` verifies all of it.
3. Copy `.env.example` to `.env.local`. Fill `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from Project Settings → API. Generate `PREVIEW_SIGNING_KEY`, `JOBS_SECRET`, and `CRON_SECRET` with `openssl rand -base64 48`.
4. Add one active Stitch API key. Keep any spare key outside the app and swap it manually if authorized. Run `npm run stitch:spike` with the key set in the environment. Check its reported download host against `ALLOWED_DOWNLOAD_HOSTS` in `src/lib/generator.ts`; add only a verified provider-owned host if needed.
5. Set `APP_ORIGIN` to the editor origin, `PUBLIC_PAGE_ORIGIN` and `NEXT_PUBLIC_PAGE_ORIGIN` to the isolated page origin. For localhost, all three may be `http://localhost:3000` and the preview iframe remains sandboxed. Set `MOCK_GENERATOR=true` only when testing without Stitch access. Leave `JOBS_MODE=inline` locally.
6. Run `npm run dev`. The full journey — create, generate, revise, publish, open the public link — works on localhost in inline mode; no public deployment is needed for end-to-end testing.

## Deployment

1. Connect this repository to a Vercel project with Fluid Compute enabled. Add `mintamaaf.online` and `pages.mintamaaf.online` to the same deployment. Point DNS to Vercel after purchasing the domain.
2. Add all `.env.example` values as Vercel environment variables, using `https://mintamaaf.online` for `APP_ORIGIN` and `https://pages.mintamaaf.online` for both page-origin values. Set `JOBS_MODE=supabase`. Never use wildcard cookie domains.
3. In Supabase, update the `app_config` rows that the migration inserted: `worker_url` to `https://mintamaaf.online/api/internal/jobs` and `jobs_secret` to the same value as the `JOBS_SECRET` env var. The dispatch functions no-op until both are set. Verify the private `pages` bucket rejects direct unauthenticated reads. Vercel Cron sends the `CRON_SECRET` bearer token to the daily cleanup route.
4. Measure a real Stitch generation and revision. The worker is configured for 300 seconds, matching the documented Vercel Hobby Fluid Compute maximum; adjust the architecture if observed latency exceeds it. [Vercel function duration](https://vercel.com/docs/functions/configuring-functions/duration)
5. Complete the release checks below, then inspect Vercel function logs, Supabase logs (`net._http_response` for dispatch results), and pg_cron jobs daily at first. Do not assume Stitch calls are free; set the global daily cap only after confirming the account's allowance.

## Release checks

- Generate English and Malay pages. Reload `/create?jobId=...` mid-job and confirm polling resumes without a second provider call.
- Preview at 375px, 768px, and desktop. Missing screenshots must not block generation.
- Publish and open a link on another device. Confirm its page response has no app cookies, script permission, forms, or app secrets — and no *external* images: the only permitted `<img>` is the creator's own attachment served from `/api/attachments/{pageId}` (also confirm a nonexistent or expired page id 404s there).
- Revise once. The published version must remain unchanged until Publish is clicked again.
- Unpublish and confirm the public URL immediately returns the unavailable page. Expired links must do likewise.
- Send a report and review it with `npm run moderate -- list`; block a reported page with `npm run moderate -- block <page-id>`.
- Check malformed prompts, malicious HTML/CSS, provider authorization errors, rate limits, worker timeouts, and daily limits.
- Invoke the daily cleanup job using a valid secret and verify expired HTML, screenshot, database records, and slug rows are removed.
- After deploying with `JOBS_MODE=supabase`, create a page and confirm the job starts within seconds (pg_net dispatch) and that a killed worker's job is re-queued by the cron sweep.

## Operations

- `npm run doctor` verifies environment completeness, Supabase tables, the private storage bucket, dispatch configuration, and Stitch key presence without consuming quota. Run it first on any new machine or project.
- `npm run typecheck`, `npm test`, `npm run build` verify the repository.
- `npm run metrics -- 2026-10-09` prints daily attempt, success, failure, report, and uploaded-byte counts. These are usage counts, not provider cost estimates.
- `npm run moderate -- list` reads the latest 50 reports. `npm run moderate -- block <page-id>` removes a page from public access; `npm run moderate -- delete <page-id>` removes its stored records and artifacts. The scripts load `.env.local` if present.
- The daily cron removes published pages after seven days and drafts after 45 days. Anonymous owners lose management access when their cookie is cleared. Unpublished or blocked pages retain artifacts until the retention deadline; use the delete command for urgent removal.
- Job retries: the worker re-queues transient provider errors (up to 2 attempts with backoff); the pg_cron sweep every minute re-dispatches queued jobs, re-queues jobs whose worker died mid-run (up to 3 total attempts), and fails exhausted jobs. A job stuck in `running` for over 15 minutes is recovered on the next sweep. Do not log prompts or HTML.

## Boundaries

Generated HTML is always untrusted. The sanitizer discards scripts, forms, embeds, external links, unsafe CSS declarations, and network loads (`url()`/`@import` stay banned, including inside CSS custom properties), while allowing expressive plain CSS: gradients, custom properties, `@keyframes`, shadows, filters, and transitions. Images: an `<img>` survives only when its src exactly equals the page's first-party attachment URL `/api/attachments/{pageId}` (the creator's own uploaded photo, embedded unmodified); every other image — external, `data:`, protocol-relative, or the prompt's placeholder token — is neutralized. It may also reject some Stitch designs. This is intentional; never allow generated JavaScript or serve unsanitized output just to preserve a design. The generation prompt passes the creator's words through verbatim, wrapped with quality direction and the technical constraints this pipeline allows (one plain-CSS `<style>` block, no CDN or external assets, emoji/CSS-shape imagery). Public page HTML is read from the private Supabase Storage bucket through a separate-origin renderer with a restrictive CSP and no-store caching, so unpublish takes effect immediately.
