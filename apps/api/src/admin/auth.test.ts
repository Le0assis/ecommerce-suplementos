import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../app";
import { auth, createAdminApp, createTestDb, login, resetTables } from "./harness";
import type { SqlClient } from "@pulso/db/sql";

let sql: SqlClient;
let close: () => Promise<void>;

beforeAll(async () => {
  const db = await createTestDb();
  sql = db.sql;
  close = db.close;
});

afterAll(async () => {
  await close();
});

beforeEach(async () => {
  await resetTables(sql);
});

describe("login do admin", () => {
  it("grava cookie httpOnly por 12 h e devolve o token que o painel usa", async () => {
    const app = createAdminApp(sql);
    const { response, body } = await login(app, "dono@pulso.test", "senha-dona-pulso");
    expect(response.status).toBe(200);
    expect(body.user).toMatchObject({ email: "dono@pulso.test", role: "dono" });
    const cookie = response.headers.get("set-cookie") ?? "";
    expect(cookie).toContain("pulso_admin=");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Max-Age=43200");
    const me = await app.request("/v1/admin/me", { headers: auth(body.token ?? "") });
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

  it("trava o e-mail depois de 5 senhas erradas", async () => {
    const app = createAdminApp(sql);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const failed = await login(app, "dono@pulso.test", "senha-errada-pulso", "203.0.113.20");
      expect(failed.response.status).toBe(401);
    }
    const locked = await login(app, "dono@pulso.test", "senha-dona-pulso", "203.0.113.20");
    expect(locked.response.status).toBe(429);
    expect(locked.response.headers.get("retry-after")).toBeTruthy();
    const other = await login(app, "editor@pulso.test", "senha-editor-pulso", "203.0.113.21");
    expect(other.response.status).toBe(200);
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
  });
});
