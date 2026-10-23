const CONTROL = /[\u0000-\u001F\u007F]/;

/** Link de banner: https:// ou um caminho com uma barra. Recusa //, javascript:, data: e http:. */
export function safeBannerHref(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const href = value.trim();
  if (!href || CONTROL.test(href)) return null;
  if (href.startsWith("/") && !href.startsWith("//") && !href.startsWith("/\\")) return href;
  if (/^https:\/\//i.test(href)) return href;
  return null;
}

export function bannerHrefError(value: string | null | undefined): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  if (safeBannerHref(value)) return null;
  return "O link precisa começar com https:// ou com uma barra. Sem //, javascript, data ou http.";
}

export function jsonLdHtml(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}
