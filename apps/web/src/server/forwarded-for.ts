function normalizeIp(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith("::ffff:")) return trimmed.slice("::ffff:".length);
  return trimmed;
}

function firstHop(header: string | null | undefined): string | null {
  const hop = (header ?? "").split(",").map((item) => normalizeIp(item)).find(Boolean);
  return hop || null;
}

/** O processo do Next grava isto por cima do valor do cliente. O navegador não escolhe. */
export const SOCKET_IP_HEADER = "x-pulso-socket-ip";

function socketAddress(request: { headers: Headers }): string | null {
  const extra = request as { socket?: { remoteAddress?: string | null }; ip?: string };
  const raw = extra.socket?.remoteAddress || extra.ip || "";
  if (raw) return normalizeIp(raw);
  return firstHop(request.headers.get(SOCKET_IP_HEADER));
}

/**
 * A plataforma preenche VERCEL, VERCEL_ENV e VERCEL_URL juntas e sobrescreve os dois cabeçalhos.
 * VERCEL=1 sozinho aparece fora dela; aí o cliente ainda escreve o IP e ele não entra.
 */
export function trustVercelHeaders(env: NodeJS.ProcessEnv): boolean {
  if (env.VERCEL !== "1") return false;
  return Boolean(env.VERCEL_ENV?.trim() || env.VERCEL_URL?.trim());
}

/**
 * Em desenvolvimento, sem IP, os testes compartilham `local`.
 * Em produção isso juntaria todo mundo no mesmo balde: devolve null e o login responde 503.
 */
function missingClientIp(env: NodeJS.ProcessEnv): string | null {
  if (env.NODE_ENV === "production") return null;
  return "local";
}

/**
 * Recusa subir em produção se não houver como ver o IP.
 * VERCEL=1 precisa de VERCEL_ENV ou VERCEL_URL. TRUSTED_PROXY=1 só vale com um proxy que sobrescreve x-real-ip.
 * O carimbo do socket (PULSO_STAMP_PEER) é a terceira saída. X-Forwarded-For não entra.
 */
export function assertProductionClientIp(env: NodeJS.ProcessEnv = process.env): void {
  if (env.NODE_ENV !== "production") return;
  if (env.NEXT_PHASE === "phase-production-build") return;
  if (trustVercelHeaders(env)) return;
  if (env.TRUSTED_PROXY === "1") return;
  if (env.PULSO_STAMP_PEER === "1") return;
  throw new Error(
    "Produção sem IP de cliente. Defina VERCEL=1 com VERCEL_ENV ou VERCEL_URL, ou TRUSTED_PROXY=1 (o proxy sobrescreve x-real-ip; X-Forwarded-For não vale), ou o carimbo do socket.",
  );
}

/**
 * IP da infraestrutura. O X-Forwarded-For do cliente nunca entra.
 * x-vercel-forwarded-for e x-real-ip só valem com VERCEL=1 e VERCEL_ENV ou VERCEL_URL.
 * Fora da Vercel, TRUSTED_PROXY=1 lê só x-real-ip, e só se o proxy sobrescrever esse cabeçalho.
 * No resto vale o IP do socket, ou o carimbo gravado a partir dele.
 * Sem nenhum dos três, produção devolve null. Desenvolvimento devolve `local`.
 */
export function observedClientIp(request: { headers: Headers }, env: NodeJS.ProcessEnv = process.env): string | null {
  const socket = socketAddress(request);
  if (trustVercelHeaders(env)) {
    return firstHop(request.headers.get("x-vercel-forwarded-for")) ?? firstHop(request.headers.get("x-real-ip")) ?? socket ?? missingClientIp(env);
  }
  if (env.TRUSTED_PROXY === "1") return firstHop(request.headers.get("x-real-ip")) ?? socket ?? missingClientIp(env);
  return socket ?? missingClientIp(env);
}

/** Só o IP confiável. A cadeia enviada pelo navegador não segue para a API. */
export function forwardedForApi(request: { headers: Headers }, env: NodeJS.ProcessEnv = process.env): string | null {
  return observedClientIp(request, env);
}
