import { loadEnv } from "./env";
import { closePool, getPool } from "./pool";
import type { Sql } from "./sql";

export interface OrphanSample {
  id: string;
  value: string;
}

export interface OrphanCheck {
  table: string;
  column: string;
  count: number;
  sample: OrphanSample[];
}

export interface OrphanReport {
  checks: OrphanCheck[];
  total: number;
}

const CHECKS: Array<{ table: string; column: string; countSql: string; sampleSql: string }> = [
  {
    table: "order_lines",
    column: "variant_id",
    countSql: `select count(*)::int as count
      from order_lines ol
      where not exists (select 1 from product_variants v where v.id = ol.variant_id)`,
    sampleSql: `select ol.id, ol.variant_id as value
      from order_lines ol
      where not exists (select 1 from product_variants v where v.id = ol.variant_id)
      order by ol.id
      limit 20`,
  },
  {
    table: "order_lines",
    column: "product_slug",
    countSql: `select count(*)::int as count
      from order_lines ol
      where not exists (select 1 from products p where p.slug = ol.product_slug)`,
    sampleSql: `select ol.id, ol.product_slug as value
      from order_lines ol
      where not exists (select 1 from products p where p.slug = ol.product_slug)
      order by ol.id
      limit 20`,
  },
  {
    table: "wishlist_items",
    column: "product_slug",
    countSql: `select count(*)::int as count
      from wishlist_items w
      where not exists (select 1 from products p where p.slug = w.product_slug)`,
    sampleSql: `select w.customer_id || ':' || w.product_slug as id, w.product_slug as value
      from wishlist_items w
      where not exists (select 1 from products p where p.slug = w.product_slug)
      order by w.customer_id, w.product_slug
      limit 20`,
  },
  {
    table: "subscriptions",
    column: "product_slug",
    countSql: `select count(*)::int as count
      from subscriptions s
      where not exists (select 1 from products p where p.slug = s.product_slug)`,
    sampleSql: `select s.id, s.product_slug as value
      from subscriptions s
      where not exists (select 1 from products p where p.slug = s.product_slug)
      order by s.id
      limit 20`,
  },
  {
    table: "reviews",
    column: "product_slug",
    countSql: `select count(*)::int as count
      from reviews r
      where not exists (select 1 from products p where p.slug = r.product_slug)`,
    sampleSql: `select r.id, r.product_slug as value
      from reviews r
      where not exists (select 1 from products p where p.slug = r.product_slug)
      order by r.id
      limit 20`,
  },
];

export async function findOrphans(sql: Sql): Promise<OrphanReport> {
  const checks: OrphanCheck[] = [];
  for (const check of CHECKS) {
    const count = await sql.query<{ count: number }>(check.countSql);
    const sample = await sql.query<{ id: string; value: string }>(check.sampleSql);
    checks.push({
      table: check.table,
      column: check.column,
      count: Number(count.rows[0]?.count ?? 0),
      sample: sample.rows.map((row) => ({ id: row.id, value: row.value })),
    });
  }
  return { checks, total: checks.reduce((sum, check) => sum + check.count, 0) };
}

export function formatOrphanReport(report: OrphanReport): string {
  const lines = report.checks.map((check) => {
    const header = `${check.table}.${check.column}: ${check.count}`;
    const sample = check.sample.map((row) => `  ${row.id} ${check.column}=${row.value}`);
    return [header, ...sample].join("\n");
  });
  const tail =
    report.total === 0
      ? "Nenhum órfão. O DBA pode validar order_lines_variant_fk."
      : `${report.total} órfão(s). Nada foi apagado.`;
  return [...lines, tail].join("\n");
}

async function main(): Promise<void> {
  loadEnv();
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL ausente. O relatório não rodou e nada foi alterado.");
    process.exitCode = 2;
    return;
  }
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("begin read only");
    const report = await findOrphans({
      async query<T>(text: string, params: unknown[] = []) {
        const result = await client.query(text, params);
        return { rows: result.rows as T[] };
      },
    });
    await client.query("commit");
    console.log(formatOrphanReport(report));
    process.exitCode = report.total > 0 ? 1 : 0;
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 2;
  } finally {
    client.release();
    await closePool();
  }
}

if (process.argv[1]?.includes("audit-orphans")) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 2;
  });
}
