import type { MetadataRoute } from "next";
import { getPublicSiteUrl } from "@/lib/site-url";

export default function robots(): MetadataRoute.Robots {
  const base = getPublicSiteUrl();
  return {
    rules: { userAgent: "*", allow: ["/", "/privacidade", "/termos"], disallow: ["/api/", "/dashboard", "/login", "/cadastro", "/auth/", "/configuracoes", "/estoque", "/pdv", "/financeiro", "/relatorios", "/upgrade", "/checkout", "/convite", "/redefinir-senha"] },
    sitemap: base + "/sitemap.xml",
    host: base,
  };
}
