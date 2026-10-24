import { loginEmailIpKey, normalizeLoginEmail, onlyDigits, POINT_VALUE_CENTS } from "@pulso/domain";
import { CatalogError } from "@pulso/db/catalog";
import { loadCpfKeys, maskCpf, presentCustomerCpf, sealCpf } from "@pulso/db/cpf";
import { hashPassword, verifyPassword } from "@pulso/db/password";
import { writeCustomerCpf } from "@pulso/db/resources";
import type { SqlClient } from "@pulso/db/sql";
import { randomUUID } from "node:crypto";
import type { Context, Hono } from "hono";
import Redis from "ioredis";
import { z } from "zod";
import type { AdminAppOptions } from "./admin/router";
import { clientIp, HttpError, parseInput, readJson } from "./admin/http";
import {
  clearCustomerCookie,
  CUSTOMER_SESSION_SECONDS,
  customerCookie,
  customerCookieSecure,
  customerSessionSecret,
  customerTokenFromRequest,
  signCustomerSession,
  readCustomerSession,
} from "./account-session";
import { buildPlacedCheckout, parseCheckoutSimulate, type PointAccount } from "./checkout-quote";

const BUSY = "Muitas tentativas de login. Espera alguns minutos.";
const IP_LIMIT = 30;
const LOCK_MS = 15 * 60 * 1000;

const registerSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome.").max(120),
  email: z.string().trim().email("E-mail inválido.").max(180),
  password: z.string().min(12, "A senha precisa de pelo menos 12 caracteres.").max(200),
  cpf: z.string().trim().max(20).optional(),
});

const loginSchema = z.object({
  email: z.string().trim().email("E-mail inválido.").max(180),
  password: z.string().min(1, "Informe a senha.").max(200),
});

interface CustomerRow {
  id: string;
  email: string;
  name: string;
  password_hash: string | null;
  points_balance: number;
  points_lifetime: number;
  phone: string | null;
  cpf: string | null;
  cpf_enc: Uint8Array | null;
  cpf_key_id: string | null;
}

const ipHits = new Map<string, { failures: number; reset: number; byUser: Map<string, number> }>();
const emailIpHits = new Map<string, { failures: number; reset: number }>();
let dummyHash: string | null = null;
let redisClient: Redis | null = null;
let redisUrl = "";
let redisOpening: Promise<void> | null = null;

export function resetAccountLoginLimits(): void {
  ipHits.clear();
  emailIpHits.clear();
}

export function disconnectAccountRedis(): void {
  redisOpening = null;
  const client = redisClient;
  redisClient = null;
  redisUrl = "";
  client?.disconnect();
}

function accountRedis(): Redis | null {
  const url = process.env.REDIS_URL;
  if (!url) return null;
  if (redisClient && redisUrl === url && redisClient.status !== "end") return redisClient;
  redisClient?.disconnect();
  redisOpening = null;
  redisUrl = url;
  redisClient = new Redis(url, {
    connectTimeout: 800,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    lazyConnect: true,
  });
  redisClient.on("error", () => {
    // connect() e o comando já devolvem a falha. Sem ouvinte o processo cai.
  });
  return redisClient;
}

async function openAccountRedis(): Promise<Redis | null> {
  const client = accountRedis();
  if (!client) return null;
  if (client.status !== "ready") {
    if (!redisOpening) {
      redisOpening = client.connect().then(() => undefined).finally(() => {
        redisOpening = null;
      });
    }
    await redisOpening;
  }
  if (client.status !== "ready") throw new Error("Redis da conta não ficou pronto.");
  return client;
}

function memoryBucket(ip: string, now: number) {
  const current = ipHits.get(ip);
  if (!current || current.reset <= now) return null;
  return current;
}

function memoryBlocked(ip: string, email: string, now: number): boolean {
  const bucket = memoryBucket(ip, now);
  if (!bucket) return false;
  const own = bucket.byUser.get(email) ?? 0;
  return bucket.failures - own >= IP_LIMIT;
}

