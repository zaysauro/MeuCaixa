"use client";

import { useEffect } from "react";

declare global {
  interface Window { dataLayer?: Array<Record<string, unknown>>; }
}

export function MarketingAnalytics() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const utms = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"]
      .map((key) => [key, params.get(key)] as const)
      .filter((entry): entry is readonly [string, string] => Boolean(entry[1]));
    if (utms.length) sessionStorage.setItem("meucaixa_utms", JSON.stringify(Object.fromEntries(utms)));

    const stored = sessionStorage.getItem("meucaixa_utms");
    const suffix = stored ? `\nOrigem: ${stored}` : "";
    document.querySelectorAll<HTMLAnchorElement>('a[href*="wa.me"]').forEach((anchor) => {
      if (!suffix || anchor.dataset.utmApplied) return;
      const url = new URL(anchor.href);
      const message = url.searchParams.get("text");
      if (message) url.searchParams.set("text", `${message}${suffix}`);
      anchor.href = url.toString();
      anchor.dataset.utmApplied = "true";
    });

    const onClick = (event: MouseEvent) => {
      const target = (event.target as HTMLElement).closest<HTMLAnchorElement>("a[data-track]");
      if (target) window.dataLayer?.push({ event: target.dataset.track, position: target.dataset.position ?? "unknown" });
      const summary = (event.target as HTMLElement).closest("summary");
      if (summary) window.dataLayer?.push({ event: "faq_open", position: "faq" });
    };
    document.addEventListener("click", onClick);
    const pricing = document.querySelector("#preco");
    const observer = pricing ? new IntersectionObserver(([entry]) => { if (entry.isIntersecting) window.dataLayer?.push({ event: "pricing_view", position: "preco" }); }, { threshold: 0.35 }) : null;
    if (pricing && observer) observer.observe(pricing);
    return () => { document.removeEventListener("click", onClick); observer?.disconnect(); };
  }, []);
  return null;
}
