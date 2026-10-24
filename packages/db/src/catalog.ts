import type { CatalogProduct } from "@pulso/data";
import type { Badge, CategoryId, Coupon, FlavorFamily, GoalId, ProductLabel } from "@pulso/domain";
import { ilikeContains, ilikeMatch } from "./like";
import type { Sql, SqlClient } from "./sql";
import { withTx } from "./sql";

export class CatalogError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code: string,
  ) {
    super(message);
  }
}

export type DbProductStatus = "rascunho" | "ativo" | "oculto" | "arquivado";
export type AdminProductStatus = "rascunho" | "publicado" | "oculto" | "arquivado";

export function toDbStatus(status: string): DbProductStatus {
  if (status === "publicado" || status === "ativo") return "ativo";
  if (status === "rascunho" || status === "oculto" || status === "arquivado") return status;
  throw new CatalogError(400, "Status inválido.", "STATUS");
}

export function toAdminStatus(status: string): AdminProductStatus {
  if (status === "ativo" || status === "publicado") return "publicado";
  if (status === "rascunho" || status === "oculto" || status === "arquivado") return status;
  return "rascunho";
}

export interface AdminFlavor {
  id: string;
  name: string;
  tagline: string;
  hex: string;
  family: FlavorFamily;
  limited: boolean;
  stock: number;
}

export interface AdminVariant {
  id: string;
  flavorId: string;
  size: string;
  sku: string;
  priceCents: number;
  compareAtCents: number | null;
  stock: number;
  weightGrams: number;
  servings: number;
}

export interface AdminImage {
  id: string;
  flavorId: string | null;
  url: string | null;
  alt: string;
  position: number;
  isCover: boolean;
  fallbackHex: string | null;
}

export interface AdminProduct {
  id: string;
  slug: string;
  name: string;
  line: string;
  tagline: string;
  description: string;
  howToUse: string;
  categoryId: string;
  goals: string[];
  badges: string[];
  status: AdminProductStatus;
  caffeineMg: number;
  proteinG: number;
  influencerId: string | null;
  subscriptionEnabled: boolean;
  subscriptionPercent: number;
  subscriptionIntervalDays: number;
  isKit: boolean;
  kitItems: { productId: string; quantity: number }[];
  flavors: AdminFlavor[];
  variants: AdminVariant[];
  label: ProductLabel;
  images: AdminImage[];
  updatedAt: string;
}

export interface AdminCoupon {
  id: string;
  code: string;
  label: string;
  kind: "percent" | "shipping";
  value: number;
  minCents: number;
  startsAt: string | null;
  endsAt: string | null;
  maxUses: number | null;
  uses: number;
  influencerId: string | null;
  active: boolean;
}

interface ProductRow {
  id: string;
  slug: string;
  name: string;
  line: string | null;
  tagline: string | null;
  description: string | null;
  how_to_use: string | null;
  category_id: string | null;
  category: string;
  status: string;
  caffeine_mg: number;
  protein_g: number;
  influencer_id: string | null;
  subscription_enabled: boolean;
  subscription_discount_percent: number;
  subscription_interval_days: number;
  is_kit: boolean;
  updated_at: Date | string;
}

interface FlavorRow {
  id: string;
  product_id: string;
  slug: string;
  name: string;
  tagline: string;
  hex: string;
  family: FlavorFamily;
  limited: boolean;
  position: number;
}

interface VariantRow {
  id: string;
  product_id: string;
  flavor_id: string;
  sku: string;
  size: string;
  price_cents: number;
  compare_at_cents: number | null;
  stock: number;
  weight_g: number;
  servings: number;
  position: number;
}

interface ImageRow {
  id: string;
  product_id: string;
  flavor_id: string | null;
  url: string | null;
  alt: string;
  position: number;
  is_cover: boolean;
  fallback_hex: string | null;
}

interface LabelRow {
  product_id: string;
  registration: string;
  category: string;
  serving: string;
  servings_per_container: number;
  ingredients: string;
  allergens: string;
  warnings: string[];
  manufacturer: string;
}

interface NutritionRow {
  product_id: string;
  position: number;
  nutrient: string;
  amount: string;
  daily_value: string | null;
}

interface CouponRow {
  code: string;
  label: string;
  kind: "percent" | "shipping";
  percent: number | null;
  value: number | null;
  min_cents: number | null;
  starts_at: Date | string | null;
  ends_at: Date | string | null;
  max_uses: number | null;
  uses: number;
  influencer_id: string | null;
  active: boolean;
}

function iso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function num(value: unknown, fallback = 0): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function pgCode(error: unknown): string | null {
  if (typeof error === "object" && error && "code" in error && typeof (error as { code: unknown }).code === "string") {
    return (error as { code: string }).code;
  }
  return null;
}

const EMPTY_LABEL: ProductLabel = {
  registration: "NI-DEMO-RASCUNHO",
  category: "Suplemento alimentar",
  serving: "",
  servingsPerContainer: 1,
  ingredients: "",
  allergens: "",
  warnings: ["Este produto não é um medicamento."],
  nutrition: [],
  manufacturer: "PULSO Indústria de Alimentos Ltda. (empresa fictícia deste protótipo).",
};

