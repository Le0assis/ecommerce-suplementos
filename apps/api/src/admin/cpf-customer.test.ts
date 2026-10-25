import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auth, createAdminApp, createTestDb, login } from "./harness";

describe("CPF do cliente no admin", () => {
  let db: Awaited<ReturnType<typeof createTestDb>>;
  const previous = {
    enc: process.env.CPF_ENC_KEY,
    hmac: process.env.CPF_HMAC_KEY,
    id: process.env.CPF_KEY_ID,
  };

  beforeAll(async () => {
    process.env.CPF_ENC_KEY = randomBytes(32).toString("base64");
    process.env.CPF_HMAC_KEY = randomBytes(32).toString("base64");
    process.env.CPF_KEY_ID = "local-1";
    db = await createTestDb();
  });

  afterAll(async () => {
    if (previous.enc === undefined) delete process.env.CPF_ENC_KEY;
    else process.env.CPF_ENC_KEY = previous.enc;
    if (previous.hmac === undefined) delete process.env.CPF_HMAC_KEY;
    else process.env.CPF_HMAC_KEY = previous.hmac;
    if (previous.id === undefined) delete process.env.CPF_KEY_ID;
    else process.env.CPF_KEY_ID = previous.id;
    await db.close();
  });

  it("responde só a máscara e não grava o CPF na auditoria nem na coluna em claro", async () => {
    const app = createAdminApp(db.sql);
    await db.sql.query(
      "insert into customers (id, email, name, cpf) values ('cli-cpf', 'ana@pulso.test', 'Ana', '529.982.247-25')",
    );
    const support = await login(app, "atendimento@pulso.test", "senha-atendimento", "203.0.113.61");
    const headers = auth(support.token, "203.0.113.61");
    const listed = await app.request("/v1/admin/customers/cli-cpf", { headers });
    const before = JSON.stringify(await listed.json());
    expect(before).toContain("***.***.***-25");
    expect(before).not.toContain("52998224725");
    expect(before).not.toContain("529.982.247-25");

    const saved = await app.request("/v1/admin/customers/cli-cpf", {
      method: "PATCH",
      headers,
      body: JSON.stringify({ cpf: "390.533.447-05" }),
    });
    expect(saved.status).toBe(200);
    const body = JSON.stringify(await saved.json());
    expect(body).toContain("***.***.***-05");
    expect(body).not.toContain("39053344705");
    expect(body).not.toContain("390.533.447-05");

    const row = await db.sql.query<{ cpf: string; cpf_hash: string | null; cpf_key_id: string | null; cpf_enc: Uint8Array | null }>(
      "select cpf, cpf_hash, cpf_key_id, cpf_enc from customers where id = 'cli-cpf'",
    );
    expect(row.rows[0]?.cpf).toBe("529.982.247-25");
    expect(row.rows[0]?.cpf_key_id).toBe("local-1");
    expect(row.rows[0]?.cpf_enc).toBeTruthy();
    expect(row.rows[0]?.cpf_hash).toHaveLength(64);
    const directory = JSON.stringify(await (await app.request("/v1/admin/customers", { headers })).json());
    expect(directory).toContain("***.***.***-05");
    expect(directory).not.toContain("39053344705");
    expect(directory).not.toContain("52998224725");
    expect(directory).not.toContain("529.982.247-25");
    const audit = await db.sql.query<{ after_data: unknown }>(
      "select after_data from audit_log where entity = 'customer' and entity_id = 'cli-cpf'",
    );
    const logged = JSON.stringify(audit.rows);
    expect(logged).not.toContain("39053344705");
    expect(logged).not.toContain("52998224725");
    expect(logged).toContain("***.***.***-05");
  });
});
