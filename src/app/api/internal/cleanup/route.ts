import { NextResponse, type NextRequest } from "next/server";
import { required } from "@/lib/config";
import { deletePageData, getPage } from "@/lib/store";
import { supabase } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  if (request.headers.get("authorization") !== `Bearer ${required("CRON_SECRET")}`) return new Response("Unauthorized", { status: 401 });
  const { data: due, error } = await supabase.from("pages").select("id").lt("cleanup_at", new Date().toISOString()).limit(25);
  if (error) throw error;
  let deleted = 0;
  for (const { id } of due as { id: string }[]) {
    const page = await getPage(id);
    if (!page) continue;
    if (page.status === "published" && page.expiresAt && Date.parse(page.expiresAt) > Date.now()) continue;
    try { await deletePageData(page); deleted++; }
    catch (cause) { console.error("cleanup failed", { pageId: id, message: cause instanceof Error ? cause.message : "unknown" }); }
  }
  try {
    await supabase.from("idempotency_keys").delete().lt("created_at", new Date(Date.now() - 2 * 86_400_000).toISOString());
    await supabase.from("usage_counters").delete().lt("period", new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10));
  } catch (cause) { console.error("counter purge failed", cause); }
  return NextResponse.json({ deleted });
}
