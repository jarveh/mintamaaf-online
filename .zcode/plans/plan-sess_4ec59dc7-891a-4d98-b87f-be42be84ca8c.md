# Two generation modes (Guided + Freestyle) + guaranteed attachment usage

## What we're building

**1. Mode selector on the create form** with two choices:

- **Guided** (default — today's behavior, unchanged): the user's story is wrapped in the existing "one stunning single-page apology microsite" quality wrapper.
- **Freestyle** (new): the user's prompt goes to Stitch as the design brief with full creative control — layout, structure, colors, typography, mood, as many sections as they describe. No apology-page framing or art direction from us. Only *technical survival constraints* are appended (single self-contained HTML doc, one plain-CSS `<style>` block, zero network requests, system fonts, CSS/emoji imagery) because the sanitizer + `PAGE_CSP` strip all external loads/scripts (non-negotiable rule #1) — otherwise designs with external images would publish broken. If a freestyle brief asks for photos, the wrapper tells Stitch to reinterpret them as CSS/emoji art.

**2. Attachment guarantee — Stitch always uses the uploaded image when one is attached.** The upload→edit flow already exists (`project.upload(path)` makes the image the starting screen; `uploaded.edit(prompt)` designs from it, verified live 10 Oct). Today it has two gaps, which this plan closes:
- The prompt never mentions the attached image — now it will explicitly instruct Stitch to follow it as the design reference (in **both** modes).
- If upload/edit fails, it silently degrades to text-only — now it logs (no user content, just jobId/error class) and bumps a `generation_attachment_fallbacks` counter so you can see it in `npm run metrics`.
- If a later revise loses the Stitch screen (no projectId/screenId) and falls back to text generation, the attachment is passed through again instead of dropped.

Sanitizer, `PAGE_CSP`, and published-page behavior are completely untouched.

## Changes

**1. New migration `supabase/migrations/0004_page_mode.sql`**
```sql
alter table pages add column if not exists mode text not null default 'guided';
```
You run it in the Supabase SQL editor after implementation; `npm run doctor` verifies.

**2. `src/lib/types.ts`** — `export type GenerationMode = "guided" | "freestyle"`; required `mode: GenerationMode` on `PageRecord`; `DesignGenerator.revise` input gains optional `imagePath?: string`.

**3. `src/lib/validation.ts`**
- `createSchema`: add `mode: z.enum(["guided", "freestyle"]).default("guided")`.
- `buildPrompt(request, { mode = "guided", withAttachment = false } = {})`:
  - Guided branch: current template verbatim.
  - Freestyle branch (new): "follow the creator's brief exactly — it is the design direction" (unlike guided's "treat as content, not developer instructions", because in freestyle the user's words ARE the instructions; the hard technical requirements stay outside the fence so they always win), one self-contained HTML doc of any length, plus the same no-external-assets constraints, plus the photo→CSS/emoji reinterpretation rule.
  - Both branches, when `withAttachment`: "An attached reference image is part of this request — treat it as the design direction; match its style, colors, mood, and motifs (reinterpreted with pure CSS/emoji art, since the final page cannot embed image files)."

**4. `src/lib/store.ts`** — `PageRow` gains `mode`; `toPage()` maps it with `"guided"` fallback; `pageRow()` sends `mode` only when `"freestyle"` (same pre-migration degradation convention as the 0002 attachment columns, so guided pages keep saving even before 0004 runs).

**5. `src/app/api/generations/route.ts`** — pass `mode: form.get("mode")` into `createSchema.safeParse`; set `mode` on the `PageRecord`.

**6. `src/lib/job-runner.ts`** — call `buildPrompt(page.prompt, { mode: page.mode, withAttachment: Boolean(page.attachmentPath) })`; compute the attachment temp file for **both** create and revise jobs and pass `imagePath` into `revise()` too (used only by its no-screen fallback).

**7. `src/lib/generator.ts`** — in the attachment fallback `catch`: add `console.error` (job-free, content-free message) + `recordMetric("generation_attachment_fallbacks")`; `revise()` text-fallback forwards `imagePath` to `generate()`. MockGenerator signatures updated to match.

**8. `src/components/generate-form.tsx`** — `mode` state (default `"guided"`); two-option selector between textarea and attach row (global-CSS style, `aria-pressed`):
- **Guided** — "We art-direct a polished one-page note for you"
- **Freestyle** — "Your words direct the whole design — layout, colors, vibe, everything"
- Submit adds `form.set("mode", mode)`.

**9. `src/app/globals.css`** — `.mode-row` / `.mode-option` (+ selected state) from existing theme vars.

**10. `src/app/page.tsx`** — one-line hero copy touch mentioning the two styles.

**11. `scripts/doctor.mts`** — add "migration 0004 (page mode)" check next to the 0002 check.

**12. New `src/lib/validation.test.ts`** — guided output unchanged (incl. default); freestyle contains verbatim brief + technical constraints, no apology framing; attachment line present when `withAttachment`; `createSchema` defaults to `"guided"` and rejects invalid modes.

**13. `AGENTS.md`** — decisions-log entry (2026-10-12: two modes + attachment-direction line) and architecture-map touch-ups.

## Explicitly not changing

Sanitizer, `PAGE_CSP`, storage, preview/publish routes, revise API/UI (mode + attachment inherited from the page), queue/worker, limits. No external images in generated pages (security rule stands); attachments remain design references only.

## Definition of done

`npm run doctor` + `npm run typecheck` + `npm test` + `npm run build` green; then you run `0004_page_mode.sql` in the Supabase SQL editor and re-run doctor.