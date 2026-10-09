import { createHmac, timingSafeEqual } from "node:crypto";
import { required } from "./config";

function sign(payload: string): string { return createHmac("sha256", required("PREVIEW_SIGNING_KEY")).update(payload).digest("base64url"); }

export function makePreviewToken(pageId: string, version: number): string {
  const payload = `${pageId}.${version}.${Math.floor(Date.now() / 1000) + 600}`;
  return `${payload}.${sign(payload)}`;
}

export function validPreviewToken(token: string, pageId: string): number | null {
  const parts = token.split(".");
  if (parts.length !== 4 || parts[0] !== pageId) return null;
  const version = Number(parts[1]);
  const expiry = Number(parts[2]);
  if (!Number.isSafeInteger(version) || version < 1 || !Number.isSafeInteger(expiry) || expiry < Date.now() / 1000) return null;
  const actual = Buffer.from(parts[3]);
  const expected = Buffer.from(sign(parts.slice(0, 3).join(".")));
  return actual.length === expected.length && timingSafeEqual(actual, expected) ? version : null;
}
