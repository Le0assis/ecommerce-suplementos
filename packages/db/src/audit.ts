import { randomUUID } from "node:crypto";
import type { Sql } from "./sql";

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
      entry.before === undefined ? null : JSON.stringify(entry.before),
      entry.after === undefined ? null : JSON.stringify(entry.after),
    ],
  );
}