export async function readAdminProducts(sql: Sql, ids?: string[]): Promise<AdminProduct[]> {
  const filter = ids ? "where p.id = any($1::text[])" : "";
  const params = ids ? [ids] : [];
  const products = await sql.query<ProductRow>(
    `select p.id, p.slug, p.name, p.line, p.tagline, p.description, p.how_to_use, p.category_id, p.category,
            p.status, p.caffeine_mg, p.protein_g, p.influencer_id, p.subscription_enabled,
            p.subscription_discount_percent, p.subscription_interval_days, p.is_kit, p.updated_at
     from products p
     ${filter}
     order by p.name asc`,
    params,
  );
  if (!products.rows.length) return [];
  const productIds = products.rows.map((row) => row.id);
  const [flavors, variants, images, labels, nutrition, goals, badges, kits] = await Promise.all([
    sql.query<FlavorRow>(
      `select id, product_id, slug, name, tagline, hex, family, limited, position
       from product_flavors where product_id = any($1::text[]) order by position asc`,
      [productIds],
    ),
    sql.query<VariantRow>(
      `select id, product_id, flavor_id, sku, size, price_cents, compare_at_cents, stock, weight_g, servings, position
       from product_variants where product_id = any($1::text[]) order by position asc`,
      [productIds],
    ),
    sql.query<ImageRow>(
      `select id, product_id, flavor_id, url, alt, position, is_cover, fallback_hex
       from product_images where product_id = any($1::text[]) order by position asc`,
      [productIds],
    ),
    sql.query<LabelRow>(
      `select product_id, registration, category, serving, servings_per_container, ingredients, allergens, warnings, manufacturer
       from product_labels where product_id = any($1::text[])`,
      [productIds],
    ),
    sql.query<NutritionRow>(
      `select product_id, position, nutrient, amount, daily_value
       from nutrition_rows where product_id = any($1::text[]) order by position asc`,
      [productIds],
    ),
    sql.query<{ product_id: string; goal_id: string }>(
      "select product_id, goal_id from product_goals where product_id = any($1::text[])",
      [productIds],
    ),
    sql.query<{ product_id: string; badge: string }>(
      "select product_id, badge from product_badges where product_id = any($1::text[])",
      [productIds],
    ),
    sql.query<{ kit_id: string; product_id: string; quantity: number; position: number }>(
      "select kit_id, product_id, quantity, position from kit_items where kit_id = any($1::text[]) order by position asc",
      [productIds],
    ),
  ]);

  const byProduct = <T extends { product_id: string }>(rows: T[]) => {
    const map = new Map<string, T[]>();
    for (const row of rows) {
      const list = map.get(row.product_id) ?? [];
      list.push(row);
      map.set(row.product_id, list);
    }
    return map;
  };
  const flavorMap = byProduct(flavors.rows);
  const variantMap = byProduct(variants.rows);
  const imageMap = byProduct(images.rows);
  const nutritionMap = byProduct(nutrition.rows);
  const goalMap = byProduct(goals.rows);
  const badgeMap = byProduct(badges.rows);
  const kitMap = new Map<string, { productId: string; quantity: number }[]>();
  for (const row of kits.rows) {
    const list = kitMap.get(row.kit_id) ?? [];
    list.push({ productId: row.product_id, quantity: num(row.quantity) });
    kitMap.set(row.kit_id, list);
  }
  const labelMap = new Map(labels.rows.map((row) => [row.product_id, row]));
  const flavorSlug = new Map(flavors.rows.map((row) => [row.id, row.slug]));

  const order = ids ? new Map(ids.map((id, index) => [id, index])) : null;
  const rows = order ? [...products.rows].sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0)) : products.rows;

  return rows.map((row) => {
    const productFlavors = flavorMap.get(row.id) ?? [];
    const productVariants = variantMap.get(row.id) ?? [];
    const stockByFlavor = new Map<string, number>();
    for (const variant of productVariants) {
      const current = stockByFlavor.get(variant.flavor_id);
      const stock = num(variant.stock);
      stockByFlavor.set(variant.flavor_id, current === undefined ? stock : Math.min(current, stock));
    }
    const label = labelMap.get(row.id);
    const nutritionRows = nutritionMap.get(row.id) ?? [];
    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      line: row.line ?? "",
      tagline: row.tagline ?? "",
      description: row.description ?? "",
      howToUse: row.how_to_use ?? "",
      categoryId: row.category_id ?? row.category,
      goals: (goalMap.get(row.id) ?? []).map((item) => item.goal_id),
      badges: (badgeMap.get(row.id) ?? []).map((item) => item.badge),
      status: toAdminStatus(row.status),
      caffeineMg: num(row.caffeine_mg),
      proteinG: num(row.protein_g),
      influencerId: row.influencer_id,
      subscriptionEnabled: row.subscription_enabled,
      subscriptionPercent: num(row.subscription_discount_percent),
      subscriptionIntervalDays: num(row.subscription_interval_days, 30),
      isKit: row.is_kit,
      kitItems: kitMap.get(row.id) ?? [],
      flavors: productFlavors.map((flavor) => ({
        id: flavor.slug,
        name: flavor.name,
        tagline: flavor.tagline,
        hex: flavor.hex,
        family: flavor.family,
        limited: flavor.limited,
        stock: stockByFlavor.get(flavor.id) ?? 0,
      })),
      variants: productVariants.map((variant) => ({
        id: variant.id,
        flavorId: flavorSlug.get(variant.flavor_id) ?? variant.flavor_id,
        size: variant.size,
        sku: variant.sku,
        priceCents: num(variant.price_cents),
        compareAtCents: variant.compare_at_cents === null ? null : num(variant.compare_at_cents),
        stock: num(variant.stock),
        weightGrams: num(variant.weight_g),
        servings: num(variant.servings),
      })),
      label: label
        ? {
            registration: label.registration,
            category: label.category,
            serving: label.serving,
            servingsPerContainer: num(label.servings_per_container, 1),
            ingredients: label.ingredients,
            allergens: label.allergens,
            warnings: label.warnings ?? [],
            nutrition: nutritionRows.map((item) => ({
              nutrient: item.nutrient,
              amount: item.amount,
              ...(item.daily_value ? { dailyValue: item.daily_value } : {}),
            })),
            manufacturer: label.manufacturer,
          }
        : EMPTY_LABEL,
      images: (imageMap.get(row.id) ?? []).map((image) => ({
        id: image.id,
        flavorId: image.flavor_id ? (flavorSlug.get(image.flavor_id) ?? null) : null,
        url: image.url,
        alt: image.alt,
        position: num(image.position),
        isCover: image.is_cover,
        fallbackHex: image.fallback_hex,
      })),
      updatedAt: iso(row.updated_at) ?? new Date(0).toISOString(),
    };
  });
}

