# Mintamaaf

An anonymous, short-lived apology-page generator. Next.js hosts the editor; Google Stitch creates a draft; a signed QStash job sanitizes and stores it; an isolated host serves approved pages.

## Status

The application builds and sanitizer tests pass. A live end-to-end run and deployment need the owner's Stitch, Vercel Blob, Upstash, Vercel, and DNS access. No secrets are included in this repository. Set `MOCK_GENERATOR=true` only for local or staging integration tests; production should use the real provider.

**SDK finding:** npm currently installed `@google/stitch-sdk@0.3.5`, pinned exactly in `package.json`. Its installed API uses `stitch.createProject(title)`, `project.generate(prompt, "MOBILE")` returning one screen, and `screen.getHtml()` / `getImage()` returning download URLs. This differs from the repository's [v1 migration guide](https://github.com/google-labs-code/stitch-sdk/blob/main/MIGRATION-1.0.md). The code follows the installed 0.3.5 types. No live account call, quota, terms, or price could be verified without `STITCH_API_KEY`.

## Setup

1. Install Node 20+ and run `npm ci`.
2. Copy `.env.example` to `.env.local`. Create a **private** Vercel Blob store, an Upstash Redis database, and QStash credentials. Set a random `PREVIEW_SIGNING_KEY` and `CRON_SECRET`.
3. Add one active Stitch API key. Keep any spare key outside the app and swap it manually if authorized. Run `npm run stitch:spike` with the key set in the environment. Check its reported download host against `ALLOWED_DOWNLOAD_HOSTS` in `src/lib/generator.ts`; add only a verified provider-owned host if needed.
4. Set `APP_ORIGIN` to the editor origin, `PUBLIC_PAGE_ORIGIN` and `NEXT_PUBLIC_PAGE_ORIGIN` to the isolated page origin. For localhost, all three may be `http://localhost:3000` and the preview iframe remains sandboxed. Set `MOCK_GENERATOR=true` only when testing without Stitch access.
5. Run `npm run dev`. QStash needs a public HTTPS destination to invoke the worker; use a staging deployment for the full journey. Local landing-page development and unit tests work without service credentials.

## Deployment

1. Connect this repository to a Vercel project with Fluid Compute enabled. Add `mintamaaf.online` and `pages.mintamaaf.online` to the same deployment. Point DNS to Vercel after purchasing the domain.
2. Add all `.env.example` values as Vercel environment variables, using `https://mintamaaf.online` for `APP_ORIGIN` and `https://pages.mintamaaf.online` for both page-origin values. Never use wildcard cookie domains. Protect preview deployments or configure a separate staging `APP_ORIGIN` and public QStash callback destination.
3. Verify that the private Blob store rejects direct unauthenticated reads. QStash signs `/api/internal/jobs`; Vercel Cron sends the `CRON_SECRET` bearer token to the daily cleanup route.
4. Measure a real Stitch generation and revision. The worker is configured for 300 seconds, matching the documented Vercel Hobby Fluid Compute maximum; adjust the architecture if observed latency exceeds it. [Vercel function duration](https://vercel.com/docs/functions/configuring-functions/duration) · [QStash response duration](https://upstash.com/pricing/qstash)
5. Complete the release checks below, then inspect Vercel function logs, QStash delivery logs, Upstash usage, and Blob usage daily at first. Do not assume Stitch calls are free; set the global daily cap only after confirming the account's allowance.

## Release checks

- Generate English and Malay pages. Reload `/create?jobId=...` mid-job and confirm polling resumes without a second provider call.
- Preview at 375px, 768px, and desktop. Missing screenshots must not block generation.
- Publish and open a link on another device. Confirm its page response has no app cookies, script permission, forms, external images, or app secrets.
- Revise once. The published version must remain unchanged until Publish is clicked again.
- Unpublish and confirm the public URL immediately returns the unavailable page. Expired links must do likewise.
- Send a report and review it with `npm run moderate -- list`; block a reported page with `npm run moderate -- block <page-id>`.
- Check malformed prompts, malicious HTML/CSS, provider authorization errors, rate limits, worker timeouts, and daily limits.
- Invoke the daily cleanup job using a valid secret and verify expired HTML, screenshot, Redis metadata, and slug records are removed.

## Operations

- `npm run typecheck`, `npm test`, `npm run build` verify the repository.
- `npm run metrics -- 2026-10-09` prints daily attempt, success, failure, report, and uploaded-byte counts. These are usage counts, not provider cost estimates.
- `npm run moderate -- list` reads the latest 50 reports. `npm run moderate -- block <page-id>` removes a page from public access; `npm run moderate -- delete <page-id>` removes its stored records and artifacts. The scripts load `.env.local` if present.
- The daily cron removes published pages after seven days and drafts after 45 days. Anonymous owners lose management access when their cookie is cleared. Unpublished or blocked pages retain artifacts until the retention deadline; use the delete command for urgent removal.
- QStash retries transient worker errors. Failed jobs show a safe message; inspect QStash DLQ and logs for a stuck job. Do not log prompts or HTML.

## Boundaries

Generated HTML is always untrusted. The sanitizer discards scripts, forms, image tags, embeds, external links, unsafe CSS declarations, and network loads. It may also reject some Stitch designs. This is intentional; never allow generated JavaScript or serve unsanitized output just to preserve a design. Public page HTML is read from private Blob through a separate-origin renderer with a restrictive CSP and no-store caching, so unpublish takes effect immediately.
