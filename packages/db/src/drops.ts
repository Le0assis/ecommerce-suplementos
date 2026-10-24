import { randomUUID } from "node:crypto";
import { CatalogError } from "./catalog";
import { ilikeContains, ilikeMatch } from "./like";
import type { Sql } from "./sql";

export type DropStatus = "em_breve" | "no_ar" | "encerrado";
export type DropState = DropStatus | "esgotado";

export interface AdminDrop {
  id: string;
  edition: string;
  name: string;
  productId: string | null;
  flavorId: string | null;
  startsAt: string | null;
  endsAt: string | null;
  unitsTotal: number | null;
  unitsLeft: number | null;
  teaser: string;
  heroImageUrl: string | null;
  story: string;
  status: DropStatus;
}

export interface PublicDrop extends AdminDrop {
  state: DropState;
  waitlistCount: number;
}

export interface WaitlistEntry {
  id: string;
  email: string;
  consentAt: string;
  consentOrigin: string;
  anonymizedAt: string | null;
  createdAt: string;
}

interface DropRow {
  id: string;
  edition: string;
  name: string | null;
  product_id: string | null;
  flavor_id: string | null;
  starts_at: Date | string | null;
  ends_at: Date | string | null;
  units_total: number | string | null;
  units_left: number | string | null;
  teaser: string | null;
  hero_image_url: string | null;
  story: string | null;
  status: DropStatus;
}

const DROP_COLUMNS = `id, edition, name, product_id, flavor_id, starts_at, ends_at, units_total, units_left, teaser, hero_image_url, story, status`;

