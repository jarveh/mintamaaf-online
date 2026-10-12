import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/config";

// Main app pages only. Published apology pages (/p/:slug) are personal,
// expiring content served with X-Robots-Tag: noindex — never listed here.
export default function sitemap(): MetadataRoute.Sitemap {
  const entries: Array<{ path: string; priority: number; changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"] }> = [
    { path: "/", priority: 1, changeFrequency: "weekly" },
    { path: "/create", priority: 0.9, changeFrequency: "weekly" },
    { path: "/privacy", priority: 0.3, changeFrequency: "monthly" },
    { path: "/terms", priority: 0.3, changeFrequency: "monthly" },
    { path: "/report", priority: 0.3, changeFrequency: "monthly" },
  ];
  return entries.map(({ path, priority, changeFrequency }) => ({
    url: new URL(path, SITE_URL).toString(),
    lastModified: new Date(),
    changeFrequency,
    priority,
  }));
}
