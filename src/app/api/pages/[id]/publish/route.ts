import { NextResponse, type NextRequest } from "next/server";
import { LIMITS } from "@/lib/config";
import { error, mutationAllowed, ownedPage, publicPageUrl, safeId } from "@/lib/http";
import { getVersion, savePage } from "@/lib/store";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!mutationAllowed(request)) return error("Invalid origin", 403);
  const { id } = await params;
  if (!safeId(id)) return error("Not found", 404);
  const page = await ownedPage(id);
  if (!page) return error("Not found", 404);
  if (page.status === "blocked") return error("This page cannot be published", 403);
  if (page.latestVersion < 1 || !(await getVersion(id, page.latestVersion))) return error("Page is not ready", 409);
  page.activeVersion = page.latestVersion;
  page.status = "published";
  page.publishedAt = new Date().toISOString();
  page.expiresAt = new Date(Date.now() + LIMITS.expiryDays * 86_400_000).toISOString();
  await savePage(page);
  return NextResponse.json({ publicUrl: publicPageUrl(page.slug) });
}
