import type { SqlClient } from "@pulso/db/sql";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { auth, createAdminApp, createTestDb, login, resetTables, sampleProduct } from "./harness";
import { HttpError } from "./http";
import { assertUploadPath, type SignedUpload } from "./uploads";

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

describe("produtos, cupons e fotos", () => {
  it("grava nas tabelas, ignora products.payload e arquiva", async () => {
    const app = createAdminApp(sql);
    const owner = await login(app, "dono@pulso.test", "senha-dona-pulso", "203.0.113.40");
    const created = await app.request("/v1/admin/products", {
      method: "POST",
      headers: auth(owner.token, "203.0.113.40"),
      body: JSON.stringify(sampleProduct()),
    });
    expect(created.status).toBe(201);
    const again = await app.request("/v1/admin/products", {
      method: "POST",
      headers: auth(owner.token, "203.0.113.40"),
      body: JSON.stringify(sampleProduct()),
    });
    expect(again.status).toBe(409);
    const clash = await app.request("/v1/admin/products", {
      method: "POST",
      headers: auth(owner.token, "203.0.113.40"),
      body: JSON.stringify({
        ...sampleProduct("img-dup"),
        images: [
          { id: "foto-igual", flavorId: "limao", url: null, alt: "Pote verde", position: 0, isCover: true, fallbackHex: "#d6ff3c" },
          { id: "foto-igual", flavorId: "limao", url: null, alt: "Outro ângulo", position: 1, isCover: false, fallbackHex: "#101012" },
        ],
      }),
    });
    expect(clash.status).toBe(201);
    const duplicated = (await clash.json()).item as { images: { id: string; alt: string }[] };
    expect(duplicated.images.map((image) => image.id)).toEqual(["img-dup__img__0", "img-dup__img__1"]);
    expect(duplicated.images.map((image) => image.alt)).toEqual(["Pote verde", "Outro ângulo"]);
    const item = (await created.json()).item;
    expect(item.images[0]).toMatchObject({ url: null, fallbackHex: "#d6ff3c", alt: "Pote verde" });
    expect(item.status).toBe("publicado");
    const stored = await sql.query<{ status: string; payload: { name?: string } }>("select status, payload from products where slug = 'caos-teste'");
    expect(stored.rows[0]?.status).toBe("ativo");
    await sql.query("update products set payload = '{\"name\":\"TAMPERED\"}'::jsonb where slug = 'caos-teste'");
    const pub = await app.request("/v1/products");
    const catalog = await pub.json();
    const product = catalog.products.find((entry: { slug: string }) => entry.slug === "caos-teste");
    expect(product.name).toBe("Caos Teste");
    expect(product.flavors[0].stock).toBe(10);
    expect(product.label.registration).toBe("NI-DEMO-TESTE");
    const removed = await app.request("/v1/admin/products/caos-teste", { method: "DELETE", headers: auth(owner.token, "203.0.113.40") });
    expect(removed.status).toBe(200);
    expect((await removed.json()).item.status).toBe("arquivado");
    const after = await app.request("/v1/products");
    const left = await after.json();
    expect(left.products.some((entry: { slug: string }) => entry.slug === "caos-teste")).toBe(false);
    const audit = await sql.query<{ action: string; after_data: unknown }>(
      "select action, after_data from audit_log where entity = 'product' and entity_id = 'caos-teste' order by created_at asc",
    );
    expect(audit.rows.map((row) => row.action)).toEqual(["product.create", "product.archive"]);
    expect(JSON.stringify(audit.rows)).not.toContain("scrypt");
    const anon = await app.request("/v1/admin/products", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(sampleProduct("outro")) });
    expect(anon.status).toBe(401);
    const bad = await app.request("/v1/admin/products", {
      method: "POST",
      headers: auth(owner.token, "203.0.113.40"),
      body: JSON.stringify({ ...sampleProduct("ruim"), label: { ...sampleProduct().label, registration: "ANVISA-123" } }),
    });
    expect(bad.status).toBe(400);
  });

  it("gera id de variação e foto no servidor e não troca o dono", async () => {
    const app = createAdminApp(sql);
    const owner = await login(app, "dono@pulso.test", "senha-dona-pulso", "203.0.113.44");
    const headers = auth(owner.token, "203.0.113.44");
    const base = sampleProduct("caos-a");
    const created = await app.request("/v1/admin/products", {
      method: "POST",
      headers,
      body: JSON.stringify({
        ...base,
        variants: [{ ...base.variants[0], id: "var-1" }],
        images: [{ ...base.images[0], id: "foto-1" }],
      }),
    });
    expect(created.status).toBe(201);
    const productA = (await created.json()).item as {
      variants: { id: string; sku: string; priceCents: number }[];
      images: { id: string; alt: string }[];
    };
    expect(productA.variants[0]?.id).toBe("caos-a__limao__0");
    expect(productA.images[0]?.id).toBe("caos-a__img__0");

    const stolen = sampleProduct("caos-b");
    const attack = await app.request("/v1/admin/products", {
      method: "POST",
      headers,
      body: JSON.stringify({
        ...stolen,
        variants: [{ ...stolen.variants[0], id: "caos-a__limao__0", sku: "PL-ROUBO", priceCents: 100 }],
        images: [
          { id: "caos-a__img__0", flavorId: "limao", url: null, alt: "Roubo", position: 0, isCover: true, fallbackHex: "#d6ff3c" },
          { id: "foto-1", flavorId: "limao", url: null, alt: "Outra", position: 1, isCover: false, fallbackHex: "#101012" },
        ],
      }),
    });
    expect(attack.status).toBe(201);
    const productB = (await attack.json()).item as {
      variants: { id: string; sku: string; priceCents: number }[];
      images: { id: string; alt: string }[];
    };
    expect(productB.variants[0]).toMatchObject({ id: "caos-b__limao__0", sku: "PL-ROUBO", priceCents: 100 });
    expect(productB.images.map((image) => image.id)).toEqual(["caos-b__img__0", "caos-b__img__1"]);
    const ownerRow = await sql.query<{ product_id: string; sku: string; price_cents: number }>(
      "select product_id, sku, price_cents from product_variants where id = 'caos-a__limao__0'",
    );
    expect(ownerRow.rows).toEqual([{ product_id: "caos-a", sku: "PL-CAOS-A", price_cents: 14990 }]);
    const ownerImage = await sql.query<{ product_id: string; alt: string }>(
      "select product_id, alt from product_images where id = 'caos-a__img__0'",
    );
    expect(ownerImage.rows).toEqual([{ product_id: "caos-a", alt: "Pote verde" }]);

    await sql.query("update product_variants set id = 'var-1' where id = 'caos-a__limao__0'");
    await sql.query("update product_images set id = 'foto-1' where id = 'caos-a__img__0'");
    const fixed = sampleProduct("caos-c");
    const again = await app.request("/v1/admin/products", {
      method: "POST",
      headers,
      body: JSON.stringify({
        ...fixed,
        variants: [{ ...fixed.variants[0], id: "var-1", sku: "PL-FIXO", priceCents: 500 }],
        images: [{ ...fixed.images[0], id: "foto-1", alt: "Foto fixa" }],
      }),
    });
    expect(again.status).toBe(201);
    const productC = (await again.json()).item as { variants: { id: string }[]; images: { id: string }[] };
    expect(productC.variants[0]?.id).toBe("caos-c__limao__0");
    expect(productC.images[0]?.id).toBe("caos-c__img__0");
    const still = await sql.query<{ product_id: string; price_cents: number; sku: string }>(
      "select product_id, price_cents, sku from product_variants where id = 'var-1'",
    );
    expect(still.rows).toEqual([{ product_id: "caos-a", price_cents: 14990, sku: "PL-CAOS-A" }]);
    const stillImage = await sql.query<{ product_id: string; alt: string }>("select product_id, alt from product_images where id = 'foto-1'");
    expect(stillImage.rows).toEqual([{ product_id: "caos-a", alt: "Pote verde" }]);

    const updated = await app.request("/v1/admin/products/caos-b", {
      method: "PATCH",
      headers,
      body: JSON.stringify({
        ...stolen,
        variants: [{ ...stolen.variants[0], id: productB.variants[0]?.id, sku: "PL-ROUBO", priceCents: 2500 }],
        images: productB.images.map((image, index) => ({
          id: image.id,
          flavorId: "limao",
          url: null,
          alt: index === 0 ? "Capa nova" : image.alt,
          position: index,
          isCover: index === 0,
          fallbackHex: "#d6ff3c",
        })),
      }),
    });
    expect(updated.status).toBe(200);
    const savedB = (await updated.json()).item as { variants: { id: string; priceCents: number }[]; images: { id: string; alt: string }[] };
    expect(savedB.variants[0]).toMatchObject({ id: "caos-b__limao__0", priceCents: 2500 });
    expect(savedB.images[0]).toMatchObject({ id: "caos-b__img__0", alt: "Capa nova" });
    expect(savedB.images[1]?.id).toBe("caos-b__img__1");
    const untouched = await sql.query<{ price_cents: number }>("select price_cents from product_variants where id = 'var-1'");
    expect(untouched.rows[0]?.price_cents).toBe(14990);
  });

  it("lista na vitrine o produto publicado do admin e esconde rascunho, oculto e arquivo", async () => {
    const app = createAdminApp(sql);
    const owner = await login(app, "dono@pulso.test", "senha-dona-pulso", "203.0.113.42");
    const headers = auth(owner.token, "203.0.113.42");
    const create = (slug: string, status: string) =>
      app.request("/v1/admin/products", {
        method: "POST",
        headers,
        body: JSON.stringify({ ...sampleProduct(slug), name: slug, status }),
      });
    expect((await create("na-prateleira", "ativo")).status).toBe(201);
    expect((await create("ja-publicado", "publicado")).status).toBe(201);
    expect((await create("ainda-rascunho", "rascunho")).status).toBe(201);
    expect((await create("fora-da-loja", "oculto")).status).toBe(201);
    expect((await create("no-arquivo", "arquivado")).status).toBe(201);
    const listed = await app.request("/v1/products");
    expect(listed.headers.get("cache-control")).toBe("no-store");
    const catalog = await listed.json();
    const slugs = catalog.products.map((product: { slug: string }) => product.slug);
    expect(slugs).toEqual(expect.arrayContaining(["na-prateleira", "ja-publicado"]));
    expect(slugs).not.toContain("ainda-rascunho");
    expect(slugs).not.toContain("fora-da-loja");
    expect(slugs).not.toContain("no-arquivo");
    const shelf = catalog.products.find((product: { slug: string }) => product.slug === "na-prateleira");
    expect(shelf).toMatchObject({ name: "na-prateleira", hidden: false });
    expect(shelf.flavors[0].stock).toBe(10);
    const hidden = await app.request("/v1/products/ainda-rascunho");
    expect(hidden.status).toBe(404);
    const drafted = await app.request("/v1/admin/products/na-prateleira", {
      method: "PATCH",
      headers,
      body: JSON.stringify({ ...sampleProduct("na-prateleira"), name: "na-prateleira", status: "rascunho" }),
    });
    expect(drafted.status).toBe(200);
    const after = await app.request("/v1/products");
    const left = await after.json();
    expect(left.products.some((product: { slug: string }) => product.slug === "na-prateleira")).toBe(false);
    expect(left.products.some((product: { slug: string }) => product.slug === "ja-publicado")).toBe(true);
  });

  it("apaga cupom sem uso e arquiva cupom usado", async () => {
    const app = createAdminApp(sql);
    const owner = await login(app, "dono@pulso.test", "senha-dona-pulso", "203.0.113.41");
    const created = await app.request("/v1/admin/coupons", {
      method: "POST",
      headers: auth(owner.token, "203.0.113.41"),
      body: JSON.stringify({ code: "novo10", label: "Novo", kind: "percent", value: 10, active: true }),
    });
    expect(created.status).toBe(201);
    const tooMuch = await app.request("/v1/admin/coupons", {
      method: "POST",
      headers: auth(owner.token, "203.0.113.41"),
      body: JSON.stringify({ code: "alto40", label: "Alto", kind: "percent", value: 40, active: true }),
    });
    expect(tooMuch.status).toBe(400);
    const removed = await app.request("/v1/admin/coupons/NOVO10", { method: "DELETE", headers: auth(owner.token, "203.0.113.41") });
    expect(removed.status).toBe(200);
    expect(await removed.json()).toEqual({ ok: true });
    expect((await sql.query("select code from coupons where code = 'NOVO10'")).rows).toHaveLength(0);
    await app.request("/v1/admin/coupons", {
      method: "POST",
      headers: auth(owner.token, "203.0.113.41"),
      body: JSON.stringify({ code: "usado5", label: "Usado", kind: "percent", value: 5, active: true }),
    });
    await sql.query("update coupons set uses = 2 where code = 'USADO5'");
    const archived = await app.request("/v1/admin/coupons/USADO5", { method: "DELETE", headers: auth(owner.token, "203.0.113.41") });
    expect(archived.status).toBe(200);
    const body = await archived.json();
    expect(body.archived).toBe(true);
    expect(body.item.active).toBe(false);
    const actions = await sql.query<{ action: string }>("select action from audit_log where entity = 'coupon' order by created_at asc");
    expect(actions.rows.map((row) => row.action)).toEqual(["coupon.create", "coupon.delete", "coupon.create", "coupon.archive"]);
  });

  it("assina upload só para quem pode e exige texto alternativo", async () => {
    const signUpload = async (): Promise<SignedUpload> => ({
      token: "token-teste",
      pathname: "pulso/foto.webp",
      uploadUrl: "https://vercel.com/api/blob/?pathname=pulso%2Ffoto.webp",
      alt: "Pote",
      maximumSizeInBytes: 5 * 1024 * 1024,
      allowedContentTypes: ["image/jpeg", "image/png", "image/webp"],
    });
    const app = createAdminApp(sql, signUpload);
    const editor = await login(app, "editor@pulso.test", "senha-editor-pulso", "203.0.113.42");
    const signed = await app.request("/v1/admin/uploads", {
      method: "POST",
      headers: auth(editor.token, "203.0.113.42"),
      body: JSON.stringify({ contentType: "image/webp", alt: "Pote verde" }),
    });
    expect(signed.status).toBe(200);
    const upload = await signed.json();
    expect(upload.maximumSizeInBytes).toBe(5 * 1024 * 1024);
    expect(upload.allowedContentTypes).toEqual(["image/jpeg", "image/png", "image/webp"]);
    const blank = await app.request("/v1/admin/uploads", {
      method: "POST",
      headers: auth(editor.token, "203.0.113.42"),
      body: JSON.stringify({ contentType: "image/gif", alt: "" }),
    });
    expect(blank.status).toBe(400);
    const support = await login(app, "atendimento@pulso.test", "senha-atendimento", "203.0.113.43");
    const denied = await app.request("/v1/admin/uploads", {
      method: "POST",
      headers: auth(support.token, "203.0.113.43"),
      body: JSON.stringify({ contentType: "image/png", alt: "Pote" }),
    });
    expect(denied.status).toBe(403);
    expect(() => assertUploadPath("pulso/foto.jpg")).not.toThrow();
    expect(() => assertUploadPath("pulso/foto.jpeg")).not.toThrow();
    expect(() => assertUploadPath("pulso/foto.png")).not.toThrow();
    expect(() => assertUploadPath("pulso/foto.webp")).not.toThrow();
    expect(() => assertUploadPath("pulso/../segredo.jpg")).toThrow(HttpError);
    expect(() => assertUploadPath("../pulso/foto.jpg")).toThrow(HttpError);
    expect(() => assertUploadPath("pulso/foto.gif")).toThrow(HttpError);
  });
});
