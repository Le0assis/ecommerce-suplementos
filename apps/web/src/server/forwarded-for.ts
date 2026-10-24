function normalizeIp(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith("::ffff:")) return trimmed.slice("::ffff:".length);
  return trimmed;
}

function firstHop(header: string | null | undefined): string | null {
  const hop = (header ?? "").split(",").map((item) => normalizeIp(item)).find(Boolean);
  return hop || null;
}

function socketAddress(request: { headers: Headers }): string | null {
  const extra = request as { socket?: { remoteAddress?: string | null }; ip?: string };
  const raw = extra.socket?.remoteAddress || extra.ip || "";
  return raw ? normalizeIp(raw) : null;
}

/**
 * IP da infraestrutura. O X-Forwarded-For do cliente nunca entra.
 * x-vercel-forwarded-for e x-real-ip só valem com VERCEL=1, porque a plataforma sobrescreve os dois.
 * Fora isso vale o IP do socket.
 */
export function observedClientIp(request: { headers: Headers }, env: NodeJS.ProcessEnv = process.env): string {
  const socket = socketAddress(request);
  if (env.VERCEL === "1") {
    return firstHop(request.headers.get("x-vercel-forwarded-for")) ?? firstHop(request.headers.get("x-real-ip")) ?? socket ?? "local";
  }
  return socket ?? "local";
}

/** Só o IP confiável. A cadeia enviada pelo navegador não segue para a API. */
export function forwardedForApi(request: { headers: Headers }, env: NodeJS.ProcessEnv = process.env): string {
  return observedClientIp(request, env);
}
