import { createHmac, timingSafeEqual } from "node:crypto";
import { cookieSecureFromEnv, sessionSecret } from "./admin/session";

export const CUSTOMER_COOKIE = "pulso_customer";
export const CUSTOMER_SESSION_SECONDS = 60 * 60 * 24 * 30;

export interface CustomerClaims {
  sub: string;
  email: string;
  name: string;
  exp: number;
  jti: string;
}

function b64url(value: Buffer | string): string {
  return Buffer.from(value).toString("base64url");
}

export function signCustomerSession(claims: CustomerClaims, secret: string): string {
  const body = b64url(JSON.stringify(claims));
  const sig = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function readCustomerSession(token: string, secret: string, now = new Date()): CustomerClaims | null {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = createHmac("sha256", secret).update(body).digest("base64url");
  const left = Buffer.from(sig);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;
  try {
    const claims = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as CustomerClaims;
    if (!claims.sub || !claims.email || !claims.name || !claims.exp || !claims.jti) return null;
    if (claims.exp * 1000 <= now.getTime()) return null;
    return claims;
  } catch {
    return null;
  }
}

export function customerCookie(token: string, maxAge: number, secure: boolean): string {
  const parts = [`${CUSTOMER_COOKIE}=${encodeURIComponent(token)}`, "HttpOnly", "SameSite=Lax", "Path=/", `Max-Age=${maxAge}`];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export function clearCustomerCookie(secure: boolean): string {
  return customerCookie("", 0, secure);
}

export function customerTokenFromRequest(authorization: string | undefined, cookie: string | undefined): string | null {
  if (authorization?.toLowerCase().startsWith("bearer ")) {
    const token = authorization.slice(7).trim();
    if (token) return token;
  }
  if (!cookie) return null;
  for (const part of cookie.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === CUSTOMER_COOKIE) return decodeURIComponent(rest.join("="));
  }
  return null;
}

export function customerSessionSecret(env: NodeJS.ProcessEnv, override?: string): string | null {
  return sessionSecret(env, override);
}

export function customerCookieSecure(env: NodeJS.ProcessEnv, override?: boolean): boolean {
  if (override !== undefined) return override;
  return cookieSecureFromEnv(env);
}
