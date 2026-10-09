import { type NextRequest } from "next/server";
import { PUBLIC_PAGE_ORIGIN } from "@/lib/config";
import { PAGE_CSP } from "@/lib/sanitize";
import { getPageBySlug, getVersion, loadHtml } from "@/lib/store";

export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  if (request.nextUrl.origin !== PUBLIC_PAGE_ORIGIN) return unavailable();
  const { slug } = await params;
  if (!/^[A-Za-z0-9_-]{16}$/.test(slug)) return unavailable();
  const page = await getPageBySlug(slug);
  if (!page || page.status !== "published" || !page.activeVersion || !page.expiresAt || Date.parse(page.expiresAt) <= Date.now()) return unavailable();
  const version = await getVersion(page.id, page.activeVersion);
  const html = version && await loadHtml(version.htmlPath);
  if (!html) return unavailable();
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Content-Security-Policy": PAGE_CSP, "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer", "Cache-Control": "no-store" } });
}

function unavailable(): Response {
  return new Response("<!doctype html><html><head><meta name=viewport content=\"width=device-width,initial-scale=1\"><title>Page unavailable</title></head><body style=\"font-family:system-ui;padding:3rem;text-align:center\"><h1>This page is unavailable</h1><p>It may have expired or been removed.</p></body></html>", { status: 404, headers: { "Content-Type": "text/html; charset=utf-8", "Content-Security-Policy": PAGE_CSP, "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer", "Cache-Control": "no-store" } });
}
