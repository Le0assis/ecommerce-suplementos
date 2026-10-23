import { CatalogError } from "@pulso/db/catalog";
import type { Sql, SqlClient } from "@pulso/db/sql";
import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { ZodTypeAny, output as ZodOutput } from "zod";
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

export function clientIp(c: Context): string {
  const forwarded = c.req.header("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || "local";
  return "local";
}

export async function requireActor(c: Context, runtime: AdminRuntime, resource: Resource): Promise<Actor> {
  const token = tokenFromRequest(c.req.header("authorization"), c.req.header("cookie"));
  if (!token) throw new HttpError(401, "Faça login para continuar.");
  const claims = readSession(token, runtime.secret, runtime.now());
  if (!claims) throw new HttpError(401, "Sessão inválida ou vencida.");
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

export function raiseCatalog(error: unknown): never {
  if (error instanceof CatalogError) throw new HttpError(error.status as ContentfulStatusCode, error.message);
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
