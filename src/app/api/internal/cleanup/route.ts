import { NextResponse, type NextRequest } from "next/server";
import { required } from "@/lib/config";
import { deletePageData, getPage, redis } from "@/lib/store";

export async function GET(request: NextRequest) {
  if (request.headers.get("authorization") !== `Bearer ${required("CRON_SECRET")}`) return new Response("Unauthorized", { status: 401 });
  const ids = await redis.zrange<string[]>("pages:cleanup", 0, Date.now(), { byScore: true, offset: 0, count: 25 });
  let deleted = 0;
  for (const id of ids) {
    const page = await getPage(id);
    if (!page) { await redis.zrem("pages:cleanup", id); continue; }
    if (page.status === "published" && page.expiresAt && Date.parse(page.expiresAt) > Date.now()) continue;
    try { await deletePageData(page); deleted++; }
    catch (cause) { console.error("cleanup failed", { pageId: id, message: cause instanceof Error ? cause.message : "unknown" }); }
  }
  return NextResponse.json({ deleted });
}
