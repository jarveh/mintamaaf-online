import { NextResponse, type NextRequest } from "next/server";
import { PUBLIC_PAGE_ORIGIN } from "@/lib/config";
import { appRequest, error, ownedPage, safeId } from "@/lib/http";
import { makePreviewToken } from "@/lib/preview-token";
import { getVersion } from "@/lib/store";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!appRequest(request)) return error("Not found", 404);
  const { id } = await params;
  if (!safeId(id)) return error("Not found", 404);
  const page = await ownedPage(id);
  if (!page || page.status === "blocked" || page.latestVersion < 1) return error("Not found", 404);
  const version = await getVersion(id, page.latestVersion);
  return NextResponse.json({ previewUrl: `${PUBLIC_PAGE_ORIGIN}/draft/${id}?token=${makePreviewToken(id, page.latestVersion)}`, page: { id, tone: page.tone, language: page.language, status: page.status, latestVersion: page.latestVersion, activeVersion: page.activeVersion, revisionCount: page.revisionCount, expiresAt: page.expiresAt, slug: page.slug, screenshotAvailable: Boolean(version?.screenshotPath) } }, { headers: { "Cache-Control": "no-store" } });
}
