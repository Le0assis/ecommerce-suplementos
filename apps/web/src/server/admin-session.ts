import { createHmac, timingSafeEqual } from "node:crypto";
import type { AdminPublicUser, AdminRole } from "@/lib/admin-types";

export const COOKIE_NAME = "pulso_admin_session";
export const SESSION_SECONDS = 60 * 60 * 12;
const DEV_SECRET = "pulso-dev-only-session-secret";
const EXAMPLE_SECRET = "pulso-dev-session-change-me";
const FAILURE_WINDOW_MS = 15 * 60 * 1000;
const FAILURE_LIMIT = 8;

export interface SessionPayload {
  v: 1;
  sub: string;
  email: string;
  name: string;
  role: AdminRole;
  exp: number;
  src: "api" | "adapter";
  apiToken?: string;
}

const failures = new Map<string, { count: number; reset: number }>();

export function usingDevSessionSecret(): boolean {
  const secret = process.env.ADMIN_SESSION_SECRET;
  return !secret || secret.length < 16 || secret === EXAMPLE_SECRET;
}

export function sessionSecret(): string {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (process.env.NODE_ENV === "production" && (!secret || secret.length < 16 || secret === EXAMPLE_SECRET)) {
    throw new Error("ADMIN_SESSION_SECRET de exemplo não vale em produção.");
  }
  if (secret && secret.length >= 16 && secret !== EXAMPLE_SECRET) return secret;
  if (secret && secret.length >= 16 && process.env.NODE_ENV !== "production") return secret;
  return DEV_SECRET;
}

export function signSession(payload: SessionPayload, secret = sessionSecret()): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const mac = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${mac}`;
}

export function verifySession(token: string | undefined, now?: number, secret?: string): SessionPayload | null {
  if (!token) return null;
  const clock = now ?? Date.now();
  let key = secret;
  if (!key) {
    try {
      key = sessionSecret();
    } catch {
      return null;
    }
  }
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, mac] = parts;
  if (!body || !mac) return null;
  const expected = createHmac("sha256", key).update(body).digest("base64url");
  const left = Buffer.from(mac);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as SessionPayload;
    if (payload.v !== 1 || !payload.sub || !payload.role || !payload.exp || payload.src !== "api" || !payload.apiToken) return null;
    if (payload.exp * 1000 <= clock) return null;
    return payload;
  } catch {
    return null;
  }
}

export function toPublicUser(payload: SessionPayload): AdminPublicUser {
  return { id: payload.sub, email: payload.email, name: payload.name, role: payload.role };
}

export function peekBlocked(key: string, now = Date.now()): { blocked: boolean; retryAfter: number } {
  const current = failures.get(key);
  if (!current || current.reset <= now) return { blocked: false, retryAfter: 0 };
  if (current.count >= FAILURE_LIMIT) return { blocked: true, retryAfter: Math.ceil((current.reset - now) / 1000) };
  return { blocked: false, retryAfter: 0 };
}

export function registerFailure(key: string, now = Date.now()): { blocked: boolean; retryAfter: number } {
  const current = failures.get(key);
  if (!current || current.reset <= now) {
    failures.set(key, { count: 1, reset: now + FAILURE_WINDOW_MS });
    return { blocked: false, retryAfter: 0 };
  }
  current.count += 1;
  if (current.count >= FAILURE_LIMIT) return { blocked: true, retryAfter: Math.ceil((current.reset - now) / 1000) };
  return { blocked: false, retryAfter: 0 };
}

export function clearFailures(key: string): void {
  failures.delete(key);
}
