import type { RedisOptions } from "ioredis";
import { HttpError } from "./admin/http";

export const LOGIN_NO_REDIS = "O login em produção precisa do Redis.";
export const LOGIN_NO_IP = "Não deu para identificar o IP. O login não segue sem ele.";

export type LoginStoreMode = "redis" | "memory" | "unavailable";

/** Com `REDIS_URL` usa Redis. Sem URL, produção recusa. Fora dela, o Map do processo. */
export function loginStoreMode(env: NodeJS.ProcessEnv = process.env): LoginStoreMode {
  if (env.REDIS_URL?.trim()) return "redis";
  if (env.NODE_ENV === "production") return "unavailable";
  return "memory";
}

/** Conexão lenta não segura o login. O comando parado também não: 500 ms e a produção responde 503. */
export const LOGIN_REDIS_CONNECT_TIMEOUT_MS = 800;
export const LOGIN_REDIS_COMMAND_TIMEOUT_MS = 500;

export function loginRedisOptions(): RedisOptions {
  return {
    connectTimeout: LOGIN_REDIS_CONNECT_TIMEOUT_MS,
    commandTimeout: LOGIN_REDIS_COMMAND_TIMEOUT_MS,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    lazyConnect: true,
    retryStrategy: () => null,
  };
}

export interface LoginStoreState {
  memory: boolean;
}

/** Sem Redis em produção, para aqui. A senha não é conferida. */
export function openLoginStore(env: NodeJS.ProcessEnv = process.env): LoginStoreState {
  const mode = loginStoreMode(env);
  if (mode === "unavailable") throw new HttpError(503, LOGIN_NO_REDIS);
  return { memory: mode === "memory" };
}

export function requireLoginIp(ip: string): void {
  if (!ip) throw new HttpError(503, LOGIN_NO_IP);
}

/**
 * Um único desvio para os dois logins.
 * Redis fora do ar em produção responde 503 e não usa o Map.
 * Fora de produção, a falha passa para a memória e o resto do pedido fica nela.
 */
export async function runLoginStore<T>(
  state: LoginStoreState,
  redisWork: () => Promise<T>,
  memoryWork: () => T | Promise<T>,
  env: NodeJS.ProcessEnv = process.env,
): Promise<T> {
  if (state.memory) return memoryWork();
  try {
    return await redisWork();
  } catch (error) {
    if (error instanceof HttpError) throw error;
    if (env.NODE_ENV === "production") throw new HttpError(503, LOGIN_NO_REDIS);
    state.memory = true;
    return memoryWork();
  }
}
