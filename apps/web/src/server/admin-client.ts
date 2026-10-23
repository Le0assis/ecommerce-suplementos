import type { AdminPublicUser, AdminResource, AdminRole } from "@/lib/admin-types";
import { canAccess } from "@/lib/admin-types";
import type { SessionPayload } from "@/server/admin-session";

/**
 * Cliente do admin.
 * Contrato: /v1/admin/* com Bearer da sessão.
 * Sem a API, a rota devolve erro. Não grava `.data/admin-mock.json`.
 */

const ROLES: AdminRole[] = ["dono", "editor", "atendimento"];

export interface AdminHandlerResult {
  status: number;
  body: Record<string, unknown>;
}

function apiBase(): string {
  return (process.env.API_URL ?? "http://127.0.0.1:8787").replace(/\/$/, "");
}

function withSource(body: Record<string, unknown>, source: "api" | "adapter"): Record<string, unknown> {
  return { ...body, source };
}

function tokenFromApiCookie(response: Response): string | null {
  const listed = typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : [];
  const sources = listed.length > 0 ? listed : [response.headers.get("set-cookie") ?? ""];
  for (const source of sources) {
    const match = /(?:^|[;,]\s*)pulso_admin=([^;]+)/.exec(source);
    if (match?.[1]) return decodeURIComponent(match[1]);
  }
  return null;
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  const json = (await response.json().catch(() => ({}))) as unknown;
  if (typeof json === "object" && json !== null && !Array.isArray(json)) return json as Record<string, unknown>;
  return { data: json };
}

/** O atraso progressivo do login chega a 8 s. O corte fica acima disso. */
export const LOGIN_API_TIMEOUT_MS = 15_000;

export async function loginAgainstApi(email: string, password: string, forwardedFor?: string): Promise<
  | { ok: true; token: string; user: AdminPublicUser }
  | { ok: false; status: number; error: string; retryAfter: string | null }
  | null
> {
  try {
    const response = await fetch(`${apiBase()}/v1/admin/login`, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        ...(forwardedFor ? { "x-forwarded-for": forwardedFor } : {}),
      },
      body: JSON.stringify({ email, password }),
      cache: "no-store",
      signal: AbortSignal.timeout(LOGIN_API_TIMEOUT_MS),
    });
    if (response.status === 404) return null;
    const json = await readJson(response);
    if (!response.ok) {
      const retryAfter = response.headers.get("retry-after");
      return {
        ok: false,
        status: response.status,
        error: typeof json.error === "string" ? json.error : "Não foi possível entrar.",
        retryAfter,
      };
    }
    const user = json.user as AdminPublicUser | undefined;
    const token = tokenFromApiCookie(response) ?? (typeof json.token === "string" ? json.token : null);
    if (!token || !user || !ROLES.includes(user.role)) {
      return { ok: false, status: 502, error: "A API de login respondeu sem sessão utilizável.", retryAfter: null };
    }
    return { ok: true, token, user };
  } catch {
    return null;
  }
}

async function callApi(session: SessionPayload, method: string, segments: string[], search: URLSearchParams, body: unknown): Promise<AdminHandlerResult> {
  if (session.src !== "api" || !session.apiToken) {
    return { status: 401, body: { error: "Sessão inválida ou vencida." } };
  }
  const query = search.toString();
  try {
    const response = await fetch(`${apiBase()}/v1/admin/${segments.join("/")}${query ? `?${query}` : ""}`, {
      method,
      headers: {
        accept: "application/json",
        authorization: `Bearer ${session.apiToken}`,
        ...(body !== undefined ? { "content-type": "application/json" } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    const json = await readJson(response);
    return { status: response.status, body: withSource(json, "api") };
  } catch {
    return { status: 503, body: { error: "A API de admin está fora do ar.", source: "api" } };
  }
}

const RESOURCE: Record<string, AdminResource> = {
  products: "products",
  kits: "kits",
  coupons: "coupons",
  categories: "categories",
  goals: "categories",
  influencers: "influencers",
  authors: "authors",
  posts: "posts",
  promotions: "promotions",
  drops: "drops",
  quiz: "quiz",
  reviews: "reviews",
  ugc: "ugc",
  videos: "videos",
  "scratch-prizes": "scratch-prizes",
  banners: "banners",
  orders: "orders",
  customers: "customers",
  settings: "loyalty",
  uploads: "uploads",
};


function isWaitlistAdmin(segments: string[]): boolean {
  return segments[0] === "drops" && segments.includes("waitlist");
}

export async function handleAdminData(session: SessionPayload, method: string, segments: string[], search: URLSearchParams, body: unknown): Promise<AdminHandlerResult> {
  const resource = RESOURCE[segments[0] ?? ""];
  if (!resource) return { status: 404, body: { error: "Rota admin não encontrada." } };
  if (isWaitlistAdmin(segments) && session.role !== "dono") {
    return { status: 403, body: { error: "Seu papel não faz isso." } };
  }
  if (!canAccess(session.role, resource)) return { status: 403, body: { error: "Seu papel não faz isso." } };
  return callApi(session, method, segments, search, body);
}
