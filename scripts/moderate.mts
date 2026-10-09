import { existsSync } from "node:fs";
if (existsSync(".env.local")) process.loadEnvFile(".env.local");
const { createClient } = await import("@supabase/supabase-js");
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
const supabase = createClient(url, key, { auth: { persistSession: false } });
const [action, pageId] = process.argv.slice(2);

if (action === "list") {
  const { data: reports, error } = await supabase
    .from("page_reports")
    .select("page_id, reason, created_at, pages(slug)")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  console.log(JSON.stringify(reports, null, 2));
} else if (action === "block" && pageId && /^[0-9a-f-]{36}$/i.test(pageId)) {
  const { data, error } = await supabase.from("pages").update({ status: "blocked", active_version: null }).eq("id", pageId).select("id");
  if (error) throw error;
  if (!data?.length) throw new Error("Page not found");
  console.log(`Blocked ${pageId}`);
} else if (action === "delete" && pageId && /^[0-9a-f-]{36}$/i.test(pageId)) {
  const { data: versions, error: versionsError } = await supabase.from("page_versions").select("html_path, screenshot_path").eq("page_id", pageId);
  if (versionsError) throw versionsError;
  const paths = (versions || []).flatMap((v) => [v.html_path, ...(v.screenshot_path ? [v.screenshot_path] : [])]);
  if (paths.length) await supabase.storage.from("pages").remove(paths);
  const { data, error } = await supabase.from("pages").delete().eq("id", pageId).select("id");
  if (error) throw error;
  if (!data?.length) throw new Error("Page not found");
  console.log(`Deleted ${pageId}`);
} else {
  console.error("Usage: npm run moderate -- list | block <page-id> | delete <page-id>");
  process.exitCode = 1;
}
