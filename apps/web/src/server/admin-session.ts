import type { AdminPublicUser, AdminRole } from "@/lib/admin-types";

/** Cookie da API (`apps/api/src/admin/session.ts`). O site não assina sessão. */
export const COOKIE_NAME = "pulso_admin";
export const SESSION_SECONDS = 60 * 60 * 12;
const LEGACY_COOKIE = "pulso_admin_session";
const ROLES: AdminRole[] = ["dono", "editor", "atendimento"];

export function apiBase(): string {
  return (process.env.API_URL ?? "http://127.0.0.1:8787").replace(/\/$/, "");
}

export function cookieSecure(request: Request): boolean {
  const proto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  if (proto) return proto === "https";
  return new URL(request.url).protocol === "https:";
}

export function clientAddress(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
}

export function sessionCookieHeader(token: string, maxAge: number, secure: boolean): string {
  const parts = [`${COOKIE_NAME}=${encodeURIComponent(token)}`, "HttpOnly", "SameSite=Lax", "Path=/", `Max-Age=${maxAge}`];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export function clearCookieHeaders(secure: boolean): string[] {
  const flags = ["HttpOnly", "SameSite=Lax", "Path=/", "Max-Age=0"];
  if (secure) flags.push("Secure");
  return [`${COOKIE_NAME}=; ${flags.join("; ")}`, `${LEGACY_COOKIE}=; ${flags.join("; ")}`];
}

export function parseApiSetCookie(header: string | null): { token: string; maxAge: number } | null {
  if (!header) return null;
  const [pair, ...attrs] = header.split(";").map((part) => part.trim());
  if (!pair) return null;
  const eq = pair.indexOf("=");
  if (eq <= 0) return null;
  const name = pair.slice(0, eq);
  if (name !== COOKIE_NAME) return null;
  const token = decodeURIComponent(pair.slice(eq + 1));
  if (!token) return null;
  const max = attrs.find((part) => part.toLowerCase().startsWith("max-age="));
  const maxAge = max ? Number(max.split("=")[1]) : SESSION_SECONDS;
  return { token, maxAge: Number.isFinite(maxAge) ? maxAge : SESSION_SECONDS };
}

export function asAdminUser(value: unknown): AdminPublicUser | null {
  if (!value || typeof value !== "object") return null;
  const user = value as Partial<AdminPublicUser>;
  if (typeof user.id !== "string" || typeof user.email !== "string" || typeof user.name !== "string") return null;
  if (!user.role || !ROLES.includes(user.role)) return null;
  return { id: user.id, email: user.email, name: user.name, role: user.role };
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  const json = (await response.json().catch(() => ({}))) as unknown;
  if (typeof json === "object" && json !== null && !Array.isArray(json)) return json as Record<string, unknown>;
  return {};
}

function apiCookie(token: string): string {
  return `${COOKIE_NAME}=${encodeURIComponent(token)}`;
}

export type LoginResult =
  | { ok: true; user: AdminPublicUser; token: string; maxAge: number }
  | { ok: false; status: number; error: string; retryAfter: string | null };

export async function loginOnApi(email: string, password: string, forwardedFor: string): Promise<LoginResult> {
  let response: Response;
  try {
    response = await fetch(`${apiBase()}/v1/admin/login`, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "x-forwarded-for": forwardedFor,
      },
      body: JSON.stringify({ email, password }),
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });
  } catch {
    return { ok: false, status: 503, error: "A API de login não respondeu.", retryAfter: null };
  }
  const json = await readJson(response);
  if (!response.ok) {
    const fallback = response.status === 429 ? "Muitas tentativas de login. Espera alguns minutos." : "Não foi possível entrar.";
    return {
      ok: false,
      status: response.status,
      error: typeof json.error === "string" ? json.error : fallback,
      retryAfter: response.headers.get("retry-after"),
    };
  }
  const user = asAdminUser(json.user);
  const setCookies = typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : [];
  const raw = setCookies.find((item) => item.startsWith(`${COOKIE_NAME}=`)) ?? response.headers.get("set-cookie");
  const parsed = parseApiSetCookie(raw);
  const token = parsed?.token ?? "";
  if (!user || !token) return { ok: false, status: 502, error: "A API de login respondeu sem sessão utilizável.", retryAfter: null };
  return { ok: true, user, token, maxAge: parsed?.maxAge ?? SESSION_SECONDS };
}

export type MeResult = { ok: true; user: AdminPublicUser } | { ok: false; reason: "unauthorized" | "down" };

export async function meOnApi(token: string): Promise<MeResult> {
  let response: Response;
  try {
    response = await fetch(`${apiBase()}/v1/admin/me`, {
      headers: {
        accept: "application/json",
        authorization: `Bearer ${token}`,
        cookie: apiCookie(token),
      },
      cache: "no-store",
      signal: AbortSignal.timeout(4000),
    });
  } catch {
    return { ok: false, reason: "down" };
  }
  if (response.status === 401 || response.status === 403) return { ok: false, reason: "unauthorized" };
  if (!response.ok) return { ok: false, reason: "down" };
  const json = await readJson(response);
  const user = asAdminUser(json.user);
  if (!user) return { ok: false, reason: "unauthorized" };
  return { ok: true, user };
}

export async function logoutOnApi(token: string): Promise<void> {
  try {
    await fetch(`${apiBase()}/v1/admin/logout`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        cookie: apiCookie(token),
      },
      cache: "no-store",
      signal: AbortSignal.timeout(4000),
    });
  } catch {
    // O cookie deste site sai mesmo se a API não responder.
  }
}
