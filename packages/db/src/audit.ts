import { randomUUID } from "node:crypto";
import { isValidCpf } from "@pulso/domain";
import { maskCpf } from "./cpf";
import type { Sql } from "./sql";

const SECRET_KEYS = new Set(["cpf", "cpfEnc", "cpf_enc", "cpfHash", "cpf_hash", "password", "passwordHash", "password_hash"]);

function wholeCpf(value: string): boolean {
  const trimmed = value.trim();
  if (/^\d{3}\.\d{3}\.\d{3}-\d{2}$/.test(trimmed) || /^\d{11}$/.test(trimmed)) return isValidCpf(trimmed);
  return false;
}

export function redactSecrets(value: unknown): unknown {
  if (typeof value === "string") return wholeCpf(value) ? maskCpf(value) : value;
  if (Array.isArray(value)) return value.map(redactSecrets);
  if (!value || typeof value !== "object") return value;
  const hidden: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (SECRET_KEYS.has(key)) {
      hidden[key] = typeof item === "string" ? maskCpf(item) : null;
      continue;
    }
    hidden[key] = redactSecrets(item);
  }
  return hidden;
}

export async function writeAudit(
  sql: Sql,
  entry: {
    actorId: string | null;
    action: string;
    entity: string;
    entityId: string | null;
    before?: unknown;
    after?: unknown;
  },
): Promise<void> {
  await sql.query(
    `insert into audit_log (id, actor_id, action, entity, entity_id, before_data, after_data)
     values ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb)`,
    [
      randomUUID(),
      entry.actorId,
      entry.action,
      entry.entity,
      entry.entityId,
      entry.before === undefined ? null : JSON.stringify(redactSecrets(entry.before)),
      entry.after === undefined ? null : JSON.stringify(redactSecrets(entry.after)),
    ],
  );
}
