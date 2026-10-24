import { serve } from "@hono/node-server";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../app";
import { auth, createAdminApp, createTestDb, login, resetTables } from "./harness";
import { loginBackoffMs, loginProofCount } from "./auth-routes";
import { clientAddress } from "./http";
import { sessionSecret } from "./session";
import type { SqlClient } from "@pulso/db/sql";

let sql: SqlClient;
let close: () => Promise<void>;
const previousRedis = process.env.REDIS_URL;
const previousProxies = process.env.TRUSTED_PROXIES;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

beforeAll(async () => {
  delete process.env.REDIS_URL;
  process.env.TRUSTED_PROXIES = "local";
  const db = await createTestDb();
  sql = db.sql;
  close = db.close;
});

afterAll(async () => {
  await close();
  if (previousRedis === undefined) delete process.env.REDIS_URL;
  else process.env.REDIS_URL = previousRedis;
  if (previousProxies === undefined) delete process.env.TRUSTED_PROXIES;
  else process.env.TRUSTED_PROXIES = previousProxies;
});

beforeEach(async () => {
  await resetTables(sql);
});

describe("login do admin", () => {
  it("grava cookie httpOnly por 12 h e devolve o token que o painel usa", async () => {
    const app = createAdminApp(sql);
    const { response, body, token } = await login(app, "dono@pulso.test", "senha-dona-pulso");
    expect(response.status).toBe(200);
    expect(body.user).toMatchObject({ email: "dono@pulso.test", role: "dono" });
    expect(body).not.toHaveProperty("token");
    const cookie = response.headers.get("set-cookie") ?? "";
    expect(cookie).toContain("pulso_admin=");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Max-Age=43200");
    const me = await app.request("/v1/admin/me", { headers: auth(token) });
    expect(me.status).toBe(200);
    const rows = await sql.query<{ after_data: { email?: string; password?: string } }>(
      "select after_data from audit_log where action = 'login'",
    );
    expect(rows.rows[0]?.after_data.email).toBe("dono@pulso.test");
    expect(JSON.stringify(rows.rows[0]?.after_data)).not.toContain("senha-dona-pulso");
    expect(JSON.stringify(rows.rows[0]?.after_data)).not.toContain("scrypt");
  });

  it("recusa senha errada sem cookie", async () => {
    const app = createAdminApp(sql);
    const { response } = await login(app, "dono@pulso.test", "senha-errada-pulso");
    expect(response.status).toBe(401);
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("segura a próxima tentativa e ainda entra com a senha certa", async () => {
    const app = createAdminApp(sql);
    const ip = "203.0.113.20";
    for (let attempt = 1; attempt <= 4; attempt += 1) {
      const failed = await login(app, "dono@pulso.test", "senha-errada-pulso", ip);
      expect(failed.response.status).toBe(401);
      if (attempt < 4) await wait(loginBackoffMs(attempt) + 40);
    }
    const proofs = loginProofCount();
    const rushed = await login(app, "dono@pulso.test", "senha-dona-pulso", ip);
    expect(rushed.response.status).toBe(429);
    expect(rushed.response.headers.get("retry-after")).toBeTruthy();
    expect(loginProofCount()).toBe(proofs);
    const counted = await sql.query<{ failed_attempts: number }>("select failed_attempts from admin_users where email = 'dono@pulso.test'");
    expect(counted.rows[0]?.failed_attempts).toBe(4);
    await wait(loginBackoffMs(4) + 40);
    const opened = await login(app, "dono@pulso.test", "senha-dona-pulso", ip);
    expect(opened.response.status).toBe(200);
    const reset = await sql.query<{ failed_attempts: number; locked_until: string | null }>(
      "select failed_attempts, locked_until from admin_users where email = 'dono@pulso.test'",
    );
    expect(reset.rows[0]?.failed_attempts).toBe(0);
    expect(reset.rows[0]?.locked_until).toBeNull();
  });

  it("separa papéis e rejeita cookie adulterado", async () => {
    const app = createAdminApp(sql);
    const support = await login(app, "atendimento@pulso.test", "senha-atendimento", "203.0.113.30");
    const denied = await app.request("/v1/admin/products", {
      method: "POST",
      headers: auth(support.token, "203.0.113.30"),
      body: JSON.stringify({ name: "x" }),
    });
    expect(denied.status).toBe(403);
    const editor = await login(app, "editor@pulso.test", "senha-editor-pulso", "203.0.113.31");
    const audit = await app.request("/v1/admin/audit-log", { headers: auth(editor.token, "203.0.113.31") });
    expect(audit.status).toBe(403);
    const owner = await login(app, "dono@pulso.test", "senha-dona-pulso", "203.0.113.32");
    const allowed = await app.request("/v1/admin/audit-log", { headers: auth(owner.token, "203.0.113.32") });
    expect(allowed.status).toBe(200);
    const tampered = await app.request("/v1/admin/me", { headers: auth(`${owner.token}x`, "203.0.113.32") });
    expect(tampered.status).toBe(401);
    const logout = await app.request("/v1/admin/logout", { method: "POST", headers: auth(owner.token, "203.0.113.32") });
    expect(logout.status).toBe(204);
    expect(logout.headers.get("set-cookie")).toContain("Max-Age=0");
    const again = await app.request("/v1/admin/me", { headers: auth(owner.token, "203.0.113.32") });
    expect(again.status).toBe(401);
  });

  it("responde 429 no meio de tentativas paralelas e a senha certa ainda entra", async () => {
    const app = createAdminApp(sql);
    const attack = "203.0.113.77";
    const responses = await Promise.all(
      Array.from({ length: 200 }, () => login(app, "dono@pulso.test", "senha-errada-pulso", attack)),
    );
    const statuses = responses.map((item) => item.response.status);
    const unauthorized = statuses.filter((status) => status === 401).length;
    const limited = statuses.filter((status) => status === 429).length;
    expect(unauthorized + limited).toBe(200);
    expect(limited).toBe(199);
    expect(unauthorized).toBe(1);
    expect(loginProofCount()).toBe(1);
    const counted = await sql.query<{ failed_attempts: number }>(
      "select failed_attempts from admin_users where email = 'dono@pulso.test'",
    );
    expect(counted.rows[0]?.failed_attempts).toBe(unauthorized);
    const flooded = await login(app, "dono@pulso.test", "senha-dona-pulso", attack);
    expect(flooded.response.status).toBe(200);
    expect(loginProofCount()).toBe(unauthorized + 1);
    const reset = await sql.query<{ failed_attempts: number }>("select failed_attempts from admin_users where email = 'dono@pulso.test'");
    expect(reset.rows[0]?.failed_attempts).toBe(0);
    const opened = await login(app, "dono@pulso.test", "senha-dona-pulso", "203.0.113.78");
    expect(opened.response.status).toBe(200);
    expect(opened.body.user).toMatchObject({ email: "dono@pulso.test", role: "dono" });
  });

  it("conta só falha no IP e a senha certa zera a parte daquele usuário", async () => {
    const app = createAdminApp(sql);
    const ip = "203.0.113.60";
    for (let n = 0; n < 31; n += 1) {
      const ok = await login(app, "editor@pulso.test", "senha-editor-pulso", ip);
      expect(ok.response.status).toBe(200);
    }
    for (let attempt = 1; attempt <= 4; attempt += 1) {
      const failed = await login(app, "dono@pulso.test", "senha-errada-pulso", ip);
      expect(failed.response.status).toBe(401);
      await wait(loginBackoffMs(attempt) + 40);
    }
    const opened = await login(app, "dono@pulso.test", "senha-dona-pulso", ip);
    expect(opened.response.status).toBe(200);
    const reset = await sql.query<{ failed_attempts: number }>("select failed_attempts from admin_users where email = 'dono@pulso.test'");
    expect(reset.rows[0]?.failed_attempts).toBe(0);
    for (let n = 0; n < 30; n += 1) {
      const failed = await login(app, `ninguem-${n}@pulso.test`, "senha-errada-pulso", ip);
      expect(failed.response.status).toBe(401);
    }
    const blocked = await login(app, "ninguem-30@pulso.test", "senha-errada-pulso", ip);
    expect(blocked.response.status).toBe(429);
    expect(blocked.response.headers.get("retry-after")).toBe("900");
    const ownerBlocked = await login(app, "atendimento@pulso.test", "senha-atendimento", ip);
    expect(ownerBlocked.response.status).toBe(429);
    expect(ownerBlocked.response.headers.get("retry-after")).toBe("900");
    const other = await login(app, "atendimento@pulso.test", "senha-atendimento", "203.0.113.61");
    expect(other.response.status).toBe(200);
  }, 60_000);

  it("o segundo balde junta o e-mail normalizado ao IP e a senha certa zera", async () => {
    const app = createAdminApp(sql);
    const ip = "203.0.113.90";
    for (let n = 0; n < 30; n += 1) {
      const failed = await login(app, n % 2 === 0 ? "Dono@Pulso.Test" : "dono@pulso.test", "senha-errada-pulso", ip);
      expect(failed.response.status).toBe(401);
      await sql.query("update admin_users set failed_attempts = 0 where email = 'dono@pulso.test'");
    }
    const blocked = await login(app, "DONO@pulso.test", "senha-errada-pulso", ip);
    expect(blocked.response.status).toBe(429);
    expect(blocked.response.headers.get("retry-after")).toBe("900");
    const otherIp = await login(app, "dono@pulso.test", "senha-errada-pulso", "203.0.113.91");
    expect(otherIp.response.status).toBe(401);
    const opened = await login(app, "dono@pulso.test", "senha-dona-pulso", ip);
    expect(opened.response.status).toBe(200);
    const again = await login(app, "dono@pulso.test", "senha-errada-pulso", ip);
    expect(again.response.status).toBe(401);
  });

  it("recusa origem desconhecida e login sem segredo", async () => {
    const app = createAdminApp(sql);
    const origin = await app.request("/v1/admin/login", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://evil.example" },
      body: JSON.stringify({ email: "dono@pulso.test", password: "senha-dona-pulso" }),
    });
    expect(origin.status).toBe(403);
    const previous = process.env.ADMIN_SESSION_SECRET;
    delete process.env.ADMIN_SESSION_SECRET;
    const bare = createApp();
    const missing = await bare.request("/v1/admin/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "dono@pulso.test", password: "senha-dona-pulso" }),
    });
    expect(missing.status).toBe(503);
    if (previous) process.env.ADMIN_SESSION_SECRET = previous;
    expect(sessionSecret({ NODE_ENV: "production", ADMIN_SESSION_SECRET: "pulso-dev-session-change-me" })).toBeNull();
    expect(sessionSecret({ NODE_ENV: "test", ADMIN_SESSION_SECRET: "pulso-dev-session-change-me" })).toBe("pulso-dev-session-change-me");
    expect(loginBackoffMs(1)).toBe(0);
    expect(loginBackoffMs(2)).toBe(100);
    expect(loginBackoffMs(3)).toBeGreaterThan(loginBackoffMs(2));
    expect(loginBackoffMs(8)).toBe(6_400);
    expect(loginBackoffMs(9)).toBe(8_000);
    expect(loginBackoffMs(12)).toBe(8_000);
    expect(clientAddress({
      socketAddress: "203.0.113.8",
      forwardedFor: "198.51.100.9, 203.0.113.8",
      vercelForwardedFor: null,
      trustedProxies: [],
      vercel: false,
    })).toBe("203.0.113.8");
    expect(clientAddress({
      socketAddress: "203.0.113.8",
      forwardedFor: "198.51.100.9, 203.0.113.8",
      vercelForwardedFor: null,
      trustedProxies: ["203.0.113.8"],
      vercel: false,
    })).toBe("198.51.100.9");
    expect(clientAddress({
      socketAddress: "203.0.113.8",
      forwardedFor: "1.1.1.1",
      vercelForwardedFor: "198.51.100.20, 203.0.113.8",
      trustedProxies: ["203.0.113.8"],
      vercel: true,
    })).toBe("198.51.100.20");
  });

  it("separa o limite de dois IPs encaminhados pelo Next", async () => {
    const previous = process.env.TRUSTED_PROXIES;
    process.env.TRUSTED_PROXIES = "127.0.0.1";
    const app = createAdminApp(sql);
    const server = await new Promise<ReturnType<typeof serve>>((resolve) => {
      const started = serve({ fetch: app.fetch, hostname: "127.0.0.1", port: 0 }, () => resolve(started));
    });
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 0;
    const attempt = (ip: string, email: string) =>
      fetch(`http://127.0.0.1:${port}/v1/admin/login`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": ip },
        body: JSON.stringify({ email, password: "senha-errada-pulso" }),
      });
    try {
      for (let n = 0; n < 30; n += 1) {
        const failed = await attempt("203.0.113.50", `fora-${n}@pulso.test`);
        expect(failed.status).toBe(401);
      }
      const blocked = await attempt("203.0.113.50", "fora-30@pulso.test");
      expect(blocked.status).toBe(429);
      expect(blocked.headers.get("retry-after")).toBe("900");
      const other = await attempt("203.0.113.51", "fora-30@pulso.test");
      expect(other.status).toBe(401);
      const flooded = await attempt("203.0.113.50", "fora-31@pulso.test");
      expect(flooded.status).toBe(429);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      if (previous === undefined) delete process.env.TRUSTED_PROXIES;
      else process.env.TRUSTED_PROXIES = previous;
    }
  }, 60_000);

  it("lista a auditoria do dono com página, ator, entidade e data", async () => {
    const app = createAdminApp(sql);
    const owner = await login(app, "dono@pulso.test", "senha-dona-pulso", "203.0.113.90");
    const editor = await login(app, "editor@pulso.test", "senha-editor-pulso", "203.0.113.91");
    const denied = await app.request("/v1/admin/audit", { headers: auth(editor.token, "203.0.113.91") });
    expect(denied.status).toBe(403);
    await sql.query(
      `insert into audit_log (id, actor_id, action, entity, entity_id, created_at)
       values ('aud-1', 'dono', 'product.save', 'product', 'caos', '2026-10-01T12:00:00Z'),
              ('aud-2', 'editor', 'post.save', 'post', 'collab', '2026-10-20T12:00:00Z')`,
    );
    const headers = auth(owner.token, "203.0.113.90");
    const byActor = await app.request("/v1/admin/audit?actor=editor&entity=post", { headers });
    expect(byActor.status).toBe(200);
    const actorBody = (await byActor.json()) as { total: number; items: { id: string; actorId: string; entity: string; entityId: string }[] };
    expect(actorBody.total).toBe(1);
    expect(actorBody.items[0]).toMatchObject({ id: "aud-2", actorId: "editor", entity: "post", entityId: "collab" });
    const byEntity = (await (await app.request("/v1/admin/audit?entity=post", { headers })).json()) as { items: unknown[] };
    expect(byEntity.items).toHaveLength(1);
    const byDate = (await (await app.request("/v1/admin/audit?from=2026-10-20&to=2026-10-20", { headers })).json()) as {
      total: number;
      items: { id: string }[];
    };
    expect(byDate.total).toBe(1);
    expect(byDate.items[0]?.id).toBe("aud-2");
    const paged = (await (await app.request("/v1/admin/audit?page=1&pageSize=1", { headers })).json()) as {
      page: number;
      pageSize: number;
      total: number;
      items: unknown[];
    };
    expect(paged.page).toBe(1);
    expect(paged.pageSize).toBe(1);
    expect(paged.items).toHaveLength(1);
    expect(paged.total).toBeGreaterThan(1);
    const bad = await app.request("/v1/admin/audit?from=ontem", { headers });
    expect(bad.status).toBe(400);
    const alias = await app.request("/v1/admin/audit-log", { headers });
    expect(alias.status).toBe(200);
  });
});