function memoryNote(ip: string, email: string, now: number): boolean {
  let bucket = ipHits.get(ip);
  if (!bucket || bucket.reset <= now) {
    bucket = { failures: 0, reset: now + LOCK_MS, byUser: new Map() };
    ipHits.set(ip, bucket);
  }
  bucket.failures += 1;
  bucket.byUser.set(email, (bucket.byUser.get(email) ?? 0) + 1);
  const pairKey = loginEmailIpKey(email, ip);
  let pair = emailIpHits.get(pairKey);
  if (!pair || pair.reset <= now) {
    pair = { failures: 0, reset: now + LOCK_MS };
    emailIpHits.set(pairKey, pair);
  }
  pair.failures += 1;
  return bucket.failures <= IP_LIMIT && pair.failures <= IP_LIMIT;
}

function memoryClear(ip: string, email: string, now: number): void {
  const bucket = memoryBucket(ip, now);
  if (bucket) {
    const own = bucket.byUser.get(email) ?? 0;
    bucket.failures = Math.max(0, bucket.failures - own);
    bucket.byUser.delete(email);
    if (bucket.failures <= 0) ipHits.delete(ip);
  }
  emailIpHits.delete(loginEmailIpKey(email, ip));
}

async function redisBlocked(ip: string, email: string): Promise<boolean> {
  const client = await openAccountRedis();
  if (!client) return false;
  const total = Number((await client.get(`pulso:account:login:ip:${ip}`)) ?? 0);
  const own = Number((await client.get(`pulso:account:login:ipuser:${ip}:${email}`)) ?? 0);
  const pair = Number((await client.get(`pulso:account:login:emailip:${loginEmailIpKey(email, ip)}`)) ?? 0);
  return total - own >= IP_LIMIT || pair >= IP_LIMIT;
}

async function redisNote(ip: string, email: string): Promise<boolean> {
  const client = await openAccountRedis();
  if (!client) return false;
  const ipKey = `pulso:account:login:ip:${ip}`;
  const userKey = `pulso:account:login:ipuser:${ip}:${email}`;
  const pairKey = `pulso:account:login:emailip:${loginEmailIpKey(email, ip)}`;
  const count = await client.incr(ipKey);
  if (count === 1 || (await client.ttl(ipKey)) < 0) await client.expire(ipKey, LOCK_MS / 1000);
  const userCount = await client.incr(userKey);
  if (userCount === 1 || (await client.ttl(userKey)) < 0) await client.expire(userKey, LOCK_MS / 1000);
  const pairCount = await client.incr(pairKey);
  if (pairCount === 1 || (await client.ttl(pairKey)) < 0) await client.expire(pairKey, LOCK_MS / 1000);
  return count <= IP_LIMIT && pairCount <= IP_LIMIT;
}

async function redisClear(ip: string, email: string): Promise<void> {
  const client = await openAccountRedis();
  if (!client) return;
  const userKey = `pulso:account:login:ipuser:${ip}:${email}`;
  const own = Number((await client.get(userKey)) ?? 0);
  if (own > 0) {
    const left = await client.decrby(`pulso:account:login:ip:${ip}`, own);
    if (left <= 0) await client.del(`pulso:account:login:ip:${ip}`);
  }
  await client.del(userKey);
  await client.del(`pulso:account:login:emailip:${loginEmailIpKey(email, ip)}`);
}

async function dummy(): Promise<string> {
  dummyHash ??= await hashPassword("senha-dummy-pulso-conta");
  return dummyHash;
}

function uniqueViolation(error: unknown): boolean {
  const code = (error as { code?: string }).code;
  if (code === "23505") return true;
  const message = error instanceof Error ? error.message : "";
  return /unique|duplicate key/i.test(message);
}

function publicCustomer(row: { id: string; email: string; name: string }, cpfMasked: string | null) {
  return { id: row.id, email: row.email, name: row.name, cpfMasked };
}

async function loadCustomer(sql: SqlClient, id: string): Promise<CustomerRow | null> {
  const found = await sql.query<CustomerRow>(
    `select id, email, name, password_hash, points_balance, points_lifetime, phone, cpf, cpf_enc, cpf_key_id
     from customers where id = $1`,
    [id],
  );
  return found.rows[0] ?? null;
}

