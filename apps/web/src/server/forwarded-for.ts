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
 * IP da infraestrutura. O X-Forwarded-For do cliente nunca entra.
 * x-vercel-forwarded-for e x-real-ip só valem com VERCEL=1 e VERCEL_ENV ou VERCEL_URL.
 * Fora da Vercel, x-real-ip entra com TRUSTED_PROXY=1. No resto vale o IP do socket, ou o carimbo gravado a partir dele.
 */
export function observedClientIp(request: { headers: Headers }, env: NodeJS.ProcessEnv = process.env): string {
  const socket = socketAddress(request);
  if (trustVercelHeaders(env)) {
    return firstHop(request.headers.get("x-vercel-forwarded-for")) ?? firstHop(request.headers.get("x-real-ip")) ?? socket ?? "local";
  }
  if (env.TRUSTED_PROXY === "1") return firstHop(request.headers.get("x-real-ip")) ?? socket ?? "local";
  return socket ?? "local";
}

/** Só o IP confiável. A cadeia enviada pelo navegador não segue para a API. */
export function forwardedForApi(request: { headers: Headers }, env: NodeJS.ProcessEnv = process.env): string {
  return observedClientIp(request, env);
}
