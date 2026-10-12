import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/config";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/p/", "/draft/", "/preview/"],
      },
    ],
    sitemap: new URL("/sitemap.xml", SITE_URL).toString(),
  };
}
