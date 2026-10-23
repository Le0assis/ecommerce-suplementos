function normalizeIp(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith("::ffff:")) return trimmed.slice("::ffff:".length);
  return trimmed;
}

function hopsOf(header: string | null | undefined): string[] {
  return (header ?? "").split(",").map((item) => normalizeIp(item)).filter(Boolean);
}

function socketAddress(request: { headers: Headers }): string | null {
  const extra = request as { socket?: { remoteAddress?: string | null }; ip?: string };
  const raw = extra.socket?.remoteAddress || extra.ip || "";
  return raw ? normalizeIp(raw) : null;
}

/** IP que este processo enxerga: o socket, ou o salto mais à direita já escrito no cabeçalho. */
export function observedClientIp(request: { headers: Headers }): string {
  return socketAddress(request) ?? hopsOf(request.headers.get("x-forwarded-for")).at(-1) ?? "local";
}

/** Acrescenta o IP observado. Não troca a cadeia que já chegou. */
export function appendForwardedFor(existing: string | null | undefined, peer: string): string {
  const hops = hopsOf(existing);
  const clean = normalizeIp(peer);
  if (!clean) return hops.join(", ");
  if (hops.at(-1) === clean) return hops.join(", ");
  return [...hops, clean].join(", ");
}

export function forwardedForApi(request: { headers: Headers }): string {
  return appendForwardedFor(request.headers.get("x-forwarded-for"), observedClientIp(request));
}
