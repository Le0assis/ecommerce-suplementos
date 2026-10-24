import { loadEnv } from "./env";
import { closePool, getPool } from "./pool";
import { loadCpfKeys, sealCpf, type CpfKeys } from "./cpf";
import type { SqlClient } from "./sql";
import { withTx } from "./sql";

export interface CpfBackfillReport {
  sealed: number;
  ready: number;
  invalid: string[];
  duplicate: string[];
}

interface CustomerCpfRow {
  id: string;
  cpf: string;
  cpf_enc: Uint8Array | null;
  cpf_key_id: string | null;
  cpf_hash: string | null;
}

function pgCode(error: unknown): string {
  return typeof error === "object" && error && "code" in error ? String((error as { code: unknown }).code) : "";
}

export async function backfillCpf(sql: SqlClient, keys: CpfKeys): Promise<CpfBackfillReport> {
  const rows = await sql.query<CustomerCpfRow>(
    `select id, cpf, cpf_enc, cpf_key_id, cpf_hash
     from customers
     where cpf is not null and btrim(cpf) <> ''
     order by id`,
  );
  const report: CpfBackfillReport = { sealed: 0, ready: 0, invalid: [], duplicate: [] };
  for (const row of rows.rows) {
    const sealed = sealCpf(row.cpf, keys);
    if (!sealed) {
      report.invalid.push(row.id);
      continue;
    }
    if (row.cpf_enc && row.cpf_key_id === keys.keyId && row.cpf_hash === sealed.cpfHash) {
      report.ready += 1;
      continue;
    }
    try {
      await withTx(sql, async () => {
        await sql.query(
          `update customers
           set cpf_enc = $2, cpf_key_id = $3, cpf_hash = $4
           where id = $1 and cpf is not distinct from $5`,
          [row.id, sealed.cpfEnc, sealed.cpfKeyId, sealed.cpfHash, row.cpf],
        );
      });
      report.sealed += 1;
    } catch (error) {
      const unique = pgCode(error) === "23505" || (error instanceof Error && error.message.includes("customers_cpf_hash_key"));
      if (!unique) throw error;
      report.duplicate.push(row.id);
    }
  }
  return report;
}

export function formatCpfBackfill(report: CpfBackfillReport): string {
  const lines = [
    `cifrados: ${report.sealed}`,
    `já prontos: ${report.ready}`,
    `inválidos: ${report.invalid.length}`,
    `repetidos: ${report.duplicate.length}`,
    "A coluna cpf em claro não foi alterada.",
  ];
  if (report.invalid.length) lines.push(`CPF inválido, sem cifrar: ${report.invalid.join(", ")}`);
  if (report.duplicate.length) lines.push(`CPF já cifrado em outro cliente: ${report.duplicate.join(", ")}`);
  return lines.join("\n");
}

async function main(): Promise<void> {
  loadEnv();
  const keys = loadCpfKeys();
  if (!keys) {
    console.error("CPF_ENC_KEY, CPF_HMAC_KEY e CPF_KEY_ID ausentes. Nada foi cifrado.");
    process.exitCode = 2;
    return;
  }
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL ausente. Nada foi cifrado.");
    process.exitCode = 2;
    return;
  }
  const pool = getPool();
  const client = await pool.connect();
  const sql: SqlClient = {
    async query<T>(text: string, params: unknown[] = []) {
      const result = await client.query(text, params);
      return { rows: result.rows as T[] };
    },
    async begin() {
      await client.query("begin");
    },
    async commit() {
      await client.query("commit");
    },
    async rollback() {
      await client.query("rollback");
    },
  };
  try {
    const report = await backfillCpf(sql, keys);
    console.log(formatCpfBackfill(report));
    process.exitCode = report.invalid.length || report.duplicate.length ? 1 : 0;
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 2;
  } finally {
    client.release();
    await closePool();
  }
}

if (process.argv[1]?.includes("backfill-cpf")) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 2;
  });
}
