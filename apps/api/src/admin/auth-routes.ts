import { writeAudit } from "@pulso/db/audit";
import { hashPassword, verifyPassword } from "@pulso/db/password";
import { randomUUID } from "node:crypto";
import type { Hono } from "hono";
import Redis from "ioredis";
import { z } from "zod";
import type { Context } from "hono";
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
  return Math.min(8_000, 100 * 2 ** Math.min(failedAttempts - 2, 7));
}

const ipHits = new Map<string, { count: number; reset: number }>();
const slots = new Map<string, { inflight: boolean; notBefore: number }>();
let dummyHash: string | null = null;
let proofs = 0;
let redisClient: Redis | null = null;
let redisUrl = "";

const BUSY = "Muitas tentativas de login. Espera alguns minutos.";

async function dummy(): Promise<string> {
  dummyHash ??= await hashPassword("senha-dummy-pulso");
  return dummyHash;
}

function reserveIpMap(ip: string, now: number): boolean {
  const current = ipHits.get(ip);
  if (!current || current.reset <= now) {
    ipHits.set(ip, { count: 1, reset: now + LOCK_MS });
    return true;
  }
  current.count += 1;
  return current.count <= IP_LIMIT;
}

function slotKey(email: string, ip: string): string {
  return `${email}\n${ip}`;
}

function reserveSlotMap(email: string, ip: string, now: number): { ok: true } | { ok: false; retryAfter: number } {
  const key = slotKey(email, ip);
  const slot = slots.get(key);
  if (slot?.inflight) return { ok: false, retryAfter: 1 };
  if (slot && slot.notBefore > now) {
    return { ok: false, retryAfter: Math.max(1, Math.ceil((slot.notBefore - now) / 1000)) };
  }
  slots.set(key, { inflight: true, notBefore: 0 });
  return { ok: true };
}

function settleSlotMap(email: string, ip: string, now: number, delayMs: number): void {
  if (delayMs <= 0) {
    slots.delete(slotKey(email, ip));
    return;
  }
  slots.set(slotKey(email, ip), { inflight: false, notBefore: now + delayMs });
}

function redis(): Redis | null {
  const url = process.env.REDIS_URL;
  if (!url) return null;
  if (redisClient && redisUrl === url) return redisClient;
  redisClient?.disconnect();
  redisUrl = url;
  redisClient = new Redis(url, {
    connectTimeout: 800,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    lazyConnect: true,
  });
  return redisClient;
}

async function reserveIpRedis(ip: string): Promise<boolean> {
  const client = redis();
  if (!client) return false;
  const key = `pulso:login:ip:${ip}`;
  const count = await client.incr(key);
  if (count === 1 || (await client.ttl(key)) < 0) await client.expire(key, LOCK_MS / 1000);
  return count <= IP_LIMIT;
}

async function reserveSlotRedis(email: string, ip: string): Promise<{ ok: true } | { ok: false; retryAfter: number }> {
  const client = redis();
  if (!client) return { ok: false, retryAfter: 1 };
  const key = `pulso:login:slot:${email}:${ip}`;
  const set = await client.set(key, "1", "PX", 30_000, "NX");
  if (set === "OK") return { ok: true };
  const ttl = await client.pttl(key);
  return { ok: false, retryAfter: Math.max(1, Math.ceil(Math.max(ttl, 1000) / 1000)) };
}

async function settleSlotRedis(email: string, ip: string, delayMs: number): Promise<void> {
  const client = redis();
  if (!client) return;
  const key = `pulso:login:slot:${email}:${ip}`;
  if (delayMs <= 0) {
    await client.del(key);
    return;
  }
  await client.set(key, "1", "PX", delayMs);
}

export function loginProofCount(): number {
  return proofs;
}

