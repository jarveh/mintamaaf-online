import { type NextRequest } from "next/server";
import { appRequest, ownedPage, safeId } from "@/lib/http";
import { getVersion, loadScreenshot } from "@/lib/store";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!appRequest(request)) return new Response("Not found", { status: 404 });
  const { id } = await params;
  if (!safeId(id)) return new Response("Not found", { status: 404 });
  const page = await ownedPage(id);
  if (!page || page.status === "blocked" || page.latestVersion < 1) return new Response("Not found", { status: 404 });
  const version = await getVersion(id, page.latestVersion);
  if (!version?.screenshotPath) return new Response("Not found", { status: 404 });
  const bytes = await loadScreenshot(version.screenshotPath);
  if (!bytes) return new Response("Not found", { status: 404 });
  return new Response(Buffer.from(bytes), { headers: { "Content-Type": version.screenshotPath.endsWith(".jpg") ? "image/jpeg" : "image/png", "X-Content-Type-Options": "nosniff", "Cache-Control": "private, no-store" } });
}
