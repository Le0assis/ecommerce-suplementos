import { copyFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const env = resolve(root, ".env");
const example = resolve(root, ".env.example");

if (!existsSync(env) && existsSync(example)) {
  copyFileSync(example, env);
  console.log("Criei .env a partir de .env.example. Pode editar se a porta do Postgres já estiver ocupada.");
}