function iso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function intOrNull(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function text(value: string | null | undefined): string {
  return value ?? "";
}

function shortFlavor(productId: string | null, flavorId: string | null): string | null {
  if (!flavorId) return null;
  const prefix = productId ? `${productId}__` : "";
  return prefix && flavorId.startsWith(prefix) ? flavorId.slice(prefix.length) : flavorId;
}

function pgCode(error: unknown): string {
  return typeof error === "object" && error && "code" in error ? String((error as { code: unknown }).code) : "";
}

export function dropState(
  drop: { status: DropStatus; startsAt: string | null; endsAt: string | null; unitsLeft: number | null },
  now: Date,
): DropState {
  if (drop.status === "encerrado") return "encerrado";
  if (drop.endsAt) {
    const end = new Date(drop.endsAt).getTime();
    if (Number.isFinite(end) && now.getTime() >= end) return "encerrado";
  }
  if (drop.unitsLeft === 0) return "esgotado";
  if (drop.status === "em_breve") return "em_breve";
  if (drop.startsAt) {
    const start = new Date(drop.startsAt).getTime();
    if (Number.isFinite(start) && now.getTime() < start) return "em_breve";
  }
  return "no_ar";
}

function toAdmin(row: DropRow): AdminDrop {
  return {
    id: row.id,
    edition: row.edition,
    name: text(row.name),
    productId: row.product_id,
    flavorId: shortFlavor(row.product_id, row.flavor_id),
    startsAt: iso(row.starts_at),
    endsAt: iso(row.ends_at),
    unitsTotal: intOrNull(row.units_total),
    unitsLeft: intOrNull(row.units_left),
    teaser: text(row.teaser),
    heroImageUrl: row.hero_image_url,
    story: text(row.story),
    status: row.status,
  };
}

function toPublic(row: DropRow, now: Date, unitsLeft: number | null, waitlistCount: number): PublicDrop {
  const item = { ...toAdmin(row), unitsLeft, waitlistCount };
  return { ...item, state: dropState(item, now) };
}

async function flavorMinStock(sql: Sql, flavorIds: string[]): Promise<Map<string, number>> {
  if (!flavorIds.length) return new Map();
  const rows = await sql.query<{ flavor_id: string; stock: number | string }>(
    `select flavor_id, coalesce(min(stock), 0)::int as stock
     from product_variants
     where flavor_id = any($1::text[])
     group by flavor_id`,
    [flavorIds],
  );
  return new Map(rows.rows.map((row) => [row.flavor_id, intOrNull(row.stock) ?? 0]));
}

async function waitlistCounts(sql: Sql, ids: string[]): Promise<Map<string, number>> {
  if (!ids.length) return new Map();
  const rows = await sql.query<{ drop_id: string; count: number | string }>(
    `select drop_id, count(*)::int as count
     from drop_waitlist
     where anonymized_at is null and drop_id = any($1::text[])
     group by drop_id`,
    [ids],
  );
  return new Map(rows.rows.map((row) => [row.drop_id, intOrNull(row.count) ?? 0]));
}

async function publishRows(sql: Sql, rows: DropRow[], now: Date): Promise<PublicDrop[]> {
  const flavorIds = rows.map((row) => row.flavor_id).filter((id): id is string => Boolean(id));
  const [stocks, counts] = await Promise.all([flavorMinStock(sql, flavorIds), waitlistCounts(sql, rows.map((row) => row.id))]);
  return rows.map((row) => {
    const fromFlavor = row.flavor_id ? stocks.get(row.flavor_id) : undefined;
    const unitsLeft = fromFlavor !== undefined ? fromFlavor : intOrNull(row.units_left);
    return toPublic(row, now, unitsLeft, counts.get(row.id) ?? 0);
  });
}

async function resolveProduct(sql: Sql, productId: string): Promise<string> {
  const found = await sql.query<{ id: string }>("select id from products where id = $1 or slug = $1 limit 1", [productId]);
  const id = found.rows[0]?.id;
  if (!id) throw new CatalogError(400, "Produto do drop não encontrado.", "PRODUCT_MISSING");
  return id;
}

async function resolveFlavor(sql: Sql, productId: string, flavorId: string): Promise<{ id: string; stock: number }> {
  const found = await sql.query<{ id: string; stock: number | string }>(
    `select f.id, coalesce(min(v.stock), 0)::int as stock
     from product_flavors f
     left join product_variants v on v.flavor_id = f.id
     where f.product_id = $1 and (f.slug = $2 or f.id = $2 or f.id = $1 || '__' || $2)
     group by f.id
     limit 1`,
    [productId, flavorId],
  );
  const row = found.rows[0];
  if (!row) throw new CatalogError(400, "Sabor do drop não encontrado.", "FLAVOR_MISSING");
  return { id: row.id, stock: intOrNull(row.stock) ?? 0 };
}

export async function getDrop(sql: Sql, id: string): Promise<AdminDrop | null> {
  const rows = await sql.query<DropRow>(`select ${DROP_COLUMNS} from drops where id = $1`, [id]);
  const row = rows.rows[0];
  return row ? toAdmin(row) : null;
}

export async function listDrops(
  sql: Sql,
  query: { page: number; pageSize: number; q: string; status?: string },
): Promise<{ items: AdminDrop[]; total: number; page: number; pageSize: number }> {
  const where: string[] = [];
  const params: unknown[] = [];
  if (query.status === "em_breve" || query.status === "no_ar" || query.status === "encerrado") {
    params.push(query.status);
    where.push(`status = $${params.length}`);
  }
  if (query.q) {
    params.push(ilikeContains(query.q));
    const pattern = `$${params.length}`;
    where.push(`(${ilikeMatch("edition", pattern)} or ${ilikeMatch("coalesce(name, '')", pattern)})`);
  }
  const clause = where.length ? `where ${where.join(" and ")}` : "";
  const total = await sql.query<{ count: number | string }>(`select count(*)::int as count from drops ${clause}`, params);
  const offset = (query.page - 1) * query.pageSize;
  const rows = await sql.query<DropRow>(
    `select ${DROP_COLUMNS} from drops ${clause}
     order by updated_at desc, edition asc
     limit $${params.length + 1} offset $${params.length + 2}`,
    [...params, query.pageSize, offset],
  );
  return {
    items: rows.rows.map(toAdmin),
    total: intOrNull(total.rows[0]?.count) ?? 0,
    page: query.page,
    pageSize: query.pageSize,
  };
}

export async function listPublicDrops(sql: Sql, now: Date): Promise<PublicDrop[]> {
  const rows = await sql.query<DropRow>(
    `select ${DROP_COLUMNS} from drops
     order by case status when 'no_ar' then 0 when 'em_breve' then 1 else 2 end, ends_at asc nulls last, edition asc`,
  );
  return publishRows(sql, rows.rows, now);
}

export async function getPublicDrop(sql: Sql, id: string, now: Date): Promise<PublicDrop | null> {
  const rows = await sql.query<DropRow>(`select ${DROP_COLUMNS} from drops where id = $1`, [id]);
  const row = rows.rows[0];
  return row ? (await publishRows(sql, [row], now))[0] ?? null : null;
}

export async function saveDrop(sql: Sql, input: AdminDrop, mode: "insert" | "update"): Promise<AdminDrop> {
  const current = await getDrop(sql, input.id);
  if (mode === "insert" && current) throw new CatalogError(409, "Já existe um drop com esse id.", "DROP_EXISTS");
  if (mode === "update" && !current) throw new CatalogError(404, "Drop não encontrado.", "NOT_FOUND");

  let productId: string | null = null;
  let flavorDbId: string | null = null;
  let unitsLeft = input.unitsLeft;
  if (input.flavorId && !input.productId) throw new CatalogError(400, "O sabor precisa de um produto.", "FLAVOR_MISSING");
  if (input.productId) productId = await resolveProduct(sql, input.productId);
  if (input.flavorId && productId) {
    const flavor = await resolveFlavor(sql, productId, input.flavorId);
    flavorDbId = flavor.id;
    unitsLeft = flavor.stock;
    if (input.unitsTotal !== null && unitsLeft > input.unitsTotal) {
      throw new CatalogError(400, "O que resta não pode passar do lote. O número sai do estoque real do sabor.", "UNITS");
    }
  } else if (input.unitsTotal !== null && unitsLeft !== null && unitsLeft > input.unitsTotal) {
    throw new CatalogError(400, "O que resta não pode passar do lote.", "UNITS");
  }

  await sql.query(
    `insert into drops (
       id, edition, name, product_id, flavor_id, starts_at, ends_at, units_total, units_left, teaser, hero_image_url, story, status, updated_at
     ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, now())
     on conflict (id) do update set
       edition = excluded.edition,
       name = excluded.name,
       product_id = excluded.product_id,
       flavor_id = excluded.flavor_id,
       starts_at = excluded.starts_at,
       ends_at = excluded.ends_at,
       units_total = excluded.units_total,
       units_left = excluded.units_left,
       teaser = excluded.teaser,
       hero_image_url = excluded.hero_image_url,
       story = excluded.story,
       status = excluded.status,
       updated_at = now()`,
    [
      input.id,
      input.edition,
      input.name || null,
      productId,
      flavorDbId,
      input.startsAt,
      input.endsAt,
      input.unitsTotal,
      unitsLeft,
      input.teaser || null,
      input.heroImageUrl,
      input.story || null,
      input.status,
    ],
  );
  const saved = await getDrop(sql, input.id);
  if (!saved) throw new CatalogError(500, "Drop não voltou depois de gravar.", "SAVE");
  return saved;
}

export async function archiveDrop(sql: Sql, id: string): Promise<AdminDrop> {
  const updated = await sql.query<{ id: string }>(
    "update drops set status = 'encerrado', updated_at = now() where id = $1 returning id",
    [id],
  );
  if (!updated.rows.length) throw new CatalogError(404, "Drop não encontrado.", "NOT_FOUND");
  const saved = await getDrop(sql, id);
  if (!saved) throw new CatalogError(404, "Drop não encontrado.", "NOT_FOUND");
  return saved;
}

export async function listWaitlist(sql: Sql, dropId: string): Promise<WaitlistEntry[]> {
  const drop = await sql.query<{ id: string }>("select id from drops where id = $1", [dropId]);
  if (!drop.rows.length) throw new CatalogError(404, "Drop não encontrado.", "NOT_FOUND");
  const rows = await sql.query<{
    id: string;
    email: string;
    consent_at: Date | string;
    consent_origin: string;
    anonymized_at: Date | string | null;
    created_at: Date | string;
  }>(
    `select id, email, consent_at, consent_origin, anonymized_at, created_at
     from drop_waitlist
     where drop_id = $1
     order by created_at desc`,
    [dropId],
  );
  return rows.rows.map((row) => ({
    id: row.id,
    email: row.email,
    consentAt: iso(row.consent_at) ?? "",
    consentOrigin: row.consent_origin,
    anonymizedAt: iso(row.anonymized_at),
    createdAt: iso(row.created_at) ?? "",
  }));
}

export async function joinWaitlist(
  sql: Sql,
  input: { dropId: string; email: string; consentOrigin: string; consentAt: string },
): Promise<{ already: boolean }> {
  const drop = await sql.query<{ status: string }>("select status from drops where id = $1", [input.dropId]);
  const status = drop.rows[0]?.status;
  if (!status) throw new CatalogError(404, "Drop não encontrado.", "NOT_FOUND");
  if (status === "encerrado") throw new CatalogError(409, "Esse drop já encerrou.", "DROP_CLOSED");
  const email = input.email.trim().toLowerCase();
  const existing = await sql.query<{ id: string }>(
    "select id from drop_waitlist where drop_id = $1 and email = $2 and anonymized_at is null",
    [input.dropId, email],
  );
  if (existing.rows.length) return { already: true };
  try {
    await sql.query(
      `insert into drop_waitlist (id, drop_id, email, consent, consent_at, consent_origin)
       values ($1, $2, $3, true, $4, $5)`,
      [randomUUID(), input.dropId, email, input.consentAt, input.consentOrigin],
    );
  } catch (error) {
    if (pgCode(error) === "23505") return { already: true };
    throw error;
  }
  return { already: false };
}

async function waitlistCount(sql: Sql, fn: "erase_drop_waitlist" | "anonymize_drop_waitlist", email: string): Promise<number> {
  const rows = await sql.query<{ removed: number | string }>(`select ${fn}($1)::int as removed`, [email]);
  return intOrNull(rows.rows[0]?.removed) ?? 0;
}

export async function eraseWaitlist(sql: Sql, email: string): Promise<number> {
  return waitlistCount(sql, "erase_drop_waitlist", email);
}

export async function eraseWaitlistEntry(sql: Sql, id: string): Promise<{ id: string; dropId: string } | null> {
  const found = await sql.query<{ id: string; drop_id: string }>("select id, drop_id from drop_waitlist where id = $1", [id]);
  const row = found.rows[0];
  if (!row) return null;
  const removed = await sql.query<{ removed: number | string }>("select erase_drop_waitlist_entry($1)::int as removed", [id]);
  if ((intOrNull(removed.rows[0]?.removed) ?? 0) < 1) return null;
  return { id: row.id, dropId: row.drop_id };
}

export async function anonymizeWaitlist(sql: Sql, email: string): Promise<number> {
  return waitlistCount(sql, "anonymize_drop_waitlist", email);
}
