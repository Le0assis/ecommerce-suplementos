/** `julia@dominio.com` vira `j***@d***.com`. Igual à API, para mascarar de novo não mudar o texto. */
export function maskEmail(email: string): string {
  const normalized = email.trim().toLowerCase();
  const at = normalized.lastIndexOf("@");
  if (at <= 0 || at === normalized.length - 1) return "***";
  const local = Array.from(normalized.slice(0, at));
  const domain = normalized.slice(at + 1);
  const dot = domain.indexOf(".");
  const host = dot > 0 ? Array.from(domain.slice(0, dot)) : [];
  if (!local[0] || !host[0]) return "***";
  return `${local[0]}***@${host[0]}***${domain.slice(dot)}`;
}
