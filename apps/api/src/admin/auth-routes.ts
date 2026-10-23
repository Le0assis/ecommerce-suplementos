import { writeAudit } from "@pulso/db/audit";
import { hashPassword, verifyPassword } from "@pulso/db/password";
import { randomUUID } from "node:crypto";
import type { Hono } from "hono";
import { z } from "zod";
import { clientIp, HttpError, pageQuery, parseInput, readJson, requireActor, type AdminRuntime } from "./http";
import { openSession, revokeSession, sessionIsLive } from "./live-session";
import { isRole } from "./permissions";
import { clearCookie, readSession, sessionCookie, SESSION_SECONDS, signSession, tokenFromRequest } from "./session";

const loginSchema = z.object({
  email: z.string().trim().email("E-mail inválido.").max(180),
  password: z.string().min(1, "Informe a senha.").max(200),
});

const LOCK_MS = 15 * 60 * 1000;
const IP_LIMIT = 30;

export function loginBackoffMs(failedAttempts: number): number {
  if (failedAttempts <= 1) return 0;
  return Math.min(8_000, 100 * 2 ** Math.min(failedAttempts - 2, 6));
}

function wait(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const ipHits = new Map<string, { count: number; reset: number }>();
let dummyHash: string | null = null;

async function dummy(): Promise<string> {
  dummyHash ??= await hashPassword("senha-dummy-pulso");
  return dummyHash;
}

function ipLimited(ip: string, now: number): boolean {
  const current = ipHits.get(ip);
  if (!current || current.reset <= now) return false;
  return current.count >= IP_LIMIT;
}

function recordIp(ip: string, now: number): void {
  const current = ipHits.get(ip);
  if (!current || current.reset <= now) {
    ipHits.set(ip, { count: 1, reset: now + LOCK_MS });
    return;
  }
  current.count += 1;
}

export function resetLoginLimits(): void {
  ipHits.clear();
}

interface UserRow {
  id: string;
  email: string;
  name: string;
  role: string;
  password_hash: string;
  active: boolean;
  failed_attempts: number;
  locked_until: Date | string | null;
}

export function mountAuth(admin: Hono, runtime: () => AdminRuntime): void {
  admin.post("/login", async (c) => {
    const ctx = runtime();
    const body = parseInput(loginSchema, await readJson(c));
    const email = body.email.toLowerCase();
    const now = ctx.now();
    const ip = clientIp(c);
    if (ipLimited(ip, now.getTime())) {
      c.header("retry-after", "900");
      throw new HttpError(429, "Muitas tentativas de login. Espera alguns minutos.");
    }
    const found = await ctx.sql.query<UserRow>(
      `select id, email, name, role, password_hash, active, failed_attempts, locked_until
       from admin_users where email = $1`,
      [email],
    );
    const user = found.rows[0];
    if (!user || !user.active || !isRole(user.role)) {
      await verifyPassword(body.password, await dummy());
      recordIp(ip, now.getTime());
      await writeAudit(ctx.sql, {
        actorId: null,
        action: "login_failed",
        entity: "admin_user",
        entityId: null,
        after: { email },
      });
      throw new HttpError(401, "E-mail ou senha não confere.");
    }
    const bumped = await ctx.sql.query<{ failed_attempts: number }>(
      `update admin_users
       set failed_attempts = failed_attempts + 1, updated_at = now()
       where id = $1
       returning failed_attempts`,
      [user.id],
    );
    const attempts = Number(bumped.rows[0]?.failed_attempts ?? 1);
    const ok = await verifyPassword(body.password, user.password_hash);
    if (!ok) {
      recordIp(ip, now.getTime());
      await wait(loginBackoffMs(attempts));
      await writeAudit(ctx.sql, {
        actorId: null,
        action: "login_failed",
        entity: "admin_user",
        entityId: user.id,
        after: { email },
      });
      throw new HttpError(401, "E-mail ou senha não confere.");
    }
    await ctx.sql.query(
      "update admin_users set failed_attempts = 0, locked_until = null, updated_at = now() where id = $1",
      [user.id],
    );
    const exp = Math.floor(now.getTime() / 1000) + SESSION_SECONDS;
    const jti = randomUUID();
    await openSession(ctx.sql, jti, user.id, new Date(exp * 1000));
    const token = signSession({ sub: user.id, email: user.email, name: user.name, role: user.role, exp, jti }, ctx.secret);
    await writeAudit(ctx.sql, {
      actorId: user.id,
      action: "login",
      entity: "admin_user",
      entityId: user.id,
      after: { email: user.email, role: user.role },
    });
    c.header("set-cookie", sessionCookie(token, SESSION_SECONDS, ctx.cookieSecure));
    return c.json({ user: { id: user.id, email: user.email, name: user.name, role: user.role } });
  });

  admin.post("/logout", async (c) => {
    const ctx = runtime();
    const token = tokenFromRequest(c.req.header("authorization"), c.req.header("cookie"));
    const now = ctx.now();
    const claims = token ? readSession(token, ctx.secret, now) : null;
    if (claims && (await sessionIsLive(ctx.sql, claims, now))) {
      await revokeSession(ctx.sql, claims.jti, now);
      await writeAudit(ctx.sql, {
        actorId: claims.sub,
        action: "logout",
        entity: "admin_user",
        entityId: claims.sub,
        after: { email: claims.email },
      });
    }
    c.header("set-cookie", clearCookie(ctx.cookieSecure));
    return c.body(null, 204);
  });

  admin.get("/me", async (c) => {
    const ctx = runtime();
    const token = tokenFromRequest(c.req.header("authorization"), c.req.header("cookie"));
    if (!token) throw new HttpError(401, "Faça login para continuar.");
    const claims = readSession(token, ctx.secret, ctx.now());
    if (!claims) throw new HttpError(401, "Sessão inválida ou vencida.");
    if (!(await sessionIsLive(ctx.sql, claims, ctx.now()))) throw new HttpError(401, "Sessão inválida ou vencida.");
    const rows = await ctx.sql.query<{ id: string; email: string; name: string; role: string; active: boolean }>(
      "select id, email, name, role, active from admin_users where id = $1",
      [claims.sub],
    );
    const user = rows.rows[0];
    if (!user?.active || !isRole(user.role)) throw new HttpError(401, "Sessão inválida ou vencida.");
    return c.json({ user: { id: user.id, email: user.email, name: user.name, role: user.role } });
  });

  admin.get("/audit-log", async (c) => {
    const ctx = runtime();
    const actor = await requireActor(c, ctx, "audit");
    const paging = pageQuery(c, 50);
    const entity = (c.req.query("entity") ?? "").slice(0, 40);
    const entityId = (c.req.query("entityId") ?? "").slice(0, 80);
    const where: string[] = [];
    const params: unknown[] = [];
    if (entity) {
      params.push(entity);
      where.push(`entity = $${params.length}`);
    }
    if (entityId) {
      params.push(entityId);
      where.push(`entity_id = $${params.length}`);
    }
    const clause = where.length ? `where ${where.join(" and ")}` : "";
    const rows = await ctx.sql.query(
      `select id, actor_id, action, entity, entity_id, before_data, after_data, created_at
       from audit_log ${clause}
       order by created_at desc
       limit $${params.length + 1}`,
      [...params, Math.min(paging.pageSize, 100)],
    );
    return c.json({ actor: actor.email, items: rows.rows });
  });
}
