# SEO Plan for Mintamaaf (mintamaaf.online)

Goal: make the main site look good on Google, add `sitemap.xml` + `robots.txt`, and wire up Google Analytics 4 on the main app — plus a step-by-step guide for you to register the site in Google Search Console & GA4.

## Scope decisions (defaults I chose)
- **Published apology pages (`/p/:slug`) will be `noindex`** (via `X-Robots-Tag` header). They contain personal stories, expire in 7 days, and their CSP is non-negotiable. The sitemap lists only the main site pages.
- **GA4 goes on main app pages only** (`/`, `/create`, `/privacy`, `/terms`, `/report`). Never on published pages — their CSP (`script-src 'none'`) stays untouched.
- `/preview/[id]` and `/draft/[id]` get `noindex` too (private, token-gated).

## Code changes

1. **Richer metadata** — `src/app/layout.tsx`
   - Add `metadataBase` (from a new `NEXT_PUBLIC_SITE_URL` env var, defaulting to `APP_ORIGIN`), `title.template` (`%s — Mintamaaf`), openGraph + twitter card fields, `alternates.canonical`, `robots` directives, and explicit `icons` (favicon/icon/apple-icon already exist via file conventions).

2. **Sitemap** — new `src/app/sitemap.ts`
   - Next.js Metadata Route generating `sitemap.xml` for `/`, `/create`, `/privacy`, `/terms`, `/report` with `lastModified` and `changeFrequency`/`priority`.

3. **Robots** — new `src/app/robots.ts`
   - Allow all on the main origin, disallow `/api/`, `/p/`, `/draft/`, `/preview/`, and point to the sitemap URL. (Note: `/p/:slug` is served from a separate page origin in production — the header in step 4 is the real enforcement there; robots.txt covers both.)

4. **Noindex published/private pages** — `src/app/p/[slug]/route.ts` + `src/app/draft/[id]/route.ts`
   - Add `X-Robots-Tag: noindex, nofollow` to responses (success and 404 fallbacks). No CSP changes.
   - Also add `X-Robots-Tag: noindex` to `/preview/[id]` via its page metadata (`robots: { index: false }`).

5. **GA4** — new `src/components/analytics.tsx` + `.env.example`
   - Install `@next/third-parties` and render `GoogleAnalytics(gaId)` in `layout.tsx` only when `NEXT_PUBLIC_GA_ID` is set — so nothing changes locally and no fake ID is committed. Add `NEXT_PUBLIC_GA_ID=` to `.env.example`. App pages currently have no CSP, so the GA scripts load without any header changes.

6. **OG image** — new `public/og.png` (1200×630)
   - Generate a branded card from the existing `logo-full.png` / brand colors with a small one-off script, referenced in openGraph metadata. If that's flaky, fall back to referencing `logo-full.png` directly.

7. **Docs** — update `.env.example` (+ short note in README if one exists) and add the setup guide below to the final summary.

## Definition of done
`npm run typecheck` + `npm test` + `npm run build` green; `npm run doctor` still passes (no DB/schema changes). Sanitizer and `PAGE_CSP` untouched.

## Guide for you (after I ship the code) — I'll walk you through:
1. **Google Search Console**: create property for `https://mintamaaf.online`, verify via DNS TXT record on your domain's DNS, submit `https://mintamaaf.online/sitemap.xml`.
2. **GA4**: create property → web data stream for `mintamaaf.online` → copy the `G-XXXXXXX` Measurement ID → set `NEXT_PUBLIC_GA_ID` in Vercel env vars → redeploy. Verify real-time events in GA4.
