import { describe, expect, it } from "vitest";
import { PAGE_CSP, sanitizeGeneratedHtml } from "./sanitize";

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

  it("keeps expressive plain CSS: custom properties, gradients, keyframes, shadows, filters", () => {
    const css = `:root{--ink:#22303f;--accent:#e2725b}body{background:linear-gradient(180deg,#eef4fb,#ffffff);color:var(--ink)}h1{text-shadow:0 2px 8px rgba(0,0,0,.15);filter:drop-shadow(0 4px 6px rgba(0,0,0,.1))}.card{background:#fff;border-radius:24px;box-shadow:0 10px 30px rgba(34,48,63,.12)}@keyframes float-in{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}.card{animation:float-in .6s ease-out both}p{font-family:Georgia,serif}`;
    const clean = sanitizeGeneratedHtml(`<style>${css}</style><main><h1>Dear Sam</h1><div class="card"><p>I hope your day was wonderful from start to finish.</p></div></main>`);
    expect(clean).toContain("--ink:#22303f");
    expect(clean).toContain("linear-gradient(180deg,#eef4fb,#ffffff)");
    expect(clean).toContain("text-shadow:0 2px 8px");
    expect(clean).toContain("@keyframes float-in");
    expect(clean).toContain("animation:float-in .6s ease-out both");
    expect(clean).toContain("Georgia,serif");
  });

  it("still drops network loads hidden in custom properties or filter functions", () => {
    const clean = sanitizeGeneratedHtml("<style>:root{--pixel:url(https://evil.example/p);--safe:#fff}body{background:var(--pixel);color:var(--safe)}.x{filter:url(https://evil.example/f)}</style><main><p class='x'>A sincere note that stays fully self contained here.</p></main>");
    expect(clean).not.toContain("evil.example");
    expect(clean).not.toContain("url(");
    expect(clean).toContain("--safe:#fff");
  });

  it("drops non-media and malformed at-rules while keeping keyframes", () => {
    const clean = sanitizeGeneratedHtml("<style>@font-face{font-family:steal;src:url(https://evil.example/f.woff2)}@import 'https://evil.example/x.css';@charset 'x';@keyframes good{from{opacity:0}to{opacity:1}}@keyframes bad name here{from{opacity:0}}.y{animation:good 1s both}</style><main><p class='y'>Another sincere little note that must stay safe.</p></main>");
    expect(clean).not.toContain("evil.example");
    expect(clean).toContain("@keyframes good");
    expect(clean).not.toContain("bad name");
    expect(clean).not.toContain("@font-face");
    expect(clean).not.toContain("@import");
  });
});

describe("attached photo boundary", () => {
  const NOTE = "<style>body{color:#333}</style><main><h1>Dear Sam</h1><p>I am sorry I missed your birthday party last weekend.</p></main>";

  it("still strips every image when no attachment is allowed", () => {
    const clean = sanitizeGeneratedHtml(`${NOTE}<img src="/api/attachments/p1" alt="photo">`);
    expect(clean).not.toContain("<img");
  });

  it("lets exactly the attached photo through and rebuilds its attributes", () => {
    const src = "/api/attachments/1c0ffee0-dead-4bef-babe-000000000001";
    const dirty = `<style>body{color:#333}</style><main><figure class="frame"><img src="${src}" alt="Us at the pier" width="800" height="600" class="photo polaroid" style="border:2px solid red" srcset="${src} 2x" onerror="alert(1)" data-x="1"><figcaption>Miss you</figcaption></figure><p>I am sorry I missed your birthday party last weekend.</p></main>`;
    const clean = sanitizeGeneratedHtml(dirty, "en", { attachmentSrc: src });
    expect(clean).toContain(`<img src="${src}"`);
    expect(clean).toContain('alt="Us at the pier"');
    expect(clean).toContain('width="800"');
    expect(clean).toContain('height="600"');
    expect(clean).toContain('class="photo polaroid"');
    expect(clean).not.toContain("onerror");
    expect(clean).not.toContain("srcset");
    expect(clean).not.toContain("data-x");
    expect(clean).not.toContain("style=");
  });

  it("keeps an attached photo with no attributes beyond its src", () => {
    const src = "/api/attachments/1c0ffee0-dead-4bef-babe-000000000001";
    const clean = sanitizeGeneratedHtml(`${NOTE}<img src="${src}">`, "en", { attachmentSrc: src });
    expect(clean).toContain(`<img src="${src}"`);
    expect((clean.match(/<img/g) || []).length).toBe(1);
  });

  it("neutralizes every other image src: external, data, protocol-relative, token, wrong path", () => {
    const src = "/api/attachments/1c0ffee0-dead-4bef-babe-000000000001";
    const dirty = `<style>body{color:#333}</style><main><p>I am sorry I missed your birthday party last weekend.</p><img src="https://lh3.googleusercontent.com/a.png"><img src="data:image/png;base64,AAAA"><img src="//evil.example/a.png"><img src="__MINTAMAAF_ATTACHMENT__"><img src="/api/attachments/other-page"></main>`;
    const clean = sanitizeGeneratedHtml(dirty, "en", { attachmentSrc: src });
    expect(clean).not.toContain("<img");
    expect(clean).not.toContain("lh3.googleusercontent");
    expect(clean).not.toContain("data:image");
    expect(clean).not.toContain("evil.example");
    expect(clean).not.toContain("__MINTAMAAF_ATTACHMENT__");
  });

  it("keeps external loads banned while allowing only first-party images", () => {
    expect(PAGE_CSP).toContain("default-src 'none'");
    expect(PAGE_CSP).toContain("img-src 'self'");
    expect(PAGE_CSP).not.toMatch(/img-src[^;]*\*/);
  });
});
