import { NextResponse, type NextRequest } from "next/server";
import { error, mutationAllowed, ownedPage, safeId } from "@/lib/http";
import { savePage } from "@/lib/store";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!mutationAllowed(request)) return error("Invalid origin", 403);
  const { id } = await params;
  if (!safeId(id)) return error("Not found", 404);
  const page = await ownedPage(id);
  if (!page) return error("Not found", 404);
  if (page.status === "blocked") return error("Not found", 404);
  page.status = "unpublished";
  page.activeVersion = null;
  await savePage(page);
  return NextResponse.json({ ok: true });
}
