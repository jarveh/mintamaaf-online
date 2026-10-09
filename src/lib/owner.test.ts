import { describe, expect, it } from "vitest";
import { hashToken, newOwnerToken, ownsPage } from "./owner";
import { makePreviewToken, validPreviewToken } from "./preview-token";

describe("anonymous ownership", () => {
  it("accepts only the creating browser token", () => {
    const token = newOwnerToken();
    expect(ownsPage(hashToken(token), token)).toBe(true);
    expect(ownsPage(hashToken(token), newOwnerToken())).toBe(false);
    expect(ownsPage(hashToken(token), undefined)).toBe(false);
  });

  it("binds a short-lived preview token to its page", () => {
    process.env.PREVIEW_SIGNING_KEY = "a-test-key-that-is-only-used-in-unit-tests";
    const pageId = crypto.randomUUID();
    const token = makePreviewToken(pageId, 2);
    expect(validPreviewToken(token, pageId)).toBe(2);
    expect(validPreviewToken(token, crypto.randomUUID())).toBeNull();
    expect(validPreviewToken(`${token}x`, pageId)).toBeNull();
  });
});
