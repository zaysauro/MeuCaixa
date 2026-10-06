import type { MetadataRoute } from "next";
import { getPublicSiteUrl } from "@/lib/site-url";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = getPublicSiteUrl();
  return ["/", "/privacidade", "/termos"].map((path) => ({ url: `${base}${path}`, lastModified: new Date() }));
}
