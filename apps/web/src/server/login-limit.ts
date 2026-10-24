import { loginEmailIpKey, normalizeLoginEmail } from "@pulso/domain";

/** Mesmos dois baldes da API: e-mail+IP (`loginEmailIpKey`) e só IP, 30 falhas em 15 minutos. */

export const LOGIN_LIMIT = 30;
export const LOGIN_WINDOW_MS = 15 * 60 * 1000;
export const LOGIN_RETRY_AFTER = "900";
export const LOGIN_BUSY = "Muitas tentativas de login. Espera alguns minutos.";

interface IpBucket {
  failures: number;
  reset: number;
  byEmail: Map<string, number>;
}

interface PairBucket {
  failures: number;
  reset: number;
}

const ipBuckets = new Map<string, IpBucket>();
const emailIpBuckets = new Map<string, PairBucket>();

function loginIp(ip: string | null | undefined): string {
  const trimmed = ip?.trim();
  return trimmed ? trimmed : "local";
}

export function resetLoginLimits(): void {
  ipBuckets.clear();
  emailIpBuckets.clear();
}

function liveIp(ip: string, now: number): IpBucket | null {
  const bucket = ipBuckets.get(ip);
  if (!bucket || bucket.reset <= now) return null;
  return bucket;
}

function livePair(key: string, now: number): PairBucket | null {
  const bucket = emailIpBuckets.get(key);
  if (!bucket || bucket.reset <= now) return null;
  return bucket;
}

/**
 * Antes da senha, só o balde do IP trava quem não falhou.
 * As 30 falhas da própria conta ainda deixam a senha certa entrar.
 */
export function admitLogin(email: string, ip: string, now: number): { ok: true } | { ok: false } {
  const address = loginIp(ip);
  const bucket = liveIp(address, now);
  if (!bucket) return { ok: true };
  const own = bucket.byEmail.get(normalizeLoginEmail(email)) ?? 0;
  if (bucket.failures - own >= LOGIN_LIMIT) return { ok: false };
  return { ok: true };
}

/** Conta uma senha errada. `false` quando esta falha estoura o balde do IP ou o do par. */
export function noteLoginFailure(email: string, ip: string, now: number): boolean {
  const address = loginIp(ip);
  const normalized = normalizeLoginEmail(email);
  let bucket = liveIp(address, now);
  if (!bucket) {
    bucket = { failures: 0, reset: now + LOGIN_WINDOW_MS, byEmail: new Map() };
    ipBuckets.set(address, bucket);
  }
  bucket.failures += 1;
  bucket.byEmail.set(normalized, (bucket.byEmail.get(normalized) ?? 0) + 1);

  const pairKey = loginEmailIpKey(email, address);
  let pair = livePair(pairKey, now);
  if (!pair) {
    pair = { failures: 0, reset: now + LOGIN_WINDOW_MS };
    emailIpBuckets.set(pairKey, pair);
  }
  pair.failures += 1;
  return bucket.failures <= LOGIN_LIMIT && pair.failures <= LOGIN_LIMIT;
}

/** A senha certa tira a parte desta conta dos dois baldes. */
export function clearLoginEmail(email: string, ip: string, now: number): void {
  const address = loginIp(ip);
  const bucket = liveIp(address, now);
  if (bucket) {
    const own = bucket.byEmail.get(normalizeLoginEmail(email)) ?? 0;
    bucket.failures = Math.max(0, bucket.failures - own);
    bucket.byEmail.delete(normalizeLoginEmail(email));
    if (bucket.failures <= 0) ipBuckets.delete(address);
  }
  emailIpBuckets.delete(loginEmailIpKey(email, address));
}