function maskedCpf(row: { cpf: string | null; cpf_enc: Uint8Array | null; cpf_key_id: string | null }): string | null {
  try {
    return presentCustomerCpf(row, loadCpfKeys());
  } catch {
    return null;
  }
}

export async function customerPointAccount(c: Context, sql: SqlClient | null, options: AdminAppOptions = {}): Promise<PointAccount | null> {
  if (!sql) return null;
  const secret = customerSessionSecret(process.env, options.sessionSecret);
  if (!secret) return null;
  const token = customerTokenFromRequest(c.req.header("authorization"), c.req.header("cookie"));
  if (!token) return null;
  const claims = readCustomerSession(token, secret);
  if (!claims) return null;
  const row = await loadCustomer(sql, claims.sub);
  if (!row) return null;
  return { pointsBalance: Number(row.points_balance), lifetimePoints: Number(row.points_lifetime) };
}

function requireSql(sql: SqlClient | null): SqlClient {
  if (!sql) throw new HttpError(503, "A conta da loja precisa do Postgres.");
  return sql;
}

export function mountAccount(app: Hono, dataSql: () => SqlClient | null, options: AdminAppOptions = {}): void {
  const runtime = () => {
    const secret = customerSessionSecret(process.env, options.sessionSecret);
    if (!secret) throw new HttpError(503, "Sessão da conta sem segredo. Defina ADMIN_SESSION_SECRET.");
    return {
      sql: requireSql(dataSql()),
      secret,
      secure: customerCookieSecure(process.env, options.cookieSecure),
      now: options.now ?? (() => new Date()),
    };
  };

  const actor = async (c: Context) => {
    const ctx = runtime();
    const token = customerTokenFromRequest(c.req.header("authorization"), c.req.header("cookie"));
    if (!token) throw new HttpError(401, "Faça login para continuar.");
    const claims = readCustomerSession(token, ctx.secret, ctx.now());
    if (!claims) throw new HttpError(401, "Sessão inválida ou vencida.");
    const row = await loadCustomer(ctx.sql, claims.sub);
    if (!row) throw new HttpError(401, "Sessão inválida ou vencida.");
    return { ctx, row };
  };

  const issue = (c: Context, row: CustomerRow, secret: string, secure: boolean, now: Date, status: 200 | 201 = 200) => {
    const exp = Math.floor(now.getTime() / 1000) + CUSTOMER_SESSION_SECONDS;
    const token = signCustomerSession({ sub: row.id, email: row.email, name: row.name, exp, jti: randomUUID() }, secret);
    c.header("set-cookie", customerCookie(token, CUSTOMER_SESSION_SECONDS, secure));
    c.header("cache-control", "no-store");
    return c.json({ user: publicCustomer(row, maskedCpf(row)) }, status);
  };

  app.post("/v1/account/register", async (c) => {
    const ctx = runtime();
    const body = parseInput(registerSchema, await readJson(c));
    const email = normalizeLoginEmail(body.email);
    const cpf = body.cpf?.trim() ? body.cpf : undefined;
    const keys = cpf ? loadCpfKeys() : null;
    if (cpf) {
      if (!keys) throw new HttpError(503, "CPF sem chave no servidor.");
      if (!sealCpf(cpf, keys)) throw new HttpError(400, "CPF inválido.");
    }
    const id = `cus_${randomUUID()}`;
    const passwordHash = await hashPassword(body.password);
    await ctx.sql.begin();
    try {
      await ctx.sql.query(
        "insert into customers (id, email, name, password_hash) values ($1, $2, $3, $4)",
        [id, email, body.name.trim(), passwordHash],
      );
      if (cpf && keys) await writeCustomerCpf(ctx.sql, id, cpf, keys);
      await ctx.sql.commit();
    } catch (error) {
      await ctx.sql.rollback();
      if (error instanceof CatalogError) throw new HttpError(error.status === 409 ? 409 : 400, error.message);
      if (uniqueViolation(error)) throw new HttpError(409, "Esse e-mail já tem conta.");
      throw error;
    }
    const row = await loadCustomer(ctx.sql, id);
    if (!row) throw new HttpError(500, "Erro interno.");
    return issue(c, row, ctx.secret, ctx.secure, ctx.now(), 201);
  });

  app.post("/v1/account/login", async (c) => {
    const ctx = runtime();
    const body = parseInput(loginSchema, await readJson(c));
    const email = normalizeLoginEmail(body.email);
    const ip = clientIp(c);
    const now = Date.now();
    let memory = !process.env.REDIS_URL;
    const blocked = async () => {
      if (!memory) {
        try {
          return await redisBlocked(ip, email);
        } catch {
          memory = true;
        }
      }
      return memoryBlocked(ip, email, now);
    };
    if (await blocked()) {
      c.header("retry-after", "900");
      throw new HttpError(429, BUSY);
    }
    const found = await ctx.sql.query<CustomerRow>(
      `select id, email, name, password_hash, points_balance, points_lifetime, phone, cpf, cpf_enc, cpf_key_id
       from customers where lower(email) = $1`,
      [email],
    );
    const row = found.rows[0];
    const hash = row?.password_hash ?? (await dummy());
    const matches = await verifyPassword(body.password, hash);
    const note = async () => {
      let allowed = false;
      if (!memory) {
        try {
          allowed = await redisNote(ip, email);
        } catch {
          memory = true;
        }
      }
      if (memory) allowed = memoryNote(ip, email, now);
      if (!allowed) {
        c.header("retry-after", "900");
        throw new HttpError(429, BUSY);
      }
      throw new HttpError(401, "E-mail ou senha não confere.");
    };
    if (!row?.password_hash || !matches) return note();
    if (!memory) {
      try {
        await redisClear(ip, email);
      } catch {
        memory = true;
      }
    }
    if (memory) memoryClear(ip, email, now);
    return issue(c, row, ctx.secret, ctx.secure, ctx.now());
  });

  app.post("/v1/account/logout", async (c) => {
    const ctx = runtime();
    c.header("set-cookie", clearCustomerCookie(ctx.secure));
    c.header("cache-control", "no-store");
    return c.body(null, 204);
  });

  app.get("/v1/account/me", async (c) => {
    const { row } = await actor(c);
    c.header("cache-control", "no-store");
    return c.json({ user: publicCustomer(row, maskedCpf(row)) });
  });

  app.get("/v1/account/orders", async (c) => {
    const { ctx, row } = await actor(c);
    const orders = await ctx.sql.query<{
      id: string;
      code: string;
      status: string;
      total_cents: number;
      created_at: Date | string;
    }>(
      `select id, code, status, total_cents, created_at
       from orders
       where account_id = $1 and customer_id = $1
       order by created_at desc`,
      [row.id],
    );
    const ids = orders.rows.map((order) => order.id);
    const lines = ids.length
      ? await ctx.sql.query<{
          order_id: string;
          product_slug: string;
          variant_id: string;
          name: string;
          quantity: number;
          unit_price_cents: number;
        }>(
          `select order_id, product_slug, variant_id, name, quantity, unit_price_cents
           from order_lines where order_id = any($1::text[])`,
          [ids],
        )
      : { rows: [] };
    c.header("cache-control", "no-store");
    return c.json({
      orders: orders.rows.map((order) => ({
        id: order.id,
        code: order.code,
        status: order.status,
        totalCents: Number(order.total_cents),
        createdAt: order.created_at instanceof Date ? order.created_at.toISOString() : new Date(order.created_at).toISOString(),
        lines: lines.rows
          .filter((line) => line.order_id === order.id)
          .map((line) => ({
            slug: line.product_slug,
            variantId: line.variant_id,
            name: line.name,
            quantity: Number(line.quantity),
            unitPriceCents: Number(line.unit_price_cents),
          })),
      })),
    });
  });

  app.post("/v1/account/orders", async (c) => {
    const { ctx, row } = await actor(c);
    const body = await readJson(c);
    const parsed = parseCheckoutSimulate(body);
    if ("error" in parsed) throw new HttpError(400, parsed.error);
    const account: PointAccount = {
      pointsBalance: Number(row.points_balance),
      lifetimePoints: Number(row.points_lifetime),
    };
    const placed = await buildPlacedCheckout(parsed, ctx.sql, account);
    if ("error" in placed) {
      return c.json(
        {
          error: placed.error,
          ...(placed.code ? { code: placed.code } : {}),
          ...(placed.errors ? { errors: placed.errors } : {}),
        },
        placed.status,
      );
    }
    const keys = loadCpfKeys();
    if (!keys) throw new HttpError(503, "CPF sem chave no servidor.");
    if (!sealCpf(parsed.checkout.cpf, keys)) throw new HttpError(400, "CPF inválido.");
    const pointsRedeemed = POINT_VALUE_CENTS > 0 ? Math.floor(placed.quote.pointsCents / POINT_VALUE_CENTS) : 0;
    const id = `ord_${randomUUID()}`;
    const code = `PL${randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase()}`;
    const snapshot = placed.lines.map((line) => ({
      slug: line.slug,
      variant: line.variant,
      name: line.name,
      qty: line.qty,
      unitCents: line.unitCents,
    }));
    await ctx.sql.begin();
    try {
      await ctx.sql.query(
        `insert into orders (
           id, code, customer_id, account_id, email, status, payment_method,
           subtotal_cents, discount_cents, pix_cents, shipping_cents, total_cents, points_earned, items
         ) values ($1, $2, $3, $3, $4, 'pagamento_pendente', $5, $6, $7, $8, $9, $10, $11, $12::jsonb)`,
        [
          id,
          code,
          row.id,
          row.email,
          parsed.checkout.paymentMethod,
          placed.quote.grossCents,
          placed.quote.discountCents,
          placed.quote.pixCents,
          placed.quote.shippingCents,
          placed.quote.totalCents,
          placed.quote.pointsEarned,
          JSON.stringify(snapshot),
        ],
      );
      for (const line of placed.lines) {
        await ctx.sql.query(
          `insert into order_lines (id, order_id, product_slug, variant_id, name, quantity, unit_price_cents)
           values ($1, $2, $3, $4, $5, $6, $7)`,
          [`lin_${randomUUID()}`, id, line.slug, line.variant, line.name, line.qty, line.unitCents],
        );
      }
      await ctx.sql.query(
        `insert into addresses (id, customer_id, cep, street, number, complement, neighborhood, city, state, is_default)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, true)`,
        [
          `adr_${randomUUID()}`,
          row.id,
          onlyDigits(parsed.checkout.cep),
          parsed.checkout.street.trim(),
          parsed.checkout.number.trim(),
          parsed.checkout.complement?.trim() || null,
          parsed.checkout.neighborhood.trim(),
          parsed.checkout.city.trim(),
          parsed.checkout.state.trim().toUpperCase(),
        ],
      );
      const phone = onlyDigits(parsed.checkout.phone);
      await ctx.sql.query("update customers set phone = $2 where id = $1", [row.id, phone]);
      if (pointsRedeemed > 0) {
        const spent = await ctx.sql.query(
          "update customers set points_balance = points_balance - $2 where id = $1 and points_balance >= $2 returning id",
          [row.id, pointsRedeemed],
        );
        if (!spent.rows.length) throw new HttpError(422, "O saldo de pontos ainda não está no servidor.");
      }
      await writeCustomerCpf(ctx.sql, row.id, parsed.checkout.cpf, keys);
      await ctx.sql.commit();
    } catch (error) {
      await ctx.sql.rollback();
      if (error instanceof HttpError) throw error;
      if (error instanceof CatalogError) throw new HttpError(error.status === 409 ? 409 : 400, error.message);
      if (uniqueViolation(error)) throw new HttpError(409, "Já existe um cliente com esse CPF.");
      throw error;
    }
    c.header("cache-control", "no-store");
    return c.json({
      message: placed.message,
      order: {
        id,
        code,
        status: "pagamento_pendente",
        email: row.email,
        subtotalCents: placed.quote.grossCents,
        discountCents: placed.quote.discountCents,
        pixCents: placed.quote.pixCents,
        shippingCents: placed.quote.shippingCents,
        totalCents: placed.quote.totalCents,
        lines: snapshot.map((line) => ({
          slug: line.slug,
          variantId: line.variant,
          name: line.name,
          quantity: line.qty,
          unitPriceCents: line.unitCents,
        })),
      },
    });
  });
}
