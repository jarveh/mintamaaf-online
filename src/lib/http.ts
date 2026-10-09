import { NextResponse, type NextRequest } from "next/server";
import { APP_ORIGIN, PUBLIC_PAGE_ORIGIN } from "./config";
import { currentOwnerToken, ownsPage } from "./owner";
import { getPage } from "./store";
import type { PageRecord } from "./types";

export function error(message: string, status = 400) { return NextResponse.json({ error: message }, { status }); }
export function appRequest(request: NextRequest): boolean {
  const expected = new URL(APP_ORIGIN);
  return request.nextUrl.host === expected.host && request.nextUrl.protocol === expected.protocol;
}
export function mutationAllowed(request: NextRequest): boolean {
  return appRequest(request) && request.headers.get("origin") === APP_ORIGIN;
}
export function publicPageUrl(slug: string): string { return `${PUBLIC_PAGE_ORIGIN}/p/${slug}`; }

export async function ownedPage(id: string): Promise<PageRecord | null> {
  const page = await getPage(id);
  return page && ownsPage(page.ownerHash, await currentOwnerToken()) ? page : null;
}

export function safeId(id: string): boolean { return /^[0-9a-f]{8}-[0-9a-f-]{27,40}$/i.test(id); }
