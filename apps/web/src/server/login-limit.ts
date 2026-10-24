import { loginEmailIpKey, normalizeLoginEmail } from "@pulso/domain";
import Redis from "ioredis";

/** Mesmos dois baldes da API: e-mail+IP (`loginEmailIpKey`) e só IP, 30 falhas em 15 minutos. */

export const LOGIN_LIMIT = 30;
export const LOGIN_WINDOW_MS = 15 * 60 * 1000;
export const LOGIN_RETRY_AFTER = "900";
export const LOGIN_BUSY = "Muitas tentativas de login. Espera alguns minutos.";
export const LOGIN_NO_IP = "Não deu para identificar o IP. O login não segue sem ele.";
export const LOGIN_NO_REDIS = "O login em produção precisa do Redis.";

interface IpBucket {
  failures: number;
  reset: number;
  byEmail: Map<string, number>;
}

interface PairBucket {
  failures: number;
  reset: number;
}

export type LoginGate = { ok: true } | { ok: false; status: 429 | 503 };

const ipBuckets = new Map<string, IpBucket>();
const emailIpBuckets = new Map<string, PairBucket>();

let redisClient: Redis | null = null;
let redisUrl = "";
let redisOpening: Promise<void> | null = null;

export function loginStoreMode(env: NodeJS.ProcessEnv = process.env): "redis" | "memory" | "unavailable" {
  if (env.REDIS_URL?.trim()) return "redis";
  if (env.NODE_ENV === "production") return "unavailable";
  return "memory";
}

function loginIp(ip: string | null | undefined, env: NodeJS.ProcessEnv = process.env): string {
  const trimmed = ip?.trim() ?? "";
  if (trimmed && trimmed !== "local") return trimmed;
  if (env.NODE_ENV === "production") {
    throw new Error(LOGIN_NO_IP);
  }
  return trimmed || "local";
}

export function resetLoginLimits(): void {
  ipBuckets.clear();
  emailIpBuckets.clear();
}

export function disconnectLoginRedis(): void {
  redisOpening = null;
  const client = redisClient;
  redisClient = null;
  redisUrl = "";
  client?.disconnect();
}

function siteRedis(): Redis | null {
  const url = process.env.REDIS_URL?.trim();
  if (!url) return null;
  if (redisClient && redisUrl === url && redisClient.status !== "end") return redisClient;
  redisClient?.disconnect();
  redisOpening = null;
  redisUrl = url;
  redisClient = new Redis(url, {
    connectTimeout: 800,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    lazyConnect: true,
  });
  redisClient.on("error", () => {
    // connect() e o comando já devolvem a falha.
  });
  return redisClient;
}

async function openSiteRedis(): Promise<Redis> {
  const client = siteRedis();
  if (!client) throw new Error(LOGIN_NO_REDIS);
  if (client.status !== "ready") {
    if (!redisOpening) {
      redisOpening = client.connect().then(() => undefined).finally(() => {
        redisOpening = null;
      });
    }
    await redisOpening;
  }
  if (client.status !== "ready") throw new Error("Redis do login não ficou pronto.");
  return client;
}

function ipKey(ip: string): string {
  return `pulso:login:ip:${ip}`;
}

function ipUserKey(ip: string, email: string): string {
  return `pulso:login:ipuser:${ip}:${normalizeLoginEmail(email)}`;
}

function pairKey(email: string, ip: string): string {
  return `pulso:login:emailip:${loginEmailIpKey(email, ip)}`;
}

async function redisCount(key: string): Promise<number> {
  const client = await openSiteRedis();
  return Number((await client.get(key)) ?? 0);
}

/** A API grava estas chaves. O site só lê, para não contar a mesma falha duas vezes. */
async function redisBlocked(email: string, ip: string): Promise<boolean> {
  const address = loginIp(ip);
  const total = await redisCount(ipKey(address));
  const own = await redisCount(ipUserKey(address, email));
  const pair = await redisCount(pairKey(email, address));
  return total - own >= LOGIN_LIMIT || pair >= LOGIN_LIMIT;
}

async function redisStillInside(email: string, ip: string): Promise<boolean> {
  const address = loginIp(ip);
  const total = await redisCount(ipKey(address));
  const pair = await redisCount(pairKey(email, address));
  return total <= LOGIN_LIMIT && pair <= LOGIN_LIMIT;
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

function memoryBlocked(email: string, ip: string, now: number): boolean {
  const address = loginIp(ip);
  const bucket = liveIp(address, now);
  if (bucket) {
    const own = bucket.byEmail.get(normalizeLoginEmail(email)) ?? 0;
    if (bucket.failures - own >= LOGIN_LIMIT) return true;
  }
  const pair = livePair(loginEmailIpKey(email, address), now);
  return Boolean(pair && pair.failures >= LOGIN_LIMIT);
}

/**
 * Os dois baldes travam antes da senha.
 * IP cheio por outras contas, ou o par e-mail+IP já nas 30 falhas: 429 sem conferir a senha.
 */
export async function admitLogin(email: string, ip: string, now: number): Promise<LoginGate> {
  const mode = loginStoreMode();
  if (mode === "unavailable") return { ok: false, status: 503 };
  if (mode === "redis") {
    try {
      if (await redisBlocked(email, ip)) return { ok: false, status: 429 };
      return { ok: true };
    } catch {
      if (process.env.NODE_ENV === "production") return { ok: false, status: 503 };
    }
  }
  if (memoryBlocked(email, ip, now)) return { ok: false, status: 429 };
  return { ok: true };
}

/** Conta uma senha errada no Map. Com Redis, a API já incrementou: aqui só lê. `false` quando passou de 30. */
export async function noteLoginFailure(email: string, ip: string, now: number): Promise<boolean> {
  const mode = loginStoreMode();
  if (mode === "redis") {
    try {
      return await redisStillInside(email, ip);
    } catch {
      if (process.env.NODE_ENV === "production") return false;
    }
  }
  const address = loginIp(ip);
  const normalized = normalizeLoginEmail(email);
  let bucket = liveIp(address, now);
  if (!bucket) {
    bucket = { failures: 0, reset: now + LOGIN_WINDOW_MS, byEmail: new Map() };
    ipBuckets.set(address, bucket);
  }
  bucket.failures += 1;
  bucket.byEmail.set(normalized, (bucket.byEmail.get(normalized) ?? 0) + 1);

  const key = loginEmailIpKey(email, address);
  let pair = livePair(key, now);
  if (!pair) {
    pair = { failures: 0, reset: now + LOGIN_WINDOW_MS };
    emailIpBuckets.set(key, pair);
  }
  pair.failures += 1;
  return bucket.failures <= LOGIN_LIMIT && pair.failures <= LOGIN_LIMIT;
}

/** A senha certa tira a parte desta conta dos dois baldes. No Redis, a API já fez isso. */
export async function clearLoginEmail(email: string, ip: string, now: number): Promise<void> {
  if (loginStoreMode() === "redis") return;
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
