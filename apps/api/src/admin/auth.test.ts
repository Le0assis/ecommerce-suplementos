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
    expect(flooded.response.status).toBe(429);
    expect(loginProofCount()).toBe(unauthorized);
    const opened = await login(app, "dono@pulso.test", "senha-dona-pulso", "203.0.113.78");
    expect(opened.response.status).toBe(200);
    expect(opened.body.user).toMatchObject({ email: "dono@pulso.test", role: "dono" });
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
});
