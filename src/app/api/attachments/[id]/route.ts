import { type NextRequest } from "next/server";
import { ATTACHMENT_MIMES } from "@/lib/config";
import { safeId } from "@/lib/http";
import { getPage, loadAttachment } from "@/lib/store";

// Serves a page's attached photo first-party so sanitized pages can embed it
// (the only img src the sanitizer allows). Published pages and draft previews
// fetch it from the isolated page origin, so this route is intentionally
// public with no app-origin or cookie gate: the id is an unguessable page UUID
// (same trust model as the /p/{slug} link), and blocked or expired pages stop
// serving immediately. The daily cleanup also deletes the stored object.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const page = safeId(id) ? await getPage(id) : null;
  if (!page || page.status === "blocked" || !page.attachmentPath || !page.attachmentMime) return new Response("Not found", { status: 404 });
  if (!ATTACHMENT_MIMES.includes(page.attachmentMime)) return new Response("Not found", { status: 404 });
  if (page.expiresAt && Date.parse(page.expiresAt) < Date.now()) return new Response("Not found", { status: 404 });
  const bytes = await loadAttachment(page.attachmentPath);
  if (!bytes) return new Response("Not found", { status: 404 });
  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": page.attachmentMime,
      "Content-Length": String(bytes.byteLength),
      "Content-Disposition": "inline",
      // Cacheable but private: recipients' browsers may reuse it, shared
      // caches and proxies may not.
      "Cache-Control": "private, max-age=600",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
