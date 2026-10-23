import type { SqlClient } from "@pulso/db/sql";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { auth, createAdminApp, createTestDb, login, resetTables, sampleProduct } from "./harness";

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

describe("promoções, quiz, ajustes e papéis", () => {
  it("arquiva promoção, esconde vídeo e recusa apagar categoria", async () => {
    const app = createAdminApp(sql);
    const editor = await login(app, "editor@pulso.test", "senha-editor-pulso", "203.0.113.50");
    const headers = auth(editor.token, "203.0.113.50");
    await app.request("/v1/admin/products", { method: "POST", headers, body: JSON.stringify(sampleProduct()) });
    const promo = await app.request("/v1/admin/promotions", {
      method: "POST",
      headers,
      body: JSON.stringify({
        name: "Semana do pré",
        kind: "percent",
        value: 10,
        targetType: "produto",
        productId: "caos-teste",
        active: true,
      }),
    });
    expect(promo.status).toBe(201);
    const promoId = (await promo.json()).item.id as string;
    const removed = await app.request(`/v1/admin/promotions/${promoId}`, { method: "DELETE", headers });
    expect((await removed.json()).item.active).toBe(false);
    const still = await sql.query("select id from promotions where id = $1", [promoId]);
    expect(still.rows).toHaveLength(1);
    const category = await app.request("/v1/admin/categories/pre-treino", { method: "DELETE", headers });
    expect(category.status).toBe(409);
    const video = await app.request("/v1/admin/videos", {
      method: "POST",
      headers,
      body: JSON.stringify({
        slug: "spot-teste",
        title: "Teste",
        caption: "Três cores.",
        duration: "0:10",
        frames: ["#d6ff3c", "#101012", "#ff3d8a"],
        transcript: ["Não é um medicamento."],
      }),
    });
    expect(video.status).toBe(201);
    const hidden = await app.request("/v1/admin/videos/spot-teste", { method: "DELETE", headers });
    expect((await hidden.json()).item.hidden).toBe(true);
    const pub = await app.request("/v1/videos");
    expect((await pub.json()).videos).toHaveLength(0);
    const loyalty = await app.request("/v1/admin/settings/loyalty", { headers });
    expect(loyalty.status).toBe(403);
  });

  it("deixa o atendimento ajustar pedido e pontos, sem ficar negativo", async () => {
    const app = createAdminApp(sql);
    const support = await login(app, "atendimento@pulso.test", "senha-atendimento", "203.0.113.51");
    const headers = auth(support.token, "203.0.113.51");
    await sql.query(
      "insert into customers (id, email, name, points_balance, points_lifetime) values ('cli-1', 'ana@pulso.test', 'Ana', 100, 100)",
    );
    await sql.query(
      `insert into orders (id, code, customer_id, email, status, payment_method, subtotal_cents, total_cents)
       values ('ped-1', 'PLTESTE', 'cli-1', 'ana@pulso.test', 'pago', 'pix', 1000, 1000)`,
    );
    const order = await app.request("/v1/admin/orders/ped-1", {
      method: "PATCH",
      headers,
      body: JSON.stringify({ status: "enviado", trackingCode: "BR123" }),
    });
    expect(order.status).toBe(200);
    expect((await order.json()).item).toMatchObject({ status: "enviado", trackingCode: "BR123" });
    const points = await app.request("/v1/admin/customers/cli-1/points", {
      method: "PATCH",
      headers,
      body: JSON.stringify({ delta: -40, reason: "ajuste de atendimento" }),
    });
    expect((await points.json()).item.pointsBalance).toBe(60);
    const broke = await app.request("/v1/admin/customers/cli-1/points", {
      method: "PATCH",
      headers,
      body: JSON.stringify({ delta: -1000, reason: "demais" }),
    });
    expect(broke.status).toBe(400);
    const editor = await login(app, "editor@pulso.test", "senha-editor-pulso", "203.0.113.52");
    const denied = await app.request("/v1/admin/orders/ped-1", {
      method: "PATCH",
      headers: auth(editor.token, "203.0.113.52"),
      body: JSON.stringify({ status: "entregue" }),
    });
    expect(denied.status).toBe(403);
    const audit = await sql.query("select action from audit_log where entity = 'customer'");
    expect(audit.rows).toHaveLength(1);
    const owner = await login(app, "dono@pulso.test", "senha-dona-pulso", "203.0.113.53");
    const saved = await app.request("/v1/admin/settings/loyalty", {
      method: "PATCH",
      headers: auth(owner.token, "203.0.113.53"),
      body: JSON.stringify({
        pointsPerReal: 5,
        pixPointsBonus: 1.2,
        pointValueCents: 1,
        maxPointsRedeemRatio: 0.2,
        welcomePoints: 100,
        freeShippingCents: 29900,
        pixDiscountPercent: 10,
        kitDiscountPercent: 12,
        subscriptionDefaultPercent: 10,
        referrerPoints: 150,
        referredPoints: 80,
        levels: [],
      }),
    });
    expect(saved.status).toBe(200);
    const pub = await app.request("/v1/settings/loyalty");
    expect((await pub.json()).item.freeShippingCents).toBe(29900);
  });

  it("aceita só link seguro no banner e apaga categoria sem uso", async () => {
    const app = createAdminApp(sql);
    const editor = await login(app, "editor@pulso.test", "senha-editor-pulso", "203.0.113.54");
    const headers = auth(editor.token, "203.0.113.54");
    const banner = {
      slot: "hero",
      title: "Faixa",
      imageUrl: "https://cdn.example/faixa.jpg",
    };
    for (const href of ["javascript:alert(1)", "data:text/html,hi", "http://pulso.example/loja", "//pulso.example/loja"]) {
      const rejected = await app.request("/v1/admin/banners", {
        method: "POST",
        headers,
        body: JSON.stringify({ ...banner, href }),
      });
      expect(rejected.status).toBe(400);
    }
    const path = await app.request("/v1/admin/banners", {
      method: "POST",
      headers,
      body: JSON.stringify({ ...banner, href: "/loja" }),
    });
    expect(path.status).toBe(201);
    const https = await app.request("/v1/admin/banners", {
      method: "POST",
      headers,
      body: JSON.stringify({ ...banner, title: "Externo", href: "https://pulso.example/loja" }),
    });
    expect(https.status).toBe(201);
    const created = await app.request("/v1/admin/categories", {
      method: "POST",
      headers,
      body: JSON.stringify({ slug: "temporaria", name: "Temporária" }),
    });
    expect(created.status).toBe(201);
    const removed = await app.request("/v1/admin/categories/temporaria", { method: "DELETE", headers });
    expect(removed.status).toBe(200);
    const quiz = await app.request("/v1/admin/quiz", {
      method: "POST",
      headers,
      body: JSON.stringify({
        prompt: "Qual o treino?",
        answerKey: "treino",
        position: 0,
        options: [{ label: "Força", value: "forca" }],
      }),
    });
    expect(quiz.status).toBe(201);
    const quizId = (await quiz.json()).item.id as string;
    const dropped = await app.request(`/v1/admin/quiz/${quizId}`, { method: "DELETE", headers });
    expect(dropped.status).toBe(200);
  });
});
