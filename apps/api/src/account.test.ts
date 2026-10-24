import { randomBytes } from "node:crypto";
import type { SqlClient } from "@pulso/db/sql";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { disconnectAccountRedis, resetAccountLoginLimits } from "./account-routes";
import { auth, createAdminApp, createTestDb, login, resetTables, sampleProduct } from "./admin/harness";

const CPF = "52998224725";
const CPF_B = "39053344705";
const PASSWORD = "senha-conta-pulso";
const VARIANT = "caos-conta__limao__300";

let sql: SqlClient;
let close: () => Promise<void>;
const previousRedis = process.env.REDIS_URL;
const previousProxies = process.env.TRUSTED_PROXIES;
const previousKeyId = process.env.CPF_KEY_ID;
const previousEnc = process.env.CPF_ENC_KEY;
const previousHmac = process.env.CPF_HMAC_KEY;

function restore(name: "CPF_KEY_ID" | "CPF_ENC_KEY" | "CPF_HMAC_KEY" | "REDIS_URL" | "TRUSTED_PROXIES", value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

function checkoutBody(email: string, extraLines: Record<string, unknown> = {}, extraRoot: Record<string, unknown> = {}) {
  return {
    lines: [{ slug: "caos-conta", variant: VARIANT, qty: 1, ...extraLines }],
    ...extraRoot,
    checkout: {
      name: "Ana Luz",
      email,
      cpf: CPF,
      phone: "11987654321",
      cep: "01310100",
      street: "Avenida Paulista",
      number: "1000",
      neighborhood: "Bela Vista",
      city: "São Paulo",
      state: "SP",
      shippingMethod: "pac",
      paymentMethod: "pix",
      acceptLgpd: true,
      acceptAge: true,
      acceptTerms: true,
    },
  };
}

function customerToken(response: Response): string {
  const cookie = response.headers.get("set-cookie") ?? "";
  const match = /pulso_customer=([^;]+)/.exec(cookie);
  return match?.[1] ? decodeURIComponent(match[1]) : "";
}

function jsonHeaders(token: string, ip: string): Record<string, string> {
  return {
    authorization: `Bearer ${token}`,
    "content-type": "application/json",
    "x-forwarded-for": ip,
  };
}

beforeAll(async () => {
  delete process.env.REDIS_URL;
  process.env.TRUSTED_PROXIES = "local";
  process.env.CPF_KEY_ID = "teste-conta";
  process.env.CPF_ENC_KEY = randomBytes(32).toString("base64");
  process.env.CPF_HMAC_KEY = randomBytes(32).toString("base64");
  const db = await createTestDb();
  sql = db.sql;
  close = db.close;
});

afterAll(async () => {
  disconnectAccountRedis();
  await close();
  restore("REDIS_URL", previousRedis);
  restore("TRUSTED_PROXIES", previousProxies);
  restore("CPF_KEY_ID", previousKeyId);
  restore("CPF_ENC_KEY", previousEnc);
  restore("CPF_HMAC_KEY", previousHmac);
});

beforeEach(async () => {
  resetAccountLoginLimits();
  await resetTables(sql);
  const app = createAdminApp(sql);
  const owner = await login(app, "dono@pulso.test", "senha-dona-pulso", "203.0.113.8");
  const created = await app.request("/v1/admin/products", {
    method: "POST",
    headers: auth(owner.token, "203.0.113.8"),
    body: JSON.stringify({
      ...sampleProduct("caos-conta"),
      variants: [{ ...sampleProduct("caos-conta").variants[0], id: VARIANT }],
    }),
  });
  expect(created.status).toBe(201);
});

describe("conta da loja", () => {
  it("cadastra com scrypt, cifra o CPF e não devolve os 11 dígitos", async () => {
    const app = createAdminApp(sql);
    const response = await app.request("/v1/account/register", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.20", origin: "http://127.0.0.1:43123" },
      body: JSON.stringify({ name: "Ana Luz", email: "Ana.Conta@pulso.test", password: PASSWORD, cpf: "529.982.247-25" }),
    });
    const raw = await response.text();
    expect(response.status).toBe(201);
    expect(response.headers.get("access-control-allow-credentials")).toBe("true");
    const cookie = response.headers.get("set-cookie") ?? "";
    expect(cookie).toContain("pulso_customer=");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(raw).not.toContain(CPF);
    expect(raw).not.toContain(PASSWORD);
    expect(raw).toContain("***.***.***-25");
    const body = JSON.parse(raw) as { user: { id: string; email: string; cpfMasked: string } };
    expect(body.user.email).toBe("ana.conta@pulso.test");

    const row = await sql.query<{ cpf: string | null; cpf_enc: Uint8Array | null; cpf_key_id: string | null; cpf_hash: string | null; password_hash: string | null }>(
      "select cpf, cpf_enc, cpf_key_id, cpf_hash, password_hash from customers where id = $1",
      [body.user.id],
    );
    expect(row.rows[0]?.cpf).toBeNull();
    expect(row.rows[0]?.cpf_enc).toBeTruthy();
    expect(row.rows[0]?.cpf_key_id).toBe("teste-conta");
    expect(row.rows[0]?.cpf_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(row.rows[0]?.password_hash?.startsWith("scrypt$")).toBe(true);

    const again = await app.request("/v1/account/register", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.20" },
      body: JSON.stringify({ name: "Ana Luz", email: "ana.conta@pulso.test", password: PASSWORD }),
    });
    expect(again.status).toBe(409);

    const taken = await app.request("/v1/account/register", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.21" },
      body: JSON.stringify({ name: "Bia Luz", email: "bia.conta@pulso.test", password: PASSWORD, cpf: CPF }),
    });
    expect(taken.status).toBe(409);
    expect(await taken.text()).not.toContain(CPF);
  });

  it("entra com a senha, recusa a errada e a 31ª falha no IP espera 15 minutos", async () => {
    const app = createAdminApp(sql);
    const ip = "203.0.113.30";
    const created = await app.request("/v1/account/register", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": ip },
      body: JSON.stringify({ name: "Ana Luz", email: "ana.login@pulso.test", password: PASSWORD }),
    });
    expect(created.status).toBe(201);

    const wrong = await app.request("/v1/account/login", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": ip },
      body: JSON.stringify({ email: "ana.login@pulso.test", password: "senha-errada-pulso" }),
    });
    expect(wrong.status).toBe(401);
    const opened = await app.request("/v1/account/login", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": ip },
      body: JSON.stringify({ email: "Ana.Login@pulso.test", password: PASSWORD }),
    });
    expect(opened.status).toBe(200);
    expect(customerToken(opened).length).toBeGreaterThan(20);
    const me = await app.request("/v1/account/me", { headers: jsonHeaders(customerToken(opened), ip) });
    expect(me.status).toBe(200);
    expect(await me.text()).not.toContain(PASSWORD);

    const crowded = "203.0.113.31";
    for (let n = 0; n < 30; n += 1) {
      const failed = await app.request("/v1/account/login", {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": crowded },
        body: JSON.stringify({ email: `ninguem-${n}@pulso.test`, password: "senha-errada-pulso" }),
      });
      expect(failed.status).toBe(401);
    }
    const blocked = await app.request("/v1/account/login", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": crowded },
      body: JSON.stringify({ email: "ninguem-30@pulso.test", password: "senha-errada-pulso" }),
    });
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("retry-after")).toBe("900");
    const ownerBlocked = await app.request("/v1/account/login", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": crowded },
      body: JSON.stringify({ email: "ana.login@pulso.test", password: PASSWORD }),
    });
    expect(ownerBlocked.status).toBe(429);
    const otherIp = await app.request("/v1/account/login", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.32" },
      body: JSON.stringify({ email: "ana.login@pulso.test", password: PASSWORD }),
    });
    expect(otherIp.status).toBe(200);
  }, 20_000);

  it("o par e-mail+IP já nas 30 falhas recusa a senha certa no mesmo IP", async () => {
    const app = createAdminApp(sql);
    const ip = "203.0.113.33";
    const created = await app.request("/v1/account/register", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": ip },
      body: JSON.stringify({ name: "Ana Luz", email: "ana.par@pulso.test", password: PASSWORD }),
    });
    expect(created.status).toBe(201);
    for (let n = 0; n < 30; n += 1) {
      const failed = await app.request("/v1/account/login", {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": ip },
        body: JSON.stringify({ email: "ana.par@pulso.test", password: "senha-errada-pulso" }),
      });
      expect(failed.status).toBe(401);
    }
    const sameIp = await app.request("/v1/account/login", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": ip },
      body: JSON.stringify({ email: "ana.par@pulso.test", password: PASSWORD }),
    });
    expect(sameIp.status).toBe(429);
    expect(sameIp.headers.get("retry-after")).toBe("900");
    const other = await app.request("/v1/account/login", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.34" },
      body: JSON.stringify({ email: "ana.par@pulso.test", password: PASSWORD }),
    });
    expect(other.status).toBe(200);
  }, 20_000);

  it("grava o pedido da sessão com preço do servidor e a outra conta não vê", async () => {
    const app = createAdminApp(sql);
    const ip = "203.0.113.40";
    const created = await app.request("/v1/account/register", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": ip },
      body: JSON.stringify({ name: "Ana Luz", email: "ana.pedido@pulso.test", password: PASSWORD }),
    });
    const createdBody = (await created.json()) as { user: { id: string } };
    const token = customerToken(created);
    const priced = await app.request("/v1/account/orders", {
      method: "POST",
      headers: jsonHeaders(token, ip),
      body: JSON.stringify(checkoutBody("ana.pedido@pulso.test", { unitCents: 1, totalCents: 1 })),
    });
    expect(priced.status).toBe(400);
    expect((await priced.json()).error).toBe("O preço é calculado no servidor.");

    const withoutPoints = await app.request("/v1/account/orders", {
      method: "POST",
      headers: jsonHeaders(token, ip),
      body: JSON.stringify({ ...checkoutBody("outro@pulso.test"), pointsToRedeem: 40 }),
    });
    expect(withoutPoints.status).toBe(422);
    expect(await withoutPoints.json()).toMatchObject({ code: "pontos_indisponiveis" });

    const placed = await app.request("/v1/account/orders", {
      method: "POST",
      headers: jsonHeaders(token, ip),
      body: JSON.stringify(checkoutBody("outro@pulso.test")),
    });
    const placedRaw = await placed.text();
    expect(placed.status).toBe(200);
    expect(placedRaw).not.toContain(CPF);
    expect(placedRaw).not.toContain(PASSWORD);
    expect(placedRaw).toContain("Nenhum valor foi cobrado");
    const order = JSON.parse(placedRaw).order as {
      id: string;
      code: string;
      status: string;
      email: string;
      subtotalCents: number;
      discountCents: number;
      pixCents: number;
      shippingCents: number;
      totalCents: number;
      lines: { unitPriceCents: number; quantity: number; variantId: string }[];
    };
    expect(order.status).toBe("pagamento_pendente");
    expect(order.email).toBe("ana.pedido@pulso.test");
    expect(order.subtotalCents).toBe(14990);
    expect(order.discountCents).toBe(0);
    expect(order.pixCents).toBe(1499);
    expect(order.shippingCents).toBe(1890);
    expect(order.totalCents).toBe(15381);
    expect(order.lines[0]).toMatchObject({ variantId: VARIANT, quantity: 1, unitPriceCents: 14990 });

    const stored = await sql.query<{
      customer_id: string;
      account_id: string;
      status: string;
      total_cents: number;
      email: string;
      items: unknown;
    }>("select customer_id, account_id, status, total_cents, email, items from orders where id = $1", [order.id]);
    const row = stored.rows[0];
    expect(row?.customer_id).toBe(createdBody.user.id);
    expect(row?.account_id).toBe(row?.customer_id);
    expect(row?.status).toBe("pagamento_pendente");
    expect(row?.total_cents).toBe(15381);
    expect(row?.total_cents).toBeGreaterThanOrEqual(0);
    expect(row?.email).toBe("ana.pedido@pulso.test");
    expect(JSON.stringify(row?.items)).not.toContain(CPF);
    const lines = await sql.query<{ unit_price_cents: number; quantity: number }>(
      "select unit_price_cents, quantity from order_lines where order_id = $1",
      [order.id],
    );
    expect(lines.rows).toEqual([{ unit_price_cents: 14990, quantity: 1 }]);
    const customer = await sql.query<{ cpf: string | null; cpf_hash: string | null; phone: string | null }>(
      "select cpf, cpf_hash, phone from customers where email = 'ana.pedido@pulso.test'",
    );
    expect(customer.rows[0]?.cpf).toBeNull();
    expect(customer.rows[0]?.cpf_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(customer.rows[0]?.phone).toBe("11987654321");

    const listed = await app.request("/v1/account/orders", { headers: jsonHeaders(token, ip) });
    const listedRaw = await listed.text();
    expect(listed.status).toBe(200);
    expect(listedRaw).toContain(order.code);
    expect(listedRaw).not.toContain(CPF);

    const other = await app.request("/v1/account/register", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.41" },
      body: JSON.stringify({ name: "Bia Luz", email: "bia.pedido@pulso.test", password: PASSWORD, cpf: CPF_B }),
    });
    const otherToken = customerToken(other);
    const hidden = await app.request("/v1/account/orders", { headers: jsonHeaders(otherToken, "203.0.113.41") });
    expect(hidden.status).toBe(200);
    expect(await hidden.json()).toEqual({ orders: [] });
    const sameCpf = await app.request("/v1/account/orders", {
      method: "POST",
      headers: jsonHeaders(otherToken, "203.0.113.41"),
      body: JSON.stringify({
        ...checkoutBody("bia.pedido@pulso.test"),
        checkout: { ...checkoutBody("bia.pedido@pulso.test").checkout, cpf: CPF },
      }),
    });
    expect(sameCpf.status).toBe(409);

    const anon = await app.request("/v1/account/orders", { headers: { "x-forwarded-for": "203.0.113.42" } });
    expect(anon.status).toBe(401);

    const quote = await app.request("/v1/checkout/quote", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.43" },
      body: JSON.stringify({ lines: [{ slug: "caos-conta", variant: VARIANT, qty: 1 }], pointsToRedeem: 40 }),
    });
    expect(quote.status).toBe(422);

    await sql.query("update customers set points_balance = 1000 where email = 'ana.pedido@pulso.test'");
    const withBalance = await app.request("/v1/checkout/quote", {
      method: "POST",
      headers: jsonHeaders(token, "203.0.113.44"),
      body: JSON.stringify({ lines: [{ slug: "caos-conta", variant: VARIANT, qty: 1 }], pointsToRedeem: 40 }),
    });
    expect(withBalance.status).toBe(200);
    expect((await withBalance.json()).summary.pointsRedeemed).toBe(40);

    const loggedOut = await app.request("/v1/account/logout", { method: "POST", headers: jsonHeaders(token, ip) });
    expect(loggedOut.status).toBe(204);
    expect(loggedOut.headers.get("set-cookie") ?? "").toContain("Max-Age=0");
    const bearerStill = await app.request("/v1/account/me", { headers: jsonHeaders(token, ip) });
    expect(bearerStill.status).toBe(200);
  });
});
