import { type NextRequest } from "next/server";
import { APP_ORIGIN, PUBLIC_PAGE_ORIGIN } from "@/lib/config";
import { validPreviewToken } from "@/lib/preview-token";
import { PAGE_CSP } from "@/lib/sanitize";
import { getPage, getVersion, loadHtml } from "@/lib/store";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (request.nextUrl.origin !== PUBLIC_PAGE_ORIGIN) return new Response("Not found", { status: 404 });
  const { id } = await params;
  const version = validPreviewToken(request.nextUrl.searchParams.get("token") || "", id);
  if (!version) return new Response("Preview expired", { status: 404 });
  const page = await getPage(id);
  if (!page || page.status === "blocked") return new Response("Preview unavailable", { status: 404 });
  const record = await getVersion(id, version);
  const html = record && await loadHtml(record.htmlPath);
  if (!html) return new Response("Preview unavailable", { status: 404 });
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Content-Security-Policy": PAGE_CSP.replace("frame-ancestors 'none'", `frame-ancestors ${APP_ORIGIN}`), "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer", "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow" } });
}
