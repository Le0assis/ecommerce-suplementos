import { readFileSync } from "node:fs";
import { hashPassword } from "./password";
import { loadEnv } from "./env";
import { closePool, getPool } from "./pool";

const OWNER_ID = "dono";

export async function createOwner(): Promise<void> {
  if (process.argv.slice(2).length > 0) {
    throw new Error("Não passe a senha na linha de comando. Use ADMIN_OWNER_PASSWORD_FILE.");
  }
  loadEnv();
  const email = process.env.ADMIN_OWNER_EMAIL?.trim().toLowerCase();
  const name = process.env.ADMIN_OWNER_NAME?.trim() || "Dono";
  const passwordFile = process.env.ADMIN_OWNER_PASSWORD_FILE?.trim();
  if (!email || !email.includes("@")) {
    throw new Error("Defina ADMIN_OWNER_EMAIL com um e-mail da conta dono.");
  }
  if (!passwordFile) {
    throw new Error("Defina ADMIN_OWNER_PASSWORD_FILE com o caminho de um arquivo fora do repositório.");
  }
  const password = readFileSync(passwordFile, "utf8").replace(/\r?\n$/, "");
  const passwordHash = await hashPassword(password);
  const pool = getPool();
  await pool.query(
    `insert into admin_users (id, email, name, password_hash, role)
     values ($1, $2, $3, $4, 'dono')
     on conflict (id) do update set
       email = excluded.email,
       name = excluded.name,
       password_hash = excluded.password_hash,
       role = 'dono',
       active = true,
       failed_attempts = 0,
       locked_until = null,
       updated_at = now()`,
    [OWNER_ID, email, name, passwordHash],
  );
}

if (process.argv[1] && process.argv[1].includes("create-owner")) {
  createOwner()
    .then(async () => {
      console.log("Conta dono gravada.");
      await closePool();
    })
    .catch(async (error: unknown) => {
      console.error(error instanceof Error ? error.message : error);
      await closePool();
      process.exit(1);
    });
}
