import type { MetadataRoute } from "next";
import { getPublicSiteUrl } from "@/lib/site-url";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = getPublicSiteUrl();
  return ["/", "/privacidade", "/termos"].map((path) => ({ url: `${base}${path}`, changeFrequency: path === "/" ? "weekly" : "yearly", priority: path === "/" ? 1 : 0.3 }));
}
