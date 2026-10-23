import type { SqlClient } from "@pulso/db/sql";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../app";
import { auth, createAdminApp, createTestDb, login, resetTables, sampleProduct } from "./harness";

let sql: SqlClient;
let close: () => Promise<void>;

beforeAll(async () => {
  const db = await createTestDb();
  sql = db.sql;
  close = db.close;
});

afterAll(async () => {
  await close();
});

beforeEach(async () => {
  await resetTables(sql);
});

describe("drops e lista de espera", () => {
  it("arquiva o drop, trava o estoque do sabor e não inventa unidades", async () => {
    const app = createAdminApp(sql);
    const editor = await login(app, "editor@pulso.test", "senha-editor-pulso", "203.0.113.70");
    const headers = auth(editor.token, "203.0.113.70");
    const support = await login(app, "atendimento@pulso.test", "senha-atendimento", "203.0.113.71");
    expect((await app.request("/v1/admin/drops", { method: "POST", headers: auth(support.token, "203.0.113.71"), body: JSON.stringify({ edition: "Não" }) })).status).toBe(403);

    const created = await app.request("/v1/admin/products", { method: "POST", headers, body: JSON.stringify(sampleProduct()) });
    expect(created.status).toBe(201);

    const tooSmall = await app.request("/v1/admin/drops", {
      method: "POST",
      headers,
      body: JSON.stringify({ edition: "Lote curto", productId: "caos-teste", flavorId: "limao", unitsTotal: 4, unitsLeft: 1 }),
    });
    expect(tooSmall.status).toBe(400);

    const open = await app.request("/v1/admin/drops", {
      method: "POST",
      headers,
      body: JSON.stringify({
        edition: "Drop teste",
        name: "Limão",
        productId: "caos-teste",
        flavorId: "limao",
        unitsTotal: 20,
        unitsLeft: 1,
        teaser: "Chegando",
        status: "no_ar",
      }),
    });
    expect(open.status).toBe(201);
    const item = (await open.json()).item as { id: string; flavorId: string | null; unitsLeft: number | null; unitsTotal: number | null };
    expect(item.flavorId).toBe("limao");
    expect(item.unitsLeft).toBe(10);
    expect(item.unitsTotal).toBe(20);
    const storedFlavor = await sql.query<{ flavor_id: string }>("select flavor_id from drops where id = $1", [item.id]);
    expect(storedFlavor.rows[0]?.flavor_id).toBe("caos-teste__limao");

    const unknown = await app.request("/v1/admin/drops", {
      method: "POST",
      headers,
      body: JSON.stringify({ edition: "Sem número", unitsLeft: null, unitsTotal: null, status: "em_breve" }),
    });
    expect(unknown.status).toBe(201);
    const teaser = (await unknown.json()).item as { id: string; unitsLeft: number | null; unitsTotal: number | null };
    expect(teaser.unitsLeft).toBeNull();
    expect(teaser.unitsTotal).toBeNull();

    const soldOut = await app.request("/v1/admin/drops", {
      method: "POST",
      headers,
      body: JSON.stringify({ edition: "Esgotado", unitsLeft: 0, unitsTotal: 8, status: "no_ar" }),
    });
    expect(soldOut.status).toBe(201);
    const sold = (await soldOut.json()).item as { id: string };

    const over = await app.request("/v1/admin/drops", {
      method: "POST",
      headers,
      body: JSON.stringify({ edition: "Passou", unitsLeft: 5, unitsTotal: 4 }),
    });
    expect(over.status).toBe(400);

    const archived = await app.request(`/v1/admin/drops/${item.id}`, { method: "DELETE", headers });
    expect(archived.status).toBe(200);
    expect((await archived.json()).item.status).toBe("encerrado");
    const still = await sql.query<{ status: string }>("select status from drops where id = $1", [item.id]);
    expect(still.rows).toHaveLength(1);
    expect(still.rows[0]?.status).toBe("encerrado");

    const audit = await sql.query<{ action: string }>("select action from audit_log where entity = 'drop' order by action");
    expect(audit.rows.map((row) => row.action)).toEqual(["drop.archive", "drop.save", "drop.save", "drop.save"]);

    const pub = await app.request("/v1/drops");
    const body = (await pub.json()) as { drops: { id: string; unitsLeft: number | null; unitsTotal: number | null; state: string }[] };
    const teaserPublic = body.drops.find((drop) => drop.id === teaser.id);
    const soldPublic = body.drops.find((drop) => drop.id === sold.id);
    expect(teaserPublic?.unitsLeft).toBeNull();
    expect(teaserPublic?.unitsTotal).toBeNull();
    expect(teaserPublic?.state).not.toBe("esgotado");
    expect(soldPublic?.state).toBe("esgotado");
    expect(JSON.stringify(body)).not.toContain("@");
  });

  it("exige consentimento, deduplica o e-mail e apaga ou anonimiza sem vazar a lista", async () => {
    const app = createAdminApp(sql);
    const editor = await login(app, "editor@pulso.test", "senha-editor-pulso", "203.0.113.72");
    const headers = auth(editor.token, "203.0.113.72");
    const created = await app.request("/v1/admin/drops", {
      method: "POST",
      headers,
      body: JSON.stringify({ id: "drop-espera", edition: "Espera", status: "em_breve" }),
    });
    expect(created.status).toBe(201);

    const refused = await app.request("/v1/drops/drop-espera/waitlist", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.73" },
      body: JSON.stringify({ email: "ana@pulso.test", consent: false }),
    });
    expect(refused.status).toBe(400);
    const empty = await sql.query("select id from drop_waitlist");
    expect(empty.rows).toHaveLength(0);

    const joined = await app.request("/v1/drops/drop-espera/waitlist", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.73" },
      body: JSON.stringify({ email: "Ana@Pulso.Test", consent: true }),
    });
    expect(joined.status).toBe(200);
    expect(await joined.json()).toEqual({ ok: true });
    const again = await app.request("/v1/drops/drop-espera/waitlist", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.74" },
      body: JSON.stringify({ email: "ana@pulso.test", consent: true, consentOrigin: "pagina_drops:v1" }),
    });
    expect(again.status).toBe(200);
    expect(await again.json()).toEqual({ ok: true });
    const rows = await sql.query<{ email: string }>("select email from drop_waitlist");
    expect(rows.rows).toEqual([{ email: "ana@pulso.test" }]);

    const list = await app.request("/v1/admin/drops/drop-espera/waitlist", { headers });
    expect((await list.json()).items[0].email).toBe("ana@pulso.test");
    const pub = await app.request("/v1/drops");
    const pubBody = (await pub.json()) as { drops: { id: string; waitlistCount: number }[] };
    expect(JSON.stringify(pubBody)).not.toContain("ana@pulso.test");
    expect(pubBody.drops.find((drop) => drop.id === "drop-espera")?.waitlistCount).toBe(1);

    const hidden = await app.request("/v1/admin/drops/waitlist/anonymize", {
      method: "POST",
      headers,
      body: JSON.stringify({ email: "ana@pulso.test" }),
    });
    expect(hidden.status).toBe(200);
    const tomb = await sql.query<{ email: string; anonymized_at: string | null }>("select email, anonymized_at from drop_waitlist");
    expect(tomb.rows[0]?.email).toMatch(/^anon\+.+@apagado\.invalid$/);
    expect(tomb.rows[0]?.anonymized_at).toBeTruthy();
    const counted = await app.request("/v1/drops");
    const countedBody = (await counted.json()) as { drops: { id: string; waitlistCount: number }[] };
    expect(countedBody.drops.find((drop) => drop.id === "drop-espera")?.waitlistCount).toBe(0);
    expect(JSON.stringify(countedBody)).not.toContain("ana@pulso.test");
    const audit = await sql.query<{ after_data: { removed: number } | string }>(
      "select after_data from audit_log where action = 'waitlist.anonymize'",
    );
    expect(JSON.stringify(audit.rows[0]?.after_data)).not.toContain("ana@pulso.test");

    const erased = await app.request("/v1/drops/waitlist/erase", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.75" },
      body: JSON.stringify({ email: "ana@pulso.test" }),
    });
    expect(erased.status).toBe(410);
    expect(await erased.json()).toEqual({ error: "A saída da lista é só pelo atendimento." });
    const kept = await sql.query("select id from drop_waitlist");
    expect(kept.rows).toHaveLength(1);

    await app.request("/v1/drops/drop-espera/waitlist", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.76" },
      body: JSON.stringify({ email: "bia@pulso.test", consent: true }),
    });
    const ignored = await app.request("/v1/drops/waitlist/erase", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.77" },
      body: JSON.stringify({ email: "bia@pulso.test" }),
    });
    expect(ignored.status).toBe(410);
    expect((await sql.query("select email from drop_waitlist where anonymized_at is null")).rows).toHaveLength(1);
    const listed = await app.request("/v1/admin/drops/drop-espera/waitlist", { headers });
    const entry = ((await listed.json()) as { items: { id: string; email: string }[] }).items.find((item) => item.email === "bia@pulso.test");
    expect(entry?.id).toBeTruthy();
    const editorErase = await app.request(`/v1/admin/drops/waitlist/${entry?.id}`, { method: "DELETE", headers });
    expect(editorErase.status).toBe(403);
    expect((await sql.query("select email from drop_waitlist where email = 'bia@pulso.test'")).rows).toHaveLength(1);
    const support = await login(app, "atendimento@pulso.test", "senha-atendimento", "203.0.113.80");
    const supportHeaders = auth(support.token, "203.0.113.80");
    const missing = await app.request("/v1/admin/drops/waitlist/nao-existe", { method: "DELETE", headers: supportHeaders });
    expect(missing.status).toBe(404);
    const gone = await app.request(`/v1/admin/drops/waitlist/${entry?.id}`, { method: "DELETE", headers: supportHeaders });
    expect(gone.status).toBe(200);
    expect(await gone.json()).toEqual({ ok: true, id: entry?.id });
    expect((await sql.query("select email from drop_waitlist where email = 'bia@pulso.test'")).rows).toHaveLength(0);
    const eraseAudit = await sql.query<{ entity_id: string; before_data: unknown; after_data: unknown }>(
      "select entity_id, before_data, after_data from audit_log where action = 'waitlist.erase' and entity_id = $1",
      [entry?.id],
    );
    expect(eraseAudit.rows).toHaveLength(1);
    expect(JSON.stringify(eraseAudit.rows[0])).not.toContain("bia@pulso.test");
    expect(eraseAudit.rows[0]?.before_data).toMatchObject({ id: entry?.id, dropId: "drop-espera" });
    const owner = await login(app, "dono@pulso.test", "senha-dona-pulso", "203.0.113.81");
    await app.request("/v1/drops/drop-espera/waitlist", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.82" },
      body: JSON.stringify({ email: "caio@pulso.test", consent: true }),
    });
    const byEmail = await app.request("/v1/admin/drops/waitlist/erase", {
      method: "POST",
      headers: auth(owner.token, "203.0.113.81"),
      body: JSON.stringify({ email: "caio@pulso.test" }),
    });
    expect(byEmail.status).toBe(200);
    expect((await byEmail.json()).removed).toBe(1);
    const left = await sql.query<{ email: string }>("select email from drop_waitlist");
    expect(left.rows).toHaveLength(1);

    const closed = await app.request("/v1/drops/drop-04/waitlist", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.78" },
      body: JSON.stringify({ email: "bia@pulso.test", consent: true }),
    });
    expect(closed.status).toBe(404);
  });

  it("no mock não completa unitsTotal nem trata nulo como esgotado", async () => {
    const bare = createApp();
    const response = await bare.request("/v1/drops");
    const body = (await response.json()) as { source: string; drops: { id: string; unitsLeft: number | null; unitsTotal: number | null; state: string; waitlistCount: number }[] };
    expect(body.source).toBe("mock");
    const teaser = body.drops.find((drop) => drop.id === "drop-05");
    expect(teaser?.unitsLeft).toBeNull();
    expect(teaser?.unitsTotal).toBeNull();
    expect(teaser?.state).not.toBe("esgotado");
    expect(teaser?.waitlistCount).toBe(0);
    const live = body.drops.find((drop) => drop.id === "drop-04-melancia");
    expect(live?.unitsTotal).toBeNull();
    expect(live?.unitsLeft).toBe(14);
    expect(live?.waitlistCount).toBe(0);
    const luna = body.drops.find((drop) => drop.id === "drop-luna");
    expect(luna?.unitsLeft).toBe(76);
    const offline = await bare.request("/v1/drops/drop-05/waitlist", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.79" },
      body: JSON.stringify({ email: "ana@pulso.test", consent: true }),
    });
    expect(offline.status).toBe(503);
  });
});
