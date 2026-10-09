import { existsSync } from "node:fs";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");
if (!process.env.STITCH_API_KEY) throw new Error("Set STITCH_API_KEY before running the spike");
const { stitch } = await import("@google/stitch-sdk");
const started = Date.now();
const project = await stitch.createProject("Mintamaaf SDK spike");
const screen = await project.generate("A warm mobile apology note with a flower illustration, no scripts or forms", "MOBILE");
const htmlUrl = await screen.getHtml();
const imageUrl = await screen.getImage().catch(() => "");
const htmlResponse = await fetch(htmlUrl, { redirect: "error", signal: AbortSignal.timeout(15_000) });
if (!htmlResponse.ok) throw new Error(`HTML download failed: ${htmlResponse.status}`);
const html = await htmlResponse.text();
const edited = await screen.edit("Make the closing paragraph a little more personal", "MOBILE");
const editedHtmlUrl = await edited.getHtml();
const editedResponse = await fetch(editedHtmlUrl, { redirect: "error", signal: AbortSignal.timeout(15_000) });
if (!editedResponse.ok) throw new Error(`Edited HTML download failed: ${editedResponse.status}`);
const editedHtml = await editedResponse.text();
console.log(JSON.stringify({ sdkVersion: "0.3.5", projectId: project.id, screenId: screen.id, editedScreenId: edited.id, htmlUrlHost: new URL(htmlUrl).host, htmlBytes: Buffer.byteLength(html), editedHtmlBytes: Buffer.byteLength(editedHtml), screenshotUrlAvailable: Boolean(imageUrl), elapsedMs: Date.now() - started }, null, 2));
