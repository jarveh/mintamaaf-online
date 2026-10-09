import { NextResponse, type NextRequest } from "next/server";
import { error, mutationAllowed } from "@/lib/http";
import { ipAllowed, recordMetric } from "@/lib/limits";
import { getPageBySlug, redis } from "@/lib/store";
import { reportSchema } from "@/lib/validation";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!mutationAllowed(request)) return error("Invalid origin", 403);
  const { id: slug } = await params;
  const parsed = reportSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return error("Choose a report reason");
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!(await ipAllowed(ip, "report", 5))) return error("Too many reports", 429);
  const page = await getPageBySlug(slug);
  if (page) {
    await redis.lpush("reports:pending", { pageId: page.id, reason: parsed.data.reason, createdAt: new Date().toISOString() });
    await recordMetric("reports");
  }
  return NextResponse.json({ ok: true });
}
