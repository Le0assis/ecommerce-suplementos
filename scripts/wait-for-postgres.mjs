import { spawn } from "node:child_process";

function ready() {
  return new Promise((resolveReady) => {
    const child = spawn("docker", ["compose", "exec", "-T", "postgres", "pg_isready", "-U", "pulso", "-d", "pulso"], {
      stdio: "ignore",
      shell: process.platform === "win32",
    });
    child.on("exit", (code) => resolveReady(code === 0));
  });
}

for (let attempt = 1; attempt <= 30; attempt += 1) {
  if (await ready()) {
    console.log("Postgres respondeu.");
    process.exit(0);
  }
  console.log(`Aguardando Postgres (${attempt}/30)...`);
  await new Promise((resolveWait) => setTimeout(resolveWait, 1000));
}

console.error("Postgres não respondeu. Confere se o Docker está aberto e se a porta 5432 está livre.");
process.exit(1);
