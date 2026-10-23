import type { AdminPublicUser, AdminResource, AdminRole } from "@/lib/admin-types";
import { canAccess } from "@/lib/admin-types";
import { dispatchRecords } from "@/server/admin-records";
import type { SessionPayload } from "@/server/admin-session";
import {
  addFlavor,
  addImage,
  addVariant,
  AdminRuleError,
  archiveProduct,
  createCoupon,
  createProduct,
  deleteCoupon,
  deleteFlavor,
  deleteImage,
  deleteVariant,
  duplicateProduct,
  getProduct,
  inspectLocalUpload,
  listCoupons,
  listProducts,
  readAdminDb,
  updateCoupon,
  updateFlavor,
  updateProduct,
  updateVariant,
  writeAdminDb,
} from "@/server/admin-store";

/**
 * Cliente do admin.
 * Contrato esperado da API: /v1/admin/* com Bearer da sessão.
 * ADAPTER: 404 ou API fora do ar caem no arquivo local `.data/admin-mock.json`.
 * Isso não é o Postgres. Some quando o backend publicar as rotas.
 */

const ROLES: AdminRole[] = ["dono", "editor", "atendimento"];
let apiDownUntil = 0;

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

async function tryRemote(session: SessionPayload, method: string, segments: string[], search: URLSearchParams, body: unknown): Promise<AdminHandlerResult | null> {
  if (session.src !== "api" || !session.apiToken) return null;
  if (Date.now() < apiDownUntil) return null;
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
      signal: AbortSignal.timeout(1500),
    });
    if (response.status === 404) return null;
    const json = await readJson(response);
    return { status: response.status, body: withSource(json, "api") };
  } catch {
    apiDownUntil = Date.now() + 30_000;
    return null;
  }
}

const RESOURCE: Record<string, AdminResource> = {
  products: "products",
  kits: "kits",
  coupons: "coupons",
  categories: "categories",
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

function localDispatch(method: string, segments: string[], search: URLSearchParams, body: unknown): { status: number; body: Record<string, unknown>; save?: boolean } {
  const db = readAdminDb();
  const [resource, id, child, childId] = segments;
  const done = (status: number, payload: Record<string, unknown>, next?: typeof db) => {
    if (next) writeAdminDb(next);
    return { status, body: payload, save: Boolean(next) };
  };

  if (resource === "uploads" && !id && method === "POST") {
    return done(200, {
      mode: "local",
      message: "Vercel Blob ainda não está ligado. Imagens de até 300 KB ficam no adaptador; acima disso, cole uma URL https.",
    });
  }
  if (resource === "uploads" && id === "local" && method === "POST") {
    const file = inspectLocalUpload(body);
    return done(200, { mode: "local", url: file.url, alt: file.alt });
  }
  if (resource === "products" && !id && method === "GET") return done(200, listProducts(db, search));
  if (resource === "products" && !id && method === "POST") {
    const created = createProduct(db, body);
    return done(201, { item: created.product }, created.db);
  }
  if (resource === "products" && id && child === "duplicate" && method === "POST") {
    const copy = duplicateProduct(db, id);
    return done(201, { item: copy.product }, copy.db);
  }
  if (resource === "products" && id && child === "flavors" && !childId && method === "POST") {
    const created = addFlavor(db, id, body);
    return done(201, { item: created.product }, created.db);
  }
  if (resource === "products" && id && child === "flavors" && childId && method === "PATCH") {
    const updated = updateFlavor(db, id, childId, body);
    return done(200, { item: updated.product }, updated.db);
  }
  if (resource === "products" && id && child === "flavors" && childId && method === "DELETE") {
    const updated = deleteFlavor(db, id, childId);
    return done(200, { item: updated.product }, updated.db);
  }
  if (resource === "products" && id && child === "variants" && !childId && method === "POST") {
    const created = addVariant(db, id, body);
    return done(201, { item: created.product }, created.db);
  }
  if (resource === "products" && id && child === "variants" && childId && method === "PATCH") {
    const updated = updateVariant(db, id, childId, body);
    return done(200, { item: updated.product }, updated.db);
  }
  if (resource === "products" && id && child === "variants" && childId && method === "DELETE") {
    const updated = deleteVariant(db, id, childId);
    return done(200, { item: updated.product }, updated.db);
  }
  if (resource === "products" && id && child === "images" && !childId && method === "POST") {
    const created = addImage(db, id, body);
    return done(201, { item: created.product }, created.db);
  }
  if (resource === "products" && id && child === "images" && childId && method === "DELETE") {
    const updated = deleteImage(db, id, childId);
    return done(200, { item: updated.product }, updated.db);
  }
  if (resource === "products" && id && !child && method === "GET") return done(200, { item: getProduct(db, id) });
  if (resource === "products" && id && !child && method === "PATCH") {
    const updated = updateProduct(db, id, body);
    return done(200, { item: updated.product }, updated.db);
  }
  if (resource === "products" && id && !child && method === "DELETE") {
    const archived = archiveProduct(db, id);
    return done(200, { item: archived.product }, archived.db);
  }
  if (resource === "coupons" && !id && method === "GET") return done(200, listCoupons(db, search));
  if (resource === "coupons" && !id && method === "POST") {
    const created = createCoupon(db, body);
    return done(201, { item: created.coupon }, created.db);
  }
  if (resource === "coupons" && id && method === "PATCH") {
    const updated = updateCoupon(db, id, body);
    return done(200, { item: updated.coupon }, updated.db);
  }
  if (resource === "coupons" && id && method === "DELETE") {
    return done(200, { ok: true }, deleteCoupon(db, id));
  }
  const extra = dispatchRecords(db, method, segments, search, body);
  if (extra) return done(extra.status, extra.body, extra.next);
  throw new AdminRuleError(404, "Rota admin não encontrada.");
}

export async function handleAdminData(session: SessionPayload, method: string, segments: string[], search: URLSearchParams, body: unknown): Promise<AdminHandlerResult> {
  const resource = RESOURCE[segments[0] ?? ""];
  if (!resource) return { status: 404, body: { error: "Rota admin não encontrada.", source: "adapter" } };
  if (!canAccess(session.role, resource)) return { status: 403, body: { error: "Seu papel não faz isso.", source: session.src } };
  const remote = await tryRemote(session, method, segments, search, body);
  if (remote) return remote;
  try {
    const result = localDispatch(method, segments, search, body);
    return { status: result.status, body: withSource(result.body, "adapter") };
  } catch (error) {
    if (error instanceof AdminRuleError) return { status: error.status, body: { error: error.message, source: "adapter" } };
    throw error;
  }
}
