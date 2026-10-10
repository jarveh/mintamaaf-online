# AGENTS.md — Mintamaaf

Agent handbook: what this project is, how to work on it, and decisions already
made so you don't re-litigate them. Read this before changing anything.

## What this is

An anonymous, short-lived apology-page generator. A visitor writes their story
in one prompt box (optionally attaching a reference image), Google Stitch
generates a designed one-page site, the app sanitizes and stores it, and a
shareable link on the isolated page origin serves it for seven days.

Journey: prompt → job queue → Stitch → sanitize → private storage → preview →
publish → `/p/:slug` (expires in 7 days).

## Non-negotiable rules

1. **Generated HTML is untrusted.** Everything passes through
   `src/lib/sanitize.ts`: script/form/iframe/img-stripping allowlist, a
   CSS-property allowlist, phishing-text scan. `PAGE_CSP` allows zero external
   loads (`default-src 'none'`, `img-src 'none'`, `font-src 'none'`, no
   scripts). Never weaken the sanitizer or CSP to preserve a design. If a
   design breaks, fix the prompt or *safely widen the allowlist with tests*.
2. **No Gemini/Google-AI API key, ever, until the owner explicitly adds image
   regeneration.** The only AI credential is `STITCH_API_KEY`. (Stitch's own
   backend internally uses Gemini models — that is included in the Stitch key
   and is not our dependency.)
3. **Never execute generated JavaScript**, never serve unsanitized output, and
   never forward app cookies/secrets to published pages.
4. **Never log prompts or generated HTML** — they contain personal stories.
5. Secrets live in `.env.local` (gitignored). Never commit them.

## Commands

```bash
npm run doctor        # env + Supabase + bucket + dispatch + key checks (start here)
npm run typecheck     # tsc --noEmit
npm test              # vitest (sanitizer boundary tests live in src/lib/sanitize.test.ts)
npm run build         # next build
npm run dev           # dev server (JOBS_MODE=inline: jobs run in-process)
npm run stitch:spike  # LIVE provider check; consumes one generation (~60-120s)
npm run metrics -- YYYY-MM-DD   # usage counters
npm run moderate -- list | block <id> | delete <id>
```

After changing the DB schema, the owner must run the new
`supabase/migrations/*.sql` in the Supabase SQL editor (no CLI on this
machine); `npm run doctor` verifies whether migrations are applied.

## Architecture map

| Area | File(s) |
|---|---|
| Prompt assembly (verbatim user words + quality/technical wrapper) | `src/lib/validation.ts` `buildPrompt()` |
| Language detection (Malay heuristic; no language form field) | `src/lib/validation.ts` `detectLanguage()` |
| Stitch adapter (SDK 0.3.5, uploads, retries, allowlisted download hosts) | `src/lib/generator.ts` |
| Sanitizer + `PAGE_CSP` | `src/lib/sanitize.ts` |
| Job processing (create/revise, attachment temp files, retry/labels) | `src/lib/job-runner.ts` |
| Queue: inline (`after()`) vs Supabase pg_net dispatch | `src/lib/queue.ts` |
| Persistence + private Storage bucket (`pages`) | `src/lib/store.ts`, `src/lib/supabase.ts` |
| Limits & metrics (all via `bump_counter` RPC) | `src/lib/limits.ts`, values in `src/lib/config.ts` |
| Anonymous ownership (HMAC token cookie) | `src/lib/owner.ts` |
| Preview signing (10-min HMAC URLs) | `src/lib/preview-token.ts` |
| Create form (prompt + image attach, multipart) | `src/components/generate-form.tsx` |
| Progress/polling UI | `src/components/progress.tsx`, `/create` |
| Preview/publish UI | `src/components/preview-editor.tsx` |
| Public page renderer (hardened headers) | `src/app/p/[slug]/route.ts` |
| Draft preview renderer (owner token + frame-ancestors) | `src/app/draft/[id]/route.ts` |
| API routes | `src/app/api/generations/*`, `src/app/api/pages/[id]/*`, `src/app/api/internal/{jobs,cleanup}` |
| Migrations (owner applies via SQL editor) | `supabase/migrations/` |

## Stitch SDK 0.3.5 facts (verified live 10 Oct 2026)

