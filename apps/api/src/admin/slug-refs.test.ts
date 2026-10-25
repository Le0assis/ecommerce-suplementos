import { findOrphans } from "@pulso/db/audit-orphans";
import { listAdminCoupons, listAdminProducts } from "@pulso/db/catalog";
import { listDrops } from "@pulso/db/drops";
import { patchSubscription, saveSubscription } from "@pulso/db/resources";
import type { SqlClient } from "@pulso/db/sql";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { auth, createAdminApp, createTestDb, login, resetTables, sampleProduct } from "./harness";
import { CatalogError } from "@pulso/db/catalog";

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

async function variantId(productId: string): Promise<string> {
  const rows = await sql.query<{ id: string }>("select id from product_variants where product_id = $1 order by position", [productId]);
  const id = rows.rows[0]?.id;
  if (!id) throw new Error("variação ausente");
  return id;
}

async function seedRefs(productSlug: string, variant: string, extraSlug?: string) {
  await sql.query("insert into customers (id, email, name) values ('cli-1', 'cli@pulso.test', 'Cli')");
  await sql.query(
    `insert into orders (id, code, email, status, payment_method, subtotal_cents, total_cents)
     values ('ped-1', 'PULSO-1', 'cli@pulso.test', 'pago', 'pix', 14990, 13491)`,
  );
  await sql.query(
    `insert into order_lines (id, order_id, product_slug, variant_id, name, quantity, unit_price_cents)
     values ('lin-1', 'ped-1', $1, $2, 'Caos', 1, 14990)`,
    [productSlug, variant],
  );
  await sql.query("insert into wishlist_items (customer_id, product_slug) values ('cli-1', $1)", [productSlug]);
  if (extraSlug) await sql.query("insert into wishlist_items (customer_id, product_slug) values ('cli-1', $1)", [extraSlug]);
  await sql.query(
    `insert into subscriptions (id, customer_id, product_slug, variant_id, quantity, unit_price_cents, status, next_charge_on)
     values ('sub-1', 'cli-1', $1, $2, 2, 15990, 'ativa', '2026-11-02')`,
    [productSlug, variant],
  );
  await sql.query(
    `insert into reviews (id, product_slug, author, rating, payload) values ('rev-1', $1, 'Ana', 5, '{}'::jsonb)`,
    [productSlug],
  );
}