export async function getAdminProduct(sql: Sql, id: string): Promise<AdminProduct | null> {
  const byId = await readAdminProducts(sql, [id]);
  if (byId.length) return byId[0] ?? null;
  const found = await sql.query<{ id: string }>("select id from products where slug = $1", [id]);
  const realId = found.rows[0]?.id;
  if (!realId) return null;
  const bySlug = await readAdminProducts(sql, [realId]);
  return bySlug[0] ?? null;
}

async function reviewStats(sql: Sql, slugs: string[]): Promise<Map<string, { rating: number; reviewCount: number }>> {
  const rows = await sql.query<{ product_slug: string; rating: number; review_count: number }>(
    `select product_slug, coalesce(avg(rating), 0) as rating, count(*)::int as review_count
     from reviews
     where status = 'aprovada' and product_slug = any($1::text[])
     group by product_slug`,
    [slugs],
  );
  return new Map(rows.rows.map((row) => [row.product_slug, { rating: num(row.rating), reviewCount: num(row.review_count) }]));
}

async function dropsByProduct(sql: Sql, ids: string[]): Promise<Map<string, { id: string; edition: string; endsAt: string; unitsLeft: number; teaser: boolean }>> {
  const rows = await sql.query<{
    id: string;
    edition: string;
    product_id: string;
    ends_at: Date | string | null;
    units_left: number | null;
    status: string;
  }>(
    `select id, edition, product_id, ends_at, units_left, status
     from drops
     where product_id = any($1::text[]) and status <> 'encerrado'
     order by case status when 'no_ar' then 0 else 1 end, ends_at asc nulls last`,
    [ids],
  );
  const map = new Map<string, { id: string; edition: string; endsAt: string; unitsLeft: number; teaser: boolean }>();
  for (const row of rows.rows) {
    if (!row.product_id || map.has(row.product_id) || !row.ends_at) continue;
    map.set(row.product_id, {
      id: row.id,
      edition: row.edition,
      endsAt: iso(row.ends_at) ?? "",
      unitsLeft: row.units_left === null ? 0 : num(row.units_left),
      teaser: row.status === "em_breve",
    });
  }
  return map;
}

export function toCatalogProduct(
  product: AdminProduct,
  stats: { rating: number; reviewCount: number },
  drop?: { id: string; edition: string; endsAt: string; unitsLeft: number; teaser: boolean },
): CatalogProduct {
  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    line: product.line,
    tagline: product.tagline,
    description: product.description,
    howToUse: product.howToUse,
    category: product.categoryId as CategoryId,
    goals: product.goals as GoalId[],
    flavors: product.flavors.map((flavor) => ({
      id: flavor.id,
      name: flavor.name,
      tagline: flavor.tagline,
      hex: flavor.hex,
      family: flavor.family,
      stock: flavor.stock,
      limited: flavor.limited,
    })),
    variants: product.variants.map((variant) => ({
      id: variant.id,
      flavorId: variant.flavorId,
      size: variant.size,
      sku: variant.sku,
      priceCents: variant.priceCents,
      ...(variant.compareAtCents !== null ? { compareAtCents: variant.compareAtCents } : {}),
      stock: variant.stock,
      weightGrams: variant.weightGrams,
      servings: variant.servings,
    })),
    badges: product.badges as Badge[],
    rating: stats.rating,
    reviewCount: stats.reviewCount,
    subscription: {
      enabled: product.subscriptionEnabled,
      discountPercent: product.subscriptionPercent,
      intervalDays: product.subscriptionIntervalDays,
    },
    caffeineMg: product.caffeineMg,
    proteinPerServingGrams: product.proteinG,
    ...(product.influencerId ? { influencerSlug: product.influencerId } : {}),
    ...(drop ? { drop } : {}),
    ...(product.isKit ? { isKit: true } : {}),
    ...(product.kitItems.length ? { kitItems: product.kitItems.map((item) => ({ productSlug: item.productId, quantity: item.quantity })) } : {}),
    hidden: product.status !== "publicado",
    label: product.label,
  };
}

