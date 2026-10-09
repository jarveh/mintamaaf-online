import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { COOKIE_NAME } from "./config";

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function newOwnerToken(): string {
  return randomBytes(32).toString("base64url");
}

export async function currentOwnerToken(): Promise<string | undefined> {
  return (await cookies()).get(COOKIE_NAME)?.value;
}

export function ownsPage(storedHash: string, token?: string): boolean {
  if (!token || !/^[A-Za-z0-9_-]{40,50}$/.test(token)) return false;
  return timingSafeEqual(Buffer.from(storedHash, "hex"), Buffer.from(hashToken(token), "hex"));
}

export function ownerCookie(token: string) {
  return {
    name: COOKIE_NAME,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  };
}
