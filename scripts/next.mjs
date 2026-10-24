import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = resolve(root, ".env");

if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const index = trimmed.indexOf("=");
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim();
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

const mode = process.argv[2] === "start" ? "start" : "dev";
const port = process.env.WEB_PORT || "43123";
const stamp = pathToFileURL(resolve(root, "scripts/stamp-peer-ip.mjs")).href;
const options = process.env.NODE_OPTIONS ?? "";
if (!options.includes("stamp-peer-ip.mjs")) {
  process.env.NODE_OPTIONS = `${options} --import ${stamp}`.trim();
}
process.env.PULSO_STAMP_PEER = "1";
const child = spawn("pnpm", ["exec", "next", mode, "--hostname", "0.0.0.0", "--port", port], {
  cwd: resolve(root, "apps/web"),
  stdio: "inherit",
  env: process.env,
  shell: process.platform === "win32",
});

child.on("exit", (code) => process.exit(code ?? 1));
