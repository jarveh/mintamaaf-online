import "server-only";
import { stitch } from "@google/stitch-sdk";
import { recordMetric } from "./limits";
import type { DesignGenerator, DesignResult, GenerationMode } from "./types";

const MAX_HTML_BYTES = 2_000_000;
// Verified Stitch 0.3.5 download hosts: HTML on *.usercontent.google.com, screenshots on lh3.googleusercontent.com.
const ALLOWED_DOWNLOAD_HOSTS = ["storage.googleapis.com", "googleusercontent.com", "googleapis.com", "usercontent.google.com"];
// Stitch marks "an image goes here" in generated HTML with its own placeholder
// asset instead of copying our prompt's token verbatim (observed live 12 Oct
// 2026). We never fetch it — the job runner re-points such srcs at the page's
// first-party attachment URL, which is the only img the sanitizer allows.
const STITCH_IMAGE_PLACEHOLDER = "https://www.gstatic.com/labs-code/stitch/stitch-placeholder-";

function trustedDownloadUrl(raw: string): URL {
  const url = new URL(raw);
  if (url.protocol !== "https:" || url.username || url.password || url.port) throw new Error("Unsafe provider download URL");
  if (!ALLOWED_DOWNLOAD_HOSTS.some((domain) => url.hostname === domain || url.hostname.endsWith(`.${domain}`))) {
    throw new Error("Unrecognized provider download host");
  }
  return url;
}

// Used by the job runner to spot provider-hosted images inside generated HTML
// (the attachment fallback rewrite): provider download hosts, or Stitch's own
// placeholder asset. Anything else is false.
export function isProviderEmbeddedImageSrc(raw: string): boolean {
  if (raw.startsWith(STITCH_IMAGE_PLACEHOLDER)) return true;
  try {
    trustedDownloadUrl(raw);
    return true;
  } catch {
    return false;
  }
}

// Freestyle briefs art-direct their own wide layouts, so Stitch designs them on
// a desktop canvas; guided stays phone-first. Applied to every generation and
// edit call so a page and its revisions keep the same canvas.
function deviceType(mode?: GenerationMode): "MOBILE" | "DESKTOP" {
  return mode === "freestyle" ? "DESKTOP" : "MOBILE";
}

// getHtml() normally returns a cached download URL from the generation response,
// but when it is missing the get_screen fallback races the backend and can fail
// transiently; a short bounded retry keeps that off the permanent-failure path.
async function resolveDownloadUrl(fetchUrl: () => Promise<string>, what: string): Promise<string> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const url = await fetchUrl();
      if (url) return url;
      lastError = new Error(`Stitch did not return ${what}`);
    } catch (cause) { lastError = cause; }
    await new Promise((resolve) => setTimeout(resolve, 15_000));
  }
  throw lastError instanceof Error ? lastError : new Error(`Stitch did not return ${what}`);
}

async function providerDownload(raw: string, maxBytes: number): Promise<Uint8Array> {
  const url = trustedDownloadUrl(raw);
  const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(15_000), cache: "no-store" });
  if (!response.ok || !response.body) throw new Error("Provider artifact download failed");
  if (Number(response.headers.get("content-length") || 0) > maxBytes) throw new Error("Provider artifact too large");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) { await reader.cancel(); throw new Error("Provider artifact too large"); }
    chunks.push(value);
  }
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength; }
  return result;
}

async function fromScreen(projectId: string, screen: { id: string; getHtml(): Promise<string>; getImage(): Promise<string> }): Promise<DesignResult> {
  const htmlUrl = await resolveDownloadUrl(() => screen.getHtml(), "HTML");
  const html = new TextDecoder().decode(await providerDownload(htmlUrl, MAX_HTML_BYTES));
  let screenshot: Uint8Array | undefined;
  try {
    const imageUrl = await resolveDownloadUrl(() => screen.getImage(), "screenshot");
    screenshot = await providerDownload(imageUrl, 4_000_000);
  } catch {
    // Screenshots are optional; the sanitized HTML remains usable.
  }
  return { provider: "stitch", projectId, screenId: screen.id, html, screenshot };
}

class StitchGenerator implements DesignGenerator {
  async generate(input: { prompt: string; imagePath?: string; mode?: GenerationMode }) {
    const project = await stitch.createProject("Mintamaaf page");
    // An attached image becomes a screen in the project; editing it with the
    // prompt turns the image into the design's starting point. Any failure in
    // that path falls back to a plain text generation — attachments are a
    // bonus, never a blocker, but the fallback is logged and counted so a
    // silently dropped attachment is visible in metrics.
    if (input.imagePath) {
      try {
        const [uploaded] = await project.upload(input.imagePath);
        if (uploaded) return await fromScreen(project.id, await uploaded.edit(input.prompt, deviceType(input.mode)));
        throw new Error("Stitch upload returned no screen");
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : "unknown";
        console.error("attachment upload failed; falling back to text-only generation", message.slice(0, 160));
        recordMetric("generation_attachment_fallbacks").catch(() => undefined);
      }
    }
    const screen = await project.generate(input.prompt, deviceType(input.mode));
    return fromScreen(project.id, screen);
  }

  async revise(input: { projectId?: string; screenId?: string; prompt: string; instruction: string; imagePath?: string; mode?: GenerationMode }) {
    if (!input.projectId || !input.screenId) return this.generate({ prompt: `${input.prompt}\nRevision: ${input.instruction}`, imagePath: input.imagePath, mode: input.mode });
    const project = stitch.project(input.projectId);
    const screen = await project.screen(input.screenId).edit(input.instruction, deviceType(input.mode));
    return fromScreen(project.id, screen);
  }
}

class MockGenerator implements DesignGenerator {
  async generate(input: { prompt: string; imagePath?: string; mode?: GenerationMode }): Promise<DesignResult> {
    const escaped = input.prompt.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
    return { provider: "mock", html: `<!doctype html><html><head><title>A little note</title><style>body{font-family:Georgia,serif;background:#fff7ee;color:#402f39;padding:3rem;max-width:44rem;margin:auto}h1{font-size:3rem}p{line-height:1.7}.demo{background:#ffe9a7;padding:1rem;border-radius:1rem}</style></head><body><p class="demo">Demo preview — generated without Stitch</p><h1>I'm sorry 💐</h1><p>${escaped}</p>${input.imagePath ? "<p>(An attached image would guide the design here.)</p>" : ""}<p>Thank you for hearing me out.</p></body></html>` };
  }
  async revise(input: { prompt: string; instruction: string; imagePath?: string; mode?: GenerationMode }) { return this.generate({ prompt: `${input.prompt}\n${input.instruction}`, imagePath: input.imagePath, mode: input.mode }); }
}

export function designGenerator(): DesignGenerator {
  if (process.env.MOCK_GENERATOR === "true") return new MockGenerator();
  if (!process.env.STITCH_API_KEY) throw new Error("STITCH_API_KEY is not configured");
  return new StitchGenerator();
}