export async function readPublicProducts(sql: Sql): Promise<CatalogProduct[]> {
  const found = await sql.query<{ id: string }>(
    "select id from products where status = 'ativo' and active = true order by name asc",
  );
  const ids = found.rows.map((row) => row.id);
  if (!ids.length) return [];
  const products = await readAdminProducts(sql, ids);
  const [stats, drops] = await Promise.all([
    reviewStats(sql, products.map((product) => product.slug)),
    dropsByProduct(sql, ids),
  ]);
  return products.map((product) => toCatalogProduct(product, stats.get(product.slug) ?? { rating: 0, reviewCount: 0 }, drops.get(product.id)));
}

export interface ProductListQuery {
  page: number;
  pageSize: number;
  q: string;
  status: string;
  kitsOnly?: boolean;
}

const SLUG_REF_TABLES = ["reviews", "order_lines", "wishlist_items", "subscriptions"] as const;

function legacySlugMatch(alias = ""): string {
  const column = alias ? `${alias}.product_slug` : "product_slug";
  return `(
    ${column} = $1
    or (
      ${column} = $3
      and ${column} <> $1
      and ${column} <> $2
      and not exists (select 1 from products other where other.slug = $3 and other.id <> $3)
    )
  )`;
}

async function productSlugCascades(sql: Sql, table: (typeof SLUG_REF_TABLES)[number]): Promise<boolean> {
  const rows = await sql.query<{ action: string }>(
    `select c.confupdtype::text as action
     from pg_constraint c
     join pg_attribute child
       on child.attrelid = c.conrelid
      and child.attnum = c.conkey[1]
      and child.attname = 'product_slug'
     join pg_attribute parent
       on parent.attrelid = c.confrelid
      and parent.attnum = c.confkey[1]
      and parent.attname = 'slug'
     where c.contype = 'f'
       and c.conrelid = $1::regclass
       and c.confrelid = 'products'::regclass
       and coalesce(array_length(c.conkey, 1), 0) = 1`,
    [table],
  );
  return rows.rows.length > 0 && rows.rows.every((row) => row.action === "c");
}

// A FK imediata sem CASCADE exige o slug novo e as filhas no mesmo comando.
// Se a FK for ON UPDATE CASCADE, a filha não entra nesse comando: o Postgres já a atualiza.
async function retargetProductSlug(sql: Sql, input: { productId: string; from: string; to: string }): Promise<void> {
  await sql.query(
    `delete from wishlist_items as old
     where ${legacySlugMatch("old")}
       and (
         exists (
           select 1 from wishlist_items as keep
           where keep.customer_id = old.customer_id and keep.product_slug = $2
         )
         or exists (
           select 1 from wishlist_items as keep
           where keep.customer_id = old.customer_id
             and keep.ctid < old.ctid
             and ${legacySlugMatch("keep")}
         )
       )`,
    [input.from, input.to, input.productId],
  );

  const manual: Array<(typeof SLUG_REF_TABLES)[number]> = [];
  for (const table of SLUG_REF_TABLES) {
    if (!(await productSlugCascades(sql, table))) manual.push(table);
  }

  const ctes = [
    `renamed as (
      update products set slug = $2 where id = $3 and slug = $1 returning id
    )`,
    ...manual.map(
      (table, index) => `moved_${index} as (
        update ${table} set product_slug = $2
        where ${legacySlugMatch()}
        returning 1
      )`,
    ),
  ];
  const renamed = await sql.query<{ id: string }>(`with ${ctes.join(", ")} select id from renamed`, [
    input.from,
    input.to,
    input.productId,
  ]);
  if (!renamed.rows.length) throw new CatalogError(500, "O slug não foi atualizado.", "SLUG");

  for (const table of SLUG_REF_TABLES) {
    if (manual.includes(table)) continue;
    await sql.query(
      `update ${table} set product_slug = $2
       where product_slug = $3
         and product_slug <> $1
         and product_slug <> $2
         and not exists (select 1 from products other where other.slug = $3 and other.id <> $3)`,
      [input.from, input.to, input.productId],
    );
  }
}

export async function resolveProductSlug(sql: Sql, ref: string): Promise<string> {
  const found = await sql.query<{ slug: string }>(
    `select slug from products
     where slug = $1 or id = $1
     order by case when slug = $1 then 0 else 1 end
     limit 1`,
    [ref],
  );
  const slug = found.rows[0]?.slug;
  if (!slug) throw new CatalogError(400, "Produto não encontrado.", "PRODUCT_MISSING");
  return slug;
}

