const PRODUCTION_SITE_URL = "https://meucaixa.sistemakumo.com.br";

function isLocalUrl(value: string) {
  try {
    const hostname = new URL(value).hostname;
    return hostname === "localhost" || hostname === "127.0.0.1";
  } catch {
    return false;
  }
}

export function getPublicSiteUrl(requestUrl?: string) {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  if (typeof window !== "undefined") {
    const browserOrigin = window.location.origin.replace(/\/$/, "");
    if (isLocalUrl(browserOrigin)) return browserOrigin;
  }
  if (requestUrl) {
    try {
      const requestOrigin = new URL(requestUrl).origin.replace(/\/$/, "");
      if (isLocalUrl(requestOrigin)) return requestOrigin;
    } catch {
      // Fall through to the configured public URL.
    }
  }
  return configured && !isLocalUrl(configured) ? configured : PRODUCTION_SITE_URL;
}