- API: `stitch.createProject(title)` → `project.generate(prompt, "MOBILE")` →
  `screen.getHtml()` / `getImage()` return **download URLs** (NOT content).
  HTML from `contribution.usercontent.google.com`, screenshots from
  `lh3.googleusercontent.com` — both must stay in `ALLOWED_DOWNLOAD_HOSTS`.
- `getHtml()` can transiently throw (`get_screen: invalid argument`) while the
  cache warms; bounded retries (3 × 15s) already handle this.
- One generation takes ~60–120s. That's why generation is a job, polled via
  `GET /api/generations/[jobId]`, never a held HTTP request.
- **Image attachments:** `project.upload(filePath)` (PNG/JPG/WEBP, *file path
  not bytes*) creates a screen from the image; `uploadedScreen.edit(prompt)`
  turns it into the design. Verified live 10 Oct 2026 via
  `npm run stitch:upload-spike` (upload → edit → HTML, ~134s). Our adapter
  falls back to plain text generation if any of that fails — attachments must
  never block a page.
- **Voice/audio: not supported by the SDK.** Deferred until the owner approves
  a transcription key. Do not fake it.
- `screen.edit` optionally takes `modelId` (GEMINI_3_*) — Stitch-side only; we
  use the default. Do not add AI SDK dependencies.

## Decisions log (do not silently reverse)

- **2026-10-10 — Unlimited usage (beta).** `LIMITS` defaults in `config.ts`
  and `.env.example` are effectively unbounded (999999) for generations per
  session/IP/day and revisions. The counting/limiting infrastructure is fully
  intact (`limits.ts`, `bump_counter`, 429 paths, UI states) — re-tightening is
  an env-var change only. Never delete that infrastructure.
- **2026-10-10 — Prompt passthrough.** The form is prompt-only (+ optional
  image). To/From/Tone/Language fields were removed; their DB columns remain
  (nullable/legacy) so old rows still render. The user's words go to Stitch
  verbatim inside `buildPrompt`, plus quality direction and the technical
  constraints the sanitizer allows (one plain-CSS `<style>` block, no CDN, no
  external anything, emoji/CSS-shape imagery, system fonts).
- **2026-10-10 — Rich-CSS sanitizer allowlist.** Custom properties + `var()`,
  `@keyframes`, animation/transition/filter/text-shadow/gradient properties
  are allowed. `url()`, `@import`, `image()`, `expression()`, escapes and
  `!important` stay banned everywhere (including inside custom-property
  values). `img`/`<svg>`/`@font-face` remain stripped.
- **Attachments are design references only.** They are uploaded to Stitch;
  they never appear inside published pages (no `<img>` in sanitized HTML).
  First-party image serving (CSP `img-src 'self'` + storage renderer) is a
  future feature requiring explicit owner approval.
- **Language auto-detects** from the prompt (Malay marker words in
  `detectLanguage`); the `lang` attribute defaults to `en`.

## Known pitfalls

- `next-env.d.ts` flips between `.next/types` and `.next/dev/types` paths
  depending on dev vs build — leave it to tooling; don't hand-edit.
- Until migration 0002 runs, `pages.tone` is NOT NULL and `pages.language` is
  NOT NULL with a default: inserts must send a tone placeholder and omit
  language (see `pageRow()` in `store.ts`). `attachment_path`/`attachment_mime`
  keys are only sent when set, for the same reason.
- Without migration 0002, attached images are silently dropped (generation
  continues text-only) — `npm run doctor` catches the missing migration.
- `JOBS_MODE=inline` runs jobs in-process right after the response; production
  uses `JOBS_MODE=supabase` (pg_net dispatch + cron sweep), which additionally
  requires the `app_config.worker_url`/`jobs_secret` rows to match `JOBS_SECRET`.
- Vercel Hobby Fluid Compute caps functions at 300s — the worker is configured
  for exactly that; don't add sleeps.
- The IP limit in the generations route is `LIMITS.generationsPerIpDay`
  (env `GENERATIONS_PER_IP_DAY`), not the old hardcoded 3.

## Definition of done for changes here

`npm run doctor` (all Supabase checks) + `npm run typecheck` + `npm test` +
`npm run build` green; sanitizer/CSP behavior only ever tightened with tests;
README release checks re-run for anything touching the publish path.