export async function listAdminProducts(
  sql: Sql,
  query: ProductListQuery,
): Promise<{ items: AdminProduct[]; total: number; page: number; pageSize: number }> {
  const where: string[] = [];
  const params: unknown[] = [];
  if (query.kitsOnly) where.push("p.is_kit = true");
  const status = query.status;
  if (!status || status === "ativos") where.push("p.status <> 'arquivado'");
  else if (status !== "todos") {
    params.push(toDbStatus(status));
    where.push(`p.status = $${params.length}`);
  }
  if (query.q) {
    params.push(ilikeContains(query.q));
    const index = params.length;
    const pattern = `$${index}`;
    where.push(
      `(${ilikeMatch("p.name", pattern)} or ${ilikeMatch("p.slug", pattern)} or ${ilikeMatch("coalesce(p.line, '')", pattern)} or exists (select 1 from product_variants v where v.product_id = p.id and ${ilikeMatch("v.sku", pattern)}))`,
    );
  }
  const clause = where.length ? `where ${where.join(" and ")}` : "";
  const total = await sql.query<{ count: number }>(`select count(*)::int as count from products p ${clause}`, params);
  const offset = (query.page - 1) * query.pageSize;
  const pageParams = [...params, query.pageSize, offset];
  const ids = await sql.query<{ id: string }>(
    `select p.id from products p ${clause} order by p.updated_at desc, p.name asc limit $${params.length + 1} offset $${params.length + 2}`,
    pageParams,
  );
  const items = await readAdminProducts(sql, ids.rows.map((row) => row.id));
  return { items, total: num(total.rows[0]?.count), page: query.page, pageSize: query.pageSize };
}

async function assertRefs(sql: Sql, input: AdminProduct): Promise<void> {
  const category = await sql.query("select slug from categories where slug = $1", [input.categoryId]);
  if (!category.rows.length) throw new CatalogError(400, "Categoria não encontrada.", "CATEGORY_MISSING");
  if (input.influencerId) {
    const influencer = await sql.query("select slug from influencers where slug = $1", [input.influencerId]);
    if (!influencer.rows.length) throw new CatalogError(400, "Influencer não encontrado.", "INFLUENCER_MISSING");
  }
  for (const goal of input.goals) {
    const found = await sql.query("select slug from goals where slug = $1", [goal]);
    if (!found.rows.length) throw new CatalogError(400, "Objetivo não encontrado.", "GOAL_MISSING");
  }
  for (const item of input.kitItems) {
    if (item.productId === input.id) throw new CatalogError(400, "O kit não pode incluir ele mesmo.", "KIT_SELF");
    const found = await sql.query("select id from products where id = $1", [item.productId]);
    if (!found.rows.length) throw new CatalogError(400, "Item do kit não encontrado.", "KIT_ITEM_MISSING");
  }
}

type ScopedTable = "product_variants" | "product_images";

async function rowIdExists(sql: Sql, table: ScopedTable, id: string): Promise<boolean> {
  const found = await sql.query(`select id from ${table} where id = $1`, [id]);
  return found.rows.length > 0;
}

/** Id que já é deste produto permanece. Qualquer outro (vazio, repetido ou de outro produto) nasce aqui. */
async function assignScopedIds(
  sql: Sql,
  table: ScopedTable,
  productId: string,
  requested: readonly (string | undefined)[],
  mint: (index: number) => string,
): Promise<string[]> {
  const asked = requested.map((id) => id?.trim() ?? "").filter(Boolean);
  const owned = new Set<string>();
  if (asked.length) {
    const found = await sql.query<{ id: string }>(
      `select id from ${table} where product_id = $1 and id = any($2::text[])`,
      [productId, asked],
    );
    for (const row of found.rows) owned.add(row.id);
  }
  const used = new Set<string>();
  const ids: string[] = [];
  for (let index = 0; index < requested.length; index += 1) {
    const requestedId = requested[index]?.trim() ?? "";
    if (requestedId && owned.has(requestedId) && !used.has(requestedId)) {
      used.add(requestedId);
      ids.push(requestedId);
      continue;
    }
    let next = mint(index);
    let bump = 0;
    while (used.has(next) || (await rowIdExists(sql, table, next))) {
      bump += 1;
      next = `${mint(index)}__${bump}`;
      if (bump > 1000) throw new CatalogError(409, "Não deu para gerar um id livre.", table === "product_variants" ? "variacao_de_outro_produto" : "IMAGE_ID");
    }
    used.add(next);
    ids.push(next);
  }
  return ids;
}

