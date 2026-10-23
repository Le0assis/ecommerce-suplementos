import type { Sql } from "@pulso/db/sql";
import type { SessionClaims } from "./session";

export async function openSession(sql: Sql, jti: string, userId: string, expiresAt: Date): Promise<void> {
  await sql.query("insert into admin_sessions (jti, user_id, expires_at) values ($1, $2, $3)", [
    jti,
    userId,
    expiresAt.toISOString(),
  ]);
}

export async function sessionIsLive(sql: Sql, claims: SessionClaims, now: Date): Promise<boolean> {
  const rows = await sql.query<{ jti: string }>(
    `select jti from admin_sessions
     where jti = $1 and user_id = $2 and revoked_at is null and expires_at > $3::timestamptz`,
    [claims.jti, claims.sub, now.toISOString()],
  );
  return rows.rows.length > 0;
}

export async function revokeSession(sql: Sql, jti: string, now: Date): Promise<void> {
  await sql.query("update admin_sessions set revoked_at = $2::timestamptz where jti = $1 and revoked_at is null", [
    jti,
    now.toISOString(),
  ]);
}
