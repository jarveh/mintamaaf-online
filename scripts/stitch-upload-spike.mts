// Live check of the attachment flow: project.upload(path) + screen.edit(prompt).
// Consumes one generation. Usage: npm run stitch:upload-spike
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { crc32, deflateSync } from "node:zlib";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");
if (!process.env.STITCH_API_KEY) throw new Error("Set STITCH_API_KEY before running the spike");

// Hand-build a valid 96x96 pastel-blue PNG (no image libraries needed).
function png(width: number, height: number, r: number, g: number, b: number): Buffer {
  const raw = Buffer.alloc(height * (1 + width * 3));
  for (let y = 0; y < height; y++) {
    raw[y * (1 + width * 3)] = 0;
    for (let x = 0; x < width; x++) {
      const o = y * (1 + width * 3) + 1 + x * 3;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b;
    }
  }
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 2; // 8-bit, truecolor
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

const dir = mkdtempSync(join(tmpdir(), "upload-spike-"));
const filePath = join(dir, "reference.png");
writeFileSync(filePath, png(96, 96, 190, 220, 245));

const { stitch } = await import("@google/stitch-sdk");
const started = Date.now();
const project = await stitch.createProject("Mintamaaf upload spike");
const screens = await project.upload(filePath);
const uploaded = screens[0];
if (!uploaded) throw new Error("upload returned no screens");
const designed = await uploaded.edit("A soft pastel apology note inspired by this image's color", "MOBILE");
let htmlUrl = "";
for (let attempt = 0; attempt < 3 && !htmlUrl; attempt++) {
  try { htmlUrl = await designed.getHtml(); } catch { if (attempt === 2) throw new Error("getHtml failed after 3 attempts"); }
  if (!htmlUrl) await new Promise((resolve) => setTimeout(resolve, 15_000));
}
const response = await fetch(htmlUrl, { redirect: "error", signal: AbortSignal.timeout(15_000) });
const html = await response.text();
console.log(JSON.stringify({ projectId: project.id, uploadedScreenId: uploaded.id, designedScreenId: designed.id, htmlBytes: Buffer.byteLength(html), elapsedMs: Date.now() - started }, null, 2));