export async function saveAdminProduct(sql: SqlClient, input: AdminProduct): Promise<AdminProduct> {
  return withTx(sql, async () => {
    const status = toDbStatus(input.status);
    const current = await sql.query<{ slug: string }>("select slug from products where id = $1", [input.id]);
    const previousSlug = current.rows[0]?.slug;
    const renaming = Boolean(previousSlug && previousSlug !== input.slug);
    const storedSlug = renaming ? previousSlug : input.slug;
    const slugOwner = await sql.query("select id from products where slug = $1 and id <> $2", [input.slug, input.id]);
    if (slugOwner.rows.length) throw new CatalogError(409, "Já existe um produto com esse slug.", "SLUG_TAKEN");
    await assertRefs(sql, input);
    const flavorIds = input.flavors.map((flavor) => `${input.id}__${flavor.id}`);
    const variantIds = await assignScopedIds(
      sql,
      "product_variants",
      input.id,
      input.variants.map((variant) => variant.id),
      (index) => `${input.id}__${input.variants[index]?.flavorId ?? "sabor"}__${index}`,
    );
    const seenSku = new Set<string>();
    for (const [index, variant] of input.variants.entries()) {
      if (seenSku.has(variant.sku)) throw new CatalogError(409, "Já existe uma variação com esse SKU.", "SKU_TAKEN");
      seenSku.add(variant.sku);
      const taken = await sql.query("select id from product_variants where sku = $1 and id <> $2", [variant.sku, variantIds[index]]);
      if (taken.rows.length) throw new CatalogError(409, "Já existe uma variação com esse SKU.", "SKU_TAKEN");
    }
    const doomed = await sql.query<{ id: string }>(
      "select id from product_variants where product_id = $1 and not (id = any($2::text[]))",
      [input.id, variantIds],
    );
    for (const row of doomed.rows) {
      const used = await sql.query("select 1 as ok from order_lines where variant_id = $1 limit 1", [row.id]);
      if (used.rows.length) throw new CatalogError(409, "Essa variação está num pedido e não pode sair.", "VARIANT_IN_USE");
    }

    await sql.query(
      `insert into products (
         id, slug, name, category, active, payload, updated_at,
         line, tagline, description, how_to_use, category_id, status,
         caffeine_mg, protein_g, influencer_id,
         subscription_enabled, subscription_discount_percent, subscription_interval_days, is_kit
       ) values (
         $1, $2, $3, $4, $5, '{}'::jsonb, now(),
         $6, $7, $8, $9, $10, $11,
         $12, $13, $14,
         $15, $16, $17, $18
       )
       on conflict (id) do update set
         slug = excluded.slug,
         name = excluded.name,
         category = excluded.category,
         active = excluded.active,
         updated_at = now(),
         line = excluded.line,
         tagline = excluded.tagline,
         description = excluded.description,
         how_to_use = excluded.how_to_use,
         category_id = excluded.category_id,
         status = excluded.status,
         caffeine_mg = excluded.caffeine_mg,
         protein_g = excluded.protein_g,
         influencer_id = excluded.influencer_id,
         subscription_enabled = excluded.subscription_enabled,
         subscription_discount_percent = excluded.subscription_discount_percent,
         subscription_interval_days = excluded.subscription_interval_days,
         is_kit = excluded.is_kit`,
      [
        input.id,
        storedSlug,
        input.name,
        input.categoryId,
        status === "ativo",
        input.line,
        input.tagline,
        input.description,
        input.howToUse,
        input.categoryId,
        status,
        input.caffeineMg,
        input.proteinG,
        input.influencerId,
        input.subscriptionEnabled,
        input.subscriptionPercent,
        input.subscriptionIntervalDays,
        input.isKit,
      ],
    );

    if (renaming && previousSlug) {
      await retargetProductSlug(sql, { productId: input.id, from: previousSlug, to: input.slug });
    }

    for (const [position, flavor] of input.flavors.entries()) {
      await sql.query(
        `insert into product_flavors (id, product_id, slug, name, tagline, hex, family, limited, position)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         on conflict (id) do update set
           slug = excluded.slug, name = excluded.name, tagline = excluded.tagline, hex = excluded.hex,
           family = excluded.family, limited = excluded.limited, position = excluded.position`,
        [`${input.id}__${flavor.id}`, input.id, flavor.id, flavor.name, flavor.tagline, flavor.hex, flavor.family, flavor.limited, position],
      );
    }

    await sql.query("delete from product_variants where product_id = $1 and not (id = any($2::text[]))", [input.id, variantIds]);

    for (const [position, variant] of input.variants.entries()) {
      const id = variantIds[position];
      const written = await sql.query<{ id: string }>(
        `insert into product_variants (
           id, product_id, flavor_id, sku, size, price_cents, compare_at_cents, stock, weight_g, servings, position
         ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         on conflict (id) do update set
           flavor_id = excluded.flavor_id, sku = excluded.sku, size = excluded.size, price_cents = excluded.price_cents,
           compare_at_cents = excluded.compare_at_cents, stock = excluded.stock, weight_g = excluded.weight_g,
           servings = excluded.servings, position = excluded.position
         where product_variants.product_id = excluded.product_id
         returning id`,
        [
          id,
          input.id,
          `${input.id}__${variant.flavorId}`,
          variant.sku,
          variant.size,
          variant.priceCents,
          variant.compareAtCents,
          variant.stock,
          variant.weightGrams,
          variant.servings,
          position,
        ],
      );
      if (!written.rows.length) {
        throw new CatalogError(409, "Essa variação pertence a outro produto.", "variacao_de_outro_produto");
      }
    }

    await sql.query("delete from product_flavors where product_id = $1 and not (id = any($2::text[]))", [input.id, flavorIds]);

    await sql.query(
      `insert into product_labels (
         product_id, registration, category, serving, servings_per_container, ingredients, allergens, warnings, manufacturer
       ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       on conflict (product_id) do update set
         registration = excluded.registration, category = excluded.category, serving = excluded.serving,
         servings_per_container = excluded.servings_per_container, ingredients = excluded.ingredients,
         allergens = excluded.allergens, warnings = excluded.warnings, manufacturer = excluded.manufacturer`,
      [
        input.id,
        input.label.registration,
        input.label.category,
        input.label.serving,
        input.label.servingsPerContainer,
        input.label.ingredients,
        input.label.allergens,
        input.label.warnings,
        input.label.manufacturer,
      ],
    );

    await sql.query("delete from nutrition_rows where product_id = $1", [input.id]);
    for (const [position, row] of input.label.nutrition.entries()) {
      await sql.query(
        `insert into nutrition_rows (id, product_id, position, nutrient, amount, daily_value)
         values ($1, $2, $3, $4, $5, $6)`,
        [`${input.id}__nut__${position}`, input.id, position, row.nutrient, row.amount, row.dailyValue ?? null],
      );
    }

    const imageIds = await assignScopedIds(
      sql,
      "product_images",
      input.id,
      input.images.map((image) => image.id),
      (index) => `${input.id}__img__${index}`,
    );

    await sql.query("delete from product_images where product_id = $1", [input.id]);
    const images = input.images.map((image, index) => ({ ...image, id: imageIds[index] ?? `${input.id}__img__${index}`, position: index, isCover: image.isCover }));
    if (images.length && !images.some((image) => image.isCover)) images[0] = { ...images[0]!, isCover: true };
    for (const image of images) {
      await sql.query(
        `insert into product_images (id, product_id, flavor_id, url, alt, position, is_cover, fallback_hex)
         values ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          image.id,
          input.id,
          image.flavorId ? `${input.id}__${image.flavorId}` : null,
          image.url,
          image.alt,
          image.position,
          image.isCover,
          image.fallbackHex,
        ],
      );
    }

    await sql.query("delete from product_goals where product_id = $1", [input.id]);
    for (const goal of input.goals) {
      await sql.query("insert into product_goals (product_id, goal_id) values ($1, $2)", [input.id, goal]);
    }
    await sql.query("delete from product_badges where product_id = $1", [input.id]);
    for (const badge of input.badges) {
      await sql.query("insert into product_badges (product_id, badge) values ($1, $2)", [input.id, badge]);
    }
    await sql.query("delete from kit_items where kit_id = $1", [input.id]);
    for (const [position, item] of input.kitItems.entries()) {
      await sql.query("insert into kit_items (kit_id, product_id, quantity, position) values ($1, $2, $3, $4)", [
        input.id,
        item.productId,
        item.quantity,
        position,
      ]);
    }

    const saved = await getAdminProduct(sql, input.id);
    if (!saved) throw new CatalogError(500, "Produto não voltou depois de gravar.", "SAVE");
    const stats = await reviewStats(sql, [saved.slug]);
    const drops = await dropsByProduct(sql, [saved.id]);
    await sql.query("update products set payload = $2::jsonb where id = $1", [
      saved.id,
      JSON.stringify(toCatalogProduct(saved, stats.get(saved.slug) ?? { rating: 0, reviewCount: 0 }, drops.get(saved.id))),
    ]);
    return saved;
  });
}

export async function archiveAdminProduct(sql: SqlClient, id: string): Promise<AdminProduct> {
  const current = await getAdminProduct(sql, id);
  if (!current) throw new CatalogError(404, "Produto não encontrado.", "NOT_FOUND");
  return saveAdminProduct(sql, { ...current, status: "arquivado" });
}

function couponFrom(row: CouponRow): AdminCoupon {
  const kind = row.kind;
  const value = kind === "shipping" ? 0 : num(row.value ?? row.percent);
  return {
    id: row.code,
    code: row.code,
    label: row.label,
    kind,
    value,
    minCents: num(row.min_cents),
    startsAt: iso(row.starts_at),
    endsAt: iso(row.ends_at),
    maxUses: row.max_uses === null ? null : num(row.max_uses),
    uses: num(row.uses),
    influencerId: row.influencer_id,
    active: row.active,
  };
}

export async function listAdminCoupons(
  sql: Sql,
  query: { page: number; pageSize: number; q: string; active: string },
): Promise<{ items: AdminCoupon[]; total: number; page: number; pageSize: number }> {
  const where: string[] = [];
  const params: unknown[] = [];
  if (query.active === "true") where.push("active = true");
  if (query.active === "false") where.push("active = false");
  if (query.q) {
    params.push(ilikeContains(query.q));
    const pattern = `$${params.length}`;
    where.push(`(${ilikeMatch("code", pattern)} or ${ilikeMatch("label", pattern)})`);
  }
  const clause = where.length ? `where ${where.join(" and ")}` : "";
  const total = await sql.query<{ count: number }>(`select count(*)::int as count from coupons ${clause}`, params);
  const rows = await sql.query<CouponRow>(
    `select code, label, kind, percent, value, min_cents, starts_at, ends_at, max_uses, uses, influencer_id, active
     from coupons ${clause}
     order by code asc
     limit $${params.length + 1} offset $${params.length + 2}`,
    [...params, query.pageSize, (query.page - 1) * query.pageSize],
  );
  return {
    items: rows.rows.map(couponFrom),
    total: num(total.rows[0]?.count),
    page: query.page,
    pageSize: query.pageSize,
  };
}

export async function getAdminCoupon(sql: Sql, code: string): Promise<AdminCoupon | null> {
  const rows = await sql.query<CouponRow>(
    `select code, label, kind, percent, value, min_cents, starts_at, ends_at, max_uses, uses, influencer_id, active
     from coupons where code = $1`,
    [code],
  );
  const row = rows.rows[0];
  return row ? couponFrom(row) : null;
}

export async function saveAdminCoupon(sql: Sql, input: AdminCoupon, keepUses: boolean): Promise<AdminCoupon> {
  if (input.influencerId) {
    const influencer = await sql.query("select slug from influencers where slug = $1", [input.influencerId]);
    if (!influencer.rows.length) throw new CatalogError(400, "Influencer não encontrado.", "INFLUENCER_MISSING");
  }
  const percent = input.kind === "percent" ? input.value : null;
  try {
    await sql.query(
      `insert into coupons (code, label, kind, percent, value, min_cents, starts_at, ends_at, max_uses, uses, influencer_slug, influencer_id, active, updated_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $11, $12, now())
       on conflict (code) do update set
         label = excluded.label,
         kind = excluded.kind,
         percent = excluded.percent,
         value = excluded.value,
         min_cents = excluded.min_cents,
         starts_at = excluded.starts_at,
         ends_at = excluded.ends_at,
         max_uses = excluded.max_uses,
         uses = case when $13 then coupons.uses else excluded.uses end,
         influencer_slug = excluded.influencer_slug,
         influencer_id = excluded.influencer_id,
         active = excluded.active,
         updated_at = now()`,
      [
        input.code,
        input.label,
        input.kind,
        percent,
        input.kind === "shipping" ? null : input.value,
        input.minCents,
        input.startsAt,
        input.endsAt,
        input.maxUses,
        keepUses ? 0 : input.uses,
        input.influencerId,
        input.active,
        keepUses,
      ],
    );
  } catch (error) {
    if (pgCode(error) === "23503") throw new CatalogError(400, "Influencer não encontrado.", "INFLUENCER_MISSING");
    throw error;
  }
  const saved = await getAdminCoupon(sql, input.code);
  if (!saved) throw new CatalogError(500, "Cupom não voltou depois de gravar.", "SAVE");
  return saved;
}

export async function removeAdminCoupon(sql: Sql, code: string): Promise<{ deleted: boolean; coupon: AdminCoupon | null }> {
  const current = await getAdminCoupon(sql, code);
  if (!current) throw new CatalogError(404, "Cupom não encontrado.", "NOT_FOUND");
  if (current.uses > 0) {
    await sql.query("update coupons set active = false, updated_at = now() where code = $1", [code]);
    return { deleted: false, coupon: { ...current, active: false } };
  }
  try {
    await sql.query("delete from coupons where code = $1", [code]);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("já foi usado")) {
      await sql.query("update coupons set active = false, updated_at = now() where code = $1", [code]);
      return { deleted: false, coupon: { ...current, active: false } };
    }
    if (pgCode(error) === "23503") throw new CatalogError(409, "Este cupom está em uso e não pode ser apagado.", "COUPON_IN_USE");
    throw error;
  }
  return { deleted: true, coupon: null };
}

export interface AdvertisedCoupon {
  code: string;
  label: string;
  kind: "percent" | "shipping";
  percent: number | null;
}

/** Cupons com `public = true`. `null` se a coluna ainda não existe: a lista fecha, não vaza o restante. */
export async function listAdvertisedCoupons(sql: Sql): Promise<AdvertisedCoupon[] | null> {
  try {
    const rows = await sql.query<AdvertisedCoupon>(
      `select code, label, kind, percent
       from coupons
       where active = true and public = true
       order by code asc`,
    );
    return rows.rows.map((row) => ({
      code: row.code,
      label: row.label,
      kind: row.kind,
      percent: row.kind === "percent" ? row.percent : null,
    }));
  } catch (error) {
    const missing = pgCode(error) === "42703" || (error instanceof Error && /column ["']?public["']?/i.test(error.message));
    if (missing) return null;
    throw error;
  }
}

export async function readPublicCoupons(sql: Sql, now = new Date()): Promise<Coupon[]> {
  const rows = await sql.query<CouponRow>(
    `select code, label, kind, percent, value, min_cents, starts_at, ends_at, max_uses, uses, influencer_id, active
     from coupons where active = true order by code asc`,
  );
  return rows.rows
    .map(couponFrom)
    .filter((coupon) => couponIsOpen(coupon, now))
    .map((coupon) => ({
      code: coupon.code,
      label: coupon.label,
      kind: coupon.kind,
      ...(coupon.kind === "percent" ? { percent: coupon.value } : {}),
      ...(coupon.minCents > 0 ? { minCents: coupon.minCents } : {}),
      ...(coupon.influencerId ? { influencerSlug: coupon.influencerId } : {}),
      active: true,
    }));
}

export function couponIsOpen(coupon: AdminCoupon, now: Date): boolean {
  if (!coupon.active) return false;
  if (coupon.startsAt && new Date(coupon.startsAt).getTime() > now.getTime()) return false;
  if (coupon.endsAt && new Date(coupon.endsAt).getTime() <= now.getTime()) return false;
  if (coupon.maxUses !== null && coupon.uses >= coupon.maxUses) return false;
  return true;
}

export function couponBlockReason(coupon: AdminCoupon | null, now: Date): string | null {
  if (!coupon) return "Cupom não encontrado.";
  if (!coupon.active) return "Esse cupom não está rolando.";
  if (coupon.startsAt && new Date(coupon.startsAt).getTime() > now.getTime()) return "Esse cupom ainda não começou.";
  if (coupon.endsAt && new Date(coupon.endsAt).getTime() <= now.getTime()) return "Esse cupom não está rolando.";
  if (coupon.maxUses !== null && coupon.uses >= coupon.maxUses) return "Esse cupom esgotou.";
  return null;
}
