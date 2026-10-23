import { getConnInfo } from "@hono/node-server/conninfo";
import { CatalogError } from "@pulso/db/catalog";
import type { Sql, SqlClient } from "@pulso/db/sql";
import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { ZodTypeAny, output as ZodOutput } from "zod";
import { sessionIsLive } from "./live-session";
import { can, type Resource, type Role } from "./permissions";
import { readSession, tokenFromRequest, type SessionClaims } from "./session";

export class HttpError extends Error {
  constructor(
    readonly status: ContentfulStatusCode,
    message: string,
  ) {
    super(message);
  }
}

export interface Actor {
  id: string;
  email: string;
  name: string;
  role: Role;
}

export interface AdminRuntime {
  sql: SqlClient;
  secret: string;
  now: () => Date;
  cookieSecure: boolean;
}

export function parseInput<S extends ZodTypeAny>(schema: S, body: unknown): ZodOutput<S> {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new HttpError(400, issue?.message || "Dados inválidos.");
  }
  return parsed.data;
}

export async function readJson(c: Context): Promise<unknown> {
  return c.req.json().catch(() => {
    throw new HttpError(400, "JSON inválido.");
  });
}

function normalizeIp(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith("::ffff:")) return trimmed.slice("::ffff:".length);
  return trimmed;
}

function trustedProxySet(proxies: readonly string[]): Set<string> {
  return new Set(proxies.map((item) => normalizeIp(item)).filter(Boolean));
}

function rightmostUntrusted(header: string, trusted: Set<string>): string | null {
  const hops = header.split(",").map((item) => normalizeIp(item)).filter(Boolean);
  for (let index = hops.length - 1; index >= 0; index -= 1) {
    const hop = hops[index];
    if (hop && !trusted.has(hop)) return hop;
  }
  return null;
}

export function clientAddress(input: {
  socketAddress: string | null;
  forwardedFor: string | null;
  vercelForwardedFor: string | null;
  trustedProxies: readonly string[];
  vercel: boolean;
}): string {
  const socket = input.socketAddress ? normalizeIp(input.socketAddress) : "local";
  const trusted = trustedProxySet(input.trustedProxies);
  if (!trusted.has(socket)) return socket;
  const header = input.vercel && input.vercelForwardedFor ? input.vercelForwardedFor : input.forwardedFor;
  if (!header) return socket;
  return rightmostUntrusted(header, trusted) ?? socket;
}

export function clientIp(c: Context, env: NodeJS.ProcessEnv = process.env): string {
  let socketAddress: string | null = null;
  try {
    socketAddress = getConnInfo(c).remote.address ?? null;
  } catch {
    socketAddress = null;
  }
  const trustedProxies = (env.TRUSTED_PROXIES ?? "").split(",").map((item) => item.trim()).filter(Boolean);
  return clientAddress({
    socketAddress,
    forwardedFor: c.req.header("x-forwarded-for") ?? null,
    vercelForwardedFor: c.req.header("x-vercel-forwarded-for") ?? null,
    trustedProxies,
    vercel: env.VERCEL === "1",
  });
}

export async function requireActor(c: Context, runtime: AdminRuntime, resource: Resource): Promise<Actor> {
  const token = tokenFromRequest(c.req.header("authorization"), c.req.header("cookie"));
  if (!token) throw new HttpError(401, "Faça login para continuar.");
  const claims = readSession(token, runtime.secret, runtime.now());
  if (!claims) throw new HttpError(401, "Sessão inválida ou vencida.");
  if (!(await sessionIsLive(runtime.sql, claims, runtime.now()))) throw new HttpError(401, "Sessão inválida ou vencida.");
  const actor = await loadActor(runtime.sql, claims);
  if (!actor) throw new HttpError(401, "Sessão inválida ou vencida.");
  if (!can(actor.role, resource)) throw new HttpError(403, "Seu papel não faz isso.");
  return actor;
}

async function loadActor(sql: Sql, claims: SessionClaims): Promise<Actor | null> {
  const rows = await sql.query<{ id: string; email: string; name: string; role: Role; active: boolean }>(
    "select id, email, name, role, active from admin_users where id = $1",
    [claims.sub],
  );
  const row = rows.rows[0];
  if (!row?.active) return null;
  if (row.role !== "dono" && row.role !== "editor" && row.role !== "atendimento") return null;
  return { id: row.id, email: row.email, name: row.name, role: row.role };
}

export async function guard<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof CatalogError) throw new HttpError(error.status as ContentfulStatusCode, error.message);
    const code = typeof error === "object" && error && "code" in error ? String((error as { code: unknown }).code) : "";
    if (code === "23503") throw new HttpError(400, "O vínculo não existe.");
    if (code === "23505") throw new HttpError(409, "Já existe um registro com esse identificador.");
    if (code === "23514") throw new HttpError(400, "Os dados não passam na regra do banco.");
    throw error;
  }
}

function pgCode(error: unknown): string {
  return typeof error === "object" && error && "code" in error ? String((error as { code: unknown }).code) : "";
}

export function raiseCatalog(error: unknown): never {
  if (error instanceof CatalogError) throw new HttpError(error.status as ContentfulStatusCode, error.message);
  if (pgCode(error) === "23503") throw new HttpError(409, "Este registro está em uso.");
  if (pgCode(error) === "23505") throw new HttpError(409, "Já existe um registro com esse identificador.");
  if (pgCode(error) === "23514") throw new HttpError(400, "Os dados não passam na regra do banco.");
  throw error;
}

export function pageQuery(c: Context, fallbackSize: number): { page: number; pageSize: number; q: string } {
  const page = Math.max(1, Number(c.req.query("page") ?? 1) || 1);
  const requested = Number(c.req.query("pageSize") ?? fallbackSize) || fallbackSize;
  const pageSize = Math.min(100, Math.max(1, requested));
  const q = (c.req.query("q") ?? "").trim().slice(0, 80);
  return { page, pageSize, q };
}

const LOCAL_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

export function applyAdminCors(c: Context): Response | null {
  const origin = c.req.header("origin");
  if (!origin) return null;
  const allowed = new Set(
    [process.env.NEXT_PUBLIC_SITE_URL, process.env.ADMIN_CORS_ORIGIN].filter((item): item is string => Boolean(item)),
  );
  const ok = allowed.has(origin) || (process.env.NODE_ENV !== "production" && LOCAL_ORIGIN.test(origin));
  if (!ok) return c.json({ error: "Origem não permitida." }, 403);
  c.header("access-control-allow-origin", origin);
  c.header("access-control-allow-credentials", "true");
  c.header("access-control-allow-headers", "content-type, authorization");
  c.header("access-control-allow-methods", "GET, POST, PATCH, DELETE, OPTIONS");
  c.header("vary", "Origin");
  if (c.req.method === "OPTIONS") return c.body(null, 204);
  return null;
}
