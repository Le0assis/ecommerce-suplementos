import { createHmac, timingSafeEqual } from "node:crypto";
import type { Role } from "./permissions";

export const COOKIE_NAME = "pulso_admin";
export const SESSION_SECONDS = 60 * 60 * 12;

export interface SessionClaims {
  sub: string;
  email: string;
  name: string;
  role: Role;
  exp: number;
  jti: string;
}

function b64url(value: Buffer | string): string {
  return Buffer.from(value).toString("base64url");
}

export function signSession(claims: SessionClaims, secret: string): string {
  const body = b64url(JSON.stringify(claims));
  const sig = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function readSession(token: string, secret: string, now = new Date()): SessionClaims | null {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = createHmac("sha256", secret).update(body).digest("base64url");
  const left = Buffer.from(sig);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;
  try {
    const claims = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as SessionClaims;
    if (!claims.sub || !claims.email || !claims.role || !claims.exp || !claims.jti) return null;
    if (claims.exp * 1000 <= now.getTime()) return null;
    return claims;
  } catch {
    return null;
  }
}

export function sessionCookie(token: string, maxAge: number, secure: boolean): string {
  const parts = [`${COOKIE_NAME}=${encodeURIComponent(token)}`, "HttpOnly", "SameSite=Lax", "Path=/", `Max-Age=${maxAge}`];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export function clearCookie(secure: boolean): string {
  return sessionCookie("", 0, secure);
}

export function cookieSecureFromEnv(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.NODE_ENV === "production") return true;
  return env.ADMIN_COOKIE_SECURE !== "false";
}

export const EXAMPLE_SESSION_SECRET = "pulso-dev-session-change-me";

export function sessionSecret(env: NodeJS.ProcessEnv, override?: string): string | null {
  const secret = override ?? env.ADMIN_SESSION_SECRET;
  if (!secret || secret.length < 16) return null;
  if (env.NODE_ENV === "production" && secret === EXAMPLE_SESSION_SECRET) return null;
  return secret;
}

export function tokenFromRequest(authorization: string | undefined, cookie: string | undefined): string | null {
  if (authorization?.toLowerCase().startsWith("bearer ")) {
    const token = authorization.slice(7).trim();
    if (token) return token;
  }
  if (!cookie) return null;
  for (const part of cookie.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === COOKIE_NAME) return decodeURIComponent(rest.join("="));
  }
  return null;
}
