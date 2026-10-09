import { describe, expect, it } from "vitest";
import { sanitizeGeneratedHtml } from "./sanitize";

describe("generated HTML boundary", () => {
  it("keeps readable layout while removing executable and network features", () => {
    const html = `<!doctype html><html><head><style>@import url(https://evil.example/x.css);h1{color:#b33;background:url(https://evil.example/pixel)}@media(max-width:600px){h1{font-size:30px}}</style></head><body><main><h1 onclick="alert(1)">I'm sorry, Sarah</h1><p style="color:blue;background:url(https://evil.example/x)">I missed your birthday and hope we can talk.</p><script>alert(1)</script><form action="https://evil.example"><input name="secret"></form><a href="javascript:alert(1)">Forgive me</a></main></body></html>`;
    const clean = sanitizeGeneratedHtml(html);
    expect(clean).toContain("I'm sorry, Sarah");
    expect(clean).toContain("font-size:30px");
    expect(clean).not.toMatch(/<script|<form|<input|onclick|evil\.example|javascript:/i);
  });

  it("rejects credential capture content", () => {
    expect(() => sanitizeGeneratedHtml("<style>body{color:black}</style><main><h1>Please sign in</h1><p>Enter your password to read this apology and receive a gift.</p></main>")).toThrow("safety review");
  });

  it("rejects designs that rely only on remote styling", () => {
    expect(() => sanitizeGeneratedHtml("<script src='https://cdn.tailwindcss.com'></script><main class='p-8'>A thoughtful and sincere note that should be styled before publishing.</main>")).toThrow("no supported styling");
  });

  it("rejects oversized output", () => {
    expect(() => sanitizeGeneratedHtml("<p>" + "a".repeat(2_000_001) + "</p>")).toThrow("too large");
  });

  it("marks Malay output with the right document language", () => {
    const clean = sanitizeGeneratedHtml("<style>body{color:#333}</style><main><p>Saya benar-benar minta maaf atas kesilapan saya. Terima kasih kerana mendengar.</p></main>", "ms");
    expect(clean).toContain('<html lang="ms">');
  });
});