export function resetLoginLimits(): void {
  ipHits.clear();
  slots.clear();
  proofs = 0;
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
    const now = ctx.now();
    const ip = clientIp(c);
    let memory = !process.env.REDIS_URL;
    let allowed = false;
    if (memory) {
      allowed = reserveIpMap(ip, now.getTime());
    } else {
      try {
        allowed = await reserveIpRedis(ip);
      } catch {
        memory = true;
        allowed = reserveIpMap(ip, now.getTime());
      }
    }
    if (!allowed) {
      c.header("retry-after", "900");
      throw new HttpError(429, BUSY);
    }
    const body = parseInput(loginSchema, await readJson(c));
    const email = body.email.toLowerCase();
    const clock = Date.now();
    let gate: { ok: true } | { ok: false; retryAfter: number };
    if (memory) {
      gate = reserveSlotMap(email, ip, clock);
    } else {
      try {
        gate = await reserveSlotRedis(email, ip);
      } catch {
        memory = true;
        gate = reserveSlotMap(email, ip, clock);
      }
    }
    if (!gate.ok) {
      c.header("retry-after", String(gate.retryAfter));
      throw new HttpError(429, BUSY);
    }
    let held = true;
    const settle = async (delayMs: number) => {
      held = false;
      if (!memory) {
        try {
          await settleSlotRedis(email, ip, delayMs);
          return;
        } catch {
          memory = true;
        }
      }
      settleSlotMap(email, ip, Date.now(), delayMs);
    };
    try {
      const found = await ctx.sql.query<UserRow>(
        `select id, email, name, role, password_hash, active, failed_attempts, locked_until
         from admin_users where email = $1`,
        [email],
      );
      const user = found.rows[0];
      if (!user || !user.active || !isRole(user.role)) {
        proofs += 1;
        await verifyPassword(body.password, await dummy());
        await settle(0);
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
      proofs += 1;
      const ok = await verifyPassword(body.password, user.password_hash);
      if (!ok) {
        await settle(loginBackoffMs(attempts));
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
      await settle(0);
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
    } finally {
      if (held) await settle(0);
    }
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

  const audit = async (c: Context) => {
    const ctx = runtime();
    await requireActor(c, ctx, "audit");
    const paging = pageQuery(c, 50);
    const actorId = (c.req.query("actor") ?? "").trim().slice(0, 80);
    const entity = (c.req.query("entity") ?? "").trim().slice(0, 40);
    const entityId = (c.req.query("entityId") ?? "").trim().slice(0, 80);
    const from = parseAuditBound(c.req.query("from"), false);
    const to = parseAuditBound(c.req.query("to"), true);
    const where: string[] = [];
    const params: unknown[] = [];
    if (actorId) {
      params.push(actorId);
      where.push(`actor_id = $${params.length}`);
    }
    if (entity) {
      params.push(entity);
      where.push(`entity = $${params.length}`);
    }
    if (entityId) {
      params.push(entityId);
      where.push(`entity_id = $${params.length}`);
    }
    if (from) {
      params.push(from.instant.toISOString());
      where.push(`created_at >= $${params.length}::timestamptz`);
    }
    if (to) {
      params.push(to.instant.toISOString());
      where.push(to.exclusive ? `created_at < $${params.length}::timestamptz` : `created_at <= $${params.length}::timestamptz`);
    }
    const clause = where.length ? `where ${where.join(" and ")}` : "";
    const total = await ctx.sql.query<{ total: number }>(`select count(*)::int as total from audit_log ${clause}`, params);
    const rows = await ctx.sql.query<{
      id: string;
      actor_id: string | null;
      action: string;
      entity: string;
      entity_id: string | null;
      before_data: unknown;
      after_data: unknown;
      created_at: Date | string;
    }>(
      `select id, actor_id, action, entity, entity_id, before_data, after_data, created_at
       from audit_log ${clause}
       order by created_at desc
       limit $${params.length + 1} offset $${params.length + 2}`,
      [...params, paging.pageSize, (paging.page - 1) * paging.pageSize],
    );
    return c.json({
      page: paging.page,
      pageSize: paging.pageSize,
      total: Number(total.rows[0]?.total ?? 0),
      items: rows.rows.map((row) => ({
        id: row.id,
        actorId: row.actor_id,
        action: row.action,
        entity: row.entity,
        entityId: row.entity_id,
        before: row.before_data,
        after: row.after_data,
        createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : new Date(row.created_at).toISOString(),
      })),
    });
  };
  admin.get("/audit", audit);
  admin.get("/audit-log", audit);
}

function parseAuditBound(raw: string | undefined, end: boolean): { instant: Date; exclusive: boolean } | undefined {
  const value = (raw ?? "").trim();
  if (!value) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const start = new Date(`${value}T00:00:00.000Z`);
    if (Number.isNaN(start.getTime())) throw new HttpError(400, "Data inválida.");
    if (!end) return { instant: start, exclusive: false };
    return { instant: new Date(start.getTime() + 24 * 60 * 60 * 1000), exclusive: true };
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new HttpError(400, "Data inválida.");
  return { instant: date, exclusive: false };
}