describe("slug, busca e órfãos", () => {
  it("troca o slug e leva pedido, lista, assinatura e avaliação juntos", async () => {
    const app = createAdminApp(sql);
    const owner = await login(app, "dono@pulso.test", "senha-dona-pulso", "203.0.113.60");
    const headers = auth(owner.token, "203.0.113.60");
    const created = await app.request("/v1/admin/products", {
      method: "POST",
      headers,
      body: JSON.stringify({ ...sampleProduct("caos-teste"), id: "pote-interno" }),
    });
    expect(created.status).toBe(201);
    const variant = await variantId("pote-interno");
    await seedRefs("caos-teste", variant);
    await sql.query(
      `insert into subscriptions (id, customer_id, product_slug, variant_id, quantity, unit_price_cents, status, next_charge_on)
       values ('sub-id', 'cli-1', 'pote-interno', $1, 1, 9900, 'pausada', '2026-12-15')`,
      [variant],
    );

    const renamed = await app.request("/v1/admin/products/pote-interno", {
      method: "PATCH",
      headers,
      body: JSON.stringify({ ...sampleProduct("caos-novo"), id: "pote-interno", name: "Caos Novo" }),
    });
    expect(renamed.status).toBe(200);
    expect((await renamed.json()).item.slug).toBe("caos-novo");

    const lines = await sql.query<{ product_slug: string; unit_price_cents: number }>(
      "select product_slug, unit_price_cents from order_lines order by id",
    );
    expect(lines.rows).toEqual([{ product_slug: "caos-novo", unit_price_cents: 14990 }]);
    const wish = await sql.query<{ product_slug: string }>("select product_slug from wishlist_items");
    expect(wish.rows).toEqual([{ product_slug: "caos-novo" }]);
    const subs = await sql.query<{ id: string; product_slug: string; unit_price_cents: number; next_charge_on: string }>(
      "select id, product_slug, unit_price_cents, next_charge_on::text as next_charge_on from subscriptions order by id",
    );
    expect(subs.rows).toEqual([
      { id: "sub-1", product_slug: "caos-novo", unit_price_cents: 15990, next_charge_on: "2026-11-02" },
      { id: "sub-id", product_slug: "caos-novo", unit_price_cents: 9900, next_charge_on: "2026-12-15" },
    ]);
    const reviews = await sql.query<{ product_slug: string }>("select product_slug from reviews");
    expect(reviews.rows).toEqual([{ product_slug: "caos-novo" }]);
    const money = await sql.query<{ cents: string; charge: string; published: string }>(
      `select
         (select data_type from information_schema.columns where table_name = 'order_lines' and column_name = 'unit_price_cents') as cents,
         (select data_type from information_schema.columns where table_name = 'subscriptions' and column_name = 'next_charge_on') as charge,
         (select data_type from information_schema.columns where table_name = 'posts' and column_name = 'published_at') as published`,
    );
    expect(money.rows[0]).toEqual({ cents: "integer", charge: "date", published: "date" });
  });

  it("desfaz a troca de slug se a gravação falha depois", async () => {
    const app = createAdminApp(sql);
    const owner = await login(app, "dono@pulso.test", "senha-dona-pulso", "203.0.113.61");
    const headers = auth(owner.token, "203.0.113.61");
    expect((await app.request("/v1/admin/products", { method: "POST", headers, body: JSON.stringify(sampleProduct("caos-teste")) })).status).toBe(201);
    const variant = await variantId("caos-teste");
    await seedRefs("caos-teste", variant);
    const failed = await app.request("/v1/admin/products/caos-teste", {
      method: "PATCH",
      headers,
      body: JSON.stringify({
        ...sampleProduct("caos-novo"),
        badges: ["novo", "novo"],
      }),
    });
    expect(failed.status).toBe(409);
    const slug = await sql.query<{ slug: string }>("select slug from products where id = 'caos-teste'");
    expect(slug.rows[0]?.slug).toBe("caos-teste");
    const refs = await sql.query<{ slug: string }>(
      `select product_slug as slug from order_lines
       union all select product_slug from wishlist_items
       union all select product_slug from subscriptions
       union all select product_slug from reviews`,
    );
    expect(refs.rows.every((row) => row.slug === "caos-teste")).toBe(true);
  });

  it("junta a lista de desejos quando o cliente já tem o slug novo", async () => {
    const app = createAdminApp(sql);
    const owner = await login(app, "dono@pulso.test", "senha-dona-pulso", "203.0.113.62");
    const headers = auth(owner.token, "203.0.113.62");
    expect((await app.request("/v1/admin/products", { method: "POST", headers, body: JSON.stringify(sampleProduct("caos-teste")) })).status).toBe(201);
    const variant = await variantId("caos-teste");
    await seedRefs("caos-teste", variant, "caos-novo");
    const renamed = await app.request("/v1/admin/products/caos-teste", {
      method: "PATCH",
      headers,
      body: JSON.stringify(sampleProduct("caos-novo")),
    });
    expect(renamed.status).toBe(200);
    const wish = await sql.query<{ product_slug: string }>("select product_slug from wishlist_items");
    expect(wish.rows).toEqual([{ product_slug: "caos-novo" }]);
  });

  it("grava a assinatura no slug atual e o patch também", async () => {
    const app = createAdminApp(sql);
    const owner = await login(app, "dono@pulso.test", "senha-dona-pulso", "203.0.113.63");
    const headers = auth(owner.token, "203.0.113.63");
    expect(
      (await app.request("/v1/admin/products", { method: "POST", headers, body: JSON.stringify({ ...sampleProduct("caos-teste"), id: "pote-interno" }) })).status,
    ).toBe(201);
    const variant = await variantId("pote-interno");
    await sql.query("insert into customers (id, email, name) values ('cli-1', 'cli@pulso.test', 'Cli')");
    const saved = await saveSubscription(sql, {
      id: "sub-nova",
      customerId: "cli-1",
      productSlug: "pote-interno",
      variantId: variant,
      quantity: 1,
      unitPriceCents: 15990,
      intervalDays: 30,
      status: "ativa",
      nextChargeOn: "2026-12-01",
    });
    expect(saved.productSlug).toBe("caos-teste");
    expect(saved.unitPriceCents).toBe(15990);
    expect(saved.nextChargeOn).toBe("2026-12-01");
    await sql.query("update subscriptions set product_slug = 'pote-interno' where id = 'sub-nova'");
    const patched = await patchSubscription(sql, "sub-nova", "pausada");
    expect(patched).toMatchObject({ productSlug: "caos-teste", status: "pausada", unitPriceCents: 15990, nextChargeOn: "2026-12-01" });
    const stored = await sql.query<{ next_charge_on: string; unit_price_cents: number }>(
      "select next_charge_on::text as next_charge_on, unit_price_cents from subscriptions where id = 'sub-nova'",
    );
    expect(stored.rows[0]).toEqual({ next_charge_on: "2026-12-01", unit_price_cents: 15990 });
    await expect(
      saveSubscription(sql, {
        id: "sub-ruim",
        customerId: "cli-1",
        productSlug: "nao-existe",
        variantId: variant,
        quantity: 1,
        unitPriceCents: 15990,
        intervalDays: 30,
        status: "ativa",
        nextChargeOn: "2026-12-01",
      }),
    ).rejects.toBeInstanceOf(CatalogError);
  });

  it("trata % e _ como texto na busca ILIKE", async () => {
    const app = createAdminApp(sql);
    const owner = await login(app, "dono@pulso.test", "senha-dona-pulso", "203.0.113.64");
    const headers = auth(owner.token, "203.0.113.64");
    const create = (slug: string, name: string, sku?: string) =>
      app.request("/v1/admin/products", {
        method: "POST",
        headers,
        body: JSON.stringify({
          ...sampleProduct(slug),
          name,
          variants: [{ ...sampleProduct(slug).variants[0], sku: sku ?? `PL-${slug}`.toUpperCase() }],
        }),
      });
    expect((await create("cem", "100% Whey", "SKU_100%")).status).toBe(201);
    expect((await create("axb", "axb puro")).status).toBe(201);
    expect((await create("a-b", "a_b sabor")).status).toBe(201);

    const names = async (q: string) => {
      const listed = await listAdminProducts(sql, { page: 1, pageSize: 20, q, status: "todos" });
      return listed.items.map((item) => item.slug).sort();
    };
    expect(await names("%")).toEqual(["cem"]);
    expect(await names("a_b")).toEqual(["a-b"]);
    expect(await names("a%b")).toEqual([]);
    expect(await names("SKU_100%")).toEqual(["cem"]);
    expect(await names("_")).toEqual(["a-b", "cem"]);

    await app.request("/v1/admin/coupons", {
      method: "POST",
      headers,
      body: JSON.stringify({ code: "dez", label: "10% off", kind: "percent", value: 10, active: true }),
    });
    await app.request("/v1/admin/coupons", {
      method: "POST",
      headers,
      body: JSON.stringify({ code: "dezx", label: "10x off", kind: "percent", value: 10, active: true }),
    });
    const coupons = await listAdminCoupons(sql, { page: 1, pageSize: 20, q: "%", active: "" });
    expect(coupons.items.map((item) => item.code)).toEqual(["DEZ"]);

    await sql.query("insert into drops (id, edition, name, status) values ('drop-1', 'lote_1', 'Edição', 'em_breve'), ('drop-2', 'loteX1', 'Outra', 'em_breve')");
    const drops = await listDrops(sql, { page: 1, pageSize: 20, q: "lote_1" });
    expect(drops.items.map((item) => item.id)).toEqual(["drop-1"]);
    const wild = await listDrops(sql, { page: 1, pageSize: 20, q: "_" });
    expect(wild.items.map((item) => item.id)).toEqual(["drop-1"]);
  });

  it("lista órfãos sem apagar", async () => {
    await sql.query("insert into customers (id, email, name) values ('cli-1', 'cli@pulso.test', 'Cli')");
    await sql.query(
      `insert into orders (id, code, email, status, payment_method, subtotal_cents, total_cents)
       values ('ped-1', 'PULSO-1', 'cli@pulso.test', 'pago', 'pix', 1000, 1000)`,
    );
    await sql.query("alter table order_lines drop constraint order_lines_variant_fk");
    try {
      await sql.query(
        `insert into order_lines (id, order_id, product_slug, variant_id, name, quantity, unit_price_cents)
         values ('lin-orfa', 'ped-1', 'sumiu', 'variacao-fantasma', 'Caos', 1, 1000)`,
      );
      await sql.query("insert into wishlist_items (customer_id, product_slug) values ('cli-1', 'sumiu')");
      await sql.query(
        `insert into subscriptions (id, customer_id, product_slug, variant_id, quantity, unit_price_cents, status, next_charge_on)
         values ('sub-orfa', 'cli-1', 'sumiu', 'variacao-fantasma', 1, 1000, 'ativa', '2026-11-02')`,
      );
      const report = await findOrphans(sql);
      expect(report.total).toBe(4);
      expect(report.checks.find((check) => check.table === "order_lines" && check.column === "variant_id")).toMatchObject({
        count: 1,
        sample: [{ id: "lin-orfa", value: "variacao-fantasma" }],
      });
      expect(report.checks.find((check) => check.table === "order_lines" && check.column === "product_slug")?.count).toBe(1);
      expect(report.checks.find((check) => check.table === "wishlist_items" && check.column === "product_slug")?.count).toBe(1);
      expect(report.checks.find((check) => check.table === "subscriptions" && check.column === "product_slug")?.count).toBe(1);
      const still = await sql.query("select id from order_lines where id = 'lin-orfa'");
      expect(still.rows).toHaveLength(1);
      const wish = await sql.query("select product_slug from wishlist_items where product_slug = 'sumiu'");
      expect(wish.rows).toHaveLength(1);
    } finally {
      await sql.query("delete from order_lines where id = 'lin-orfa'");
      await sql.query(
        `do $$
         begin
           if not exists (
             select 1 from pg_constraint
             where conrelid = 'order_lines'::regclass and conname = 'order_lines_variant_fk'
           ) then
             alter table order_lines
               add constraint order_lines_variant_fk
               foreign key (variant_id) references product_variants (id) on delete restrict
               not valid;
           end if;
         end $$`,
      );
    }
  });

  it("continua certo se a FK passar a cascatear no update", async () => {
    const app = createAdminApp(sql);
    const owner = await login(app, "dono@pulso.test", "senha-dona-pulso", "203.0.113.65");
    const headers = auth(owner.token, "203.0.113.65");
    expect(
      (await app.request("/v1/admin/products", { method: "POST", headers, body: JSON.stringify({ ...sampleProduct("sabor-velho"), id: "pote-cascade" }) })).status,
    ).toBe(201);
    const variant = await variantId("pote-cascade");
    await seedRefs("sabor-velho", variant);
    await sql.query(
      `insert into subscriptions (id, customer_id, product_slug, variant_id, quantity, unit_price_cents, status, next_charge_on)
       values ('sub-id', 'cli-1', 'pote-cascade', $1, 1, 8800, 'ativa', '2026-10-01')`,
      [variant],
    );
    const reviewFk = await sql.query<{ conname: string }>(
      "select conname from pg_constraint where conrelid = 'reviews'::regclass and contype = 'f'",
    );
    const reviewName = reviewFk.rows[0]?.conname ?? "reviews_product_slug_fkey";
    await sql.query(`alter table reviews drop constraint ${reviewName}`);
    await sql.query(
      `alter table reviews add constraint reviews_product_slug_fkey
       foreign key (product_slug) references products (slug) on update cascade on delete cascade`,
    );
    await sql.query(
      `alter table order_lines add constraint order_lines_product_slug_fkey
       foreign key (product_slug) references products (slug) on update cascade on delete restrict not valid`,
    );
    await sql.query(
      `alter table wishlist_items add constraint wishlist_items_product_slug_fkey
       foreign key (product_slug) references products (slug) on update cascade on delete cascade not valid`,
    );
    await sql.query(
      `alter table subscriptions add constraint subscriptions_product_slug_fkey
       foreign key (product_slug) references products (slug) on update cascade on delete restrict not valid`,
    );
    try {
      const renamed = await app.request("/v1/admin/products/pote-cascade", {
        method: "PATCH",
        headers,
        body: JSON.stringify({ ...sampleProduct("sabor-novo"), id: "pote-cascade" }),
      });
      expect(renamed.status).toBe(200);
      const slugs = await sql.query<{ slug: string }>(
        `select product_slug as slug from order_lines
         union all select product_slug from wishlist_items
         union all select product_slug from subscriptions
         union all select product_slug from reviews`,
      );
      expect(slugs.rows.every((row) => row.slug === "sabor-novo")).toBe(true);
      const counts = await sql.query<{ lines: number; wish: number; subs: number; reviews: number }>(
        `select
           (select count(*)::int from order_lines) as lines,
           (select count(*)::int from wishlist_items) as wish,
           (select count(*)::int from subscriptions) as subs,
           (select count(*)::int from reviews) as reviews`,
      );
      expect(counts.rows[0]).toEqual({ lines: 1, wish: 1, subs: 2, reviews: 1 });
      const price = await sql.query<{ unit_price_cents: number; next_charge_on: string }>(
        "select unit_price_cents, next_charge_on::text as next_charge_on from subscriptions where id = 'sub-id'",
      );
      expect(price.rows[0]).toEqual({ unit_price_cents: 8800, next_charge_on: "2026-10-01" });
    } finally {
      await sql.query("alter table order_lines drop constraint if exists order_lines_product_slug_fkey");
      await sql.query("alter table wishlist_items drop constraint if exists wishlist_items_product_slug_fkey");
      await sql.query("alter table subscriptions drop constraint if exists subscriptions_product_slug_fkey");
      await sql.query("alter table reviews drop constraint if exists reviews_product_slug_fkey");
      await sql.query(
        `alter table reviews add constraint reviews_product_slug_fkey
         foreign key (product_slug) references products (slug) on delete cascade`,
      );
    }
  });
});
