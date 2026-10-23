import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, test } from "vitest";
import { scarcityOf } from "@/lib/drop-view";
import { eraseDropWaitlist, joinDropWaitlist } from "@/server/drop-waitlist";
import { previewCatalogDrops } from "@/server/public-drops";

const dirs: string[] = [];
const previousWaitlist = process.env.DROP_WAITLIST_PATH;
const previousApi = process.env.API_URL;

afterEach(() => {
  if (previousWaitlist === undefined) delete process.env.DROP_WAITLIST_PATH;
  else process.env.DROP_WAITLIST_PATH = previousWaitlist;
  if (previousApi === undefined) delete process.env.API_URL;
  else process.env.API_URL = previousApi;
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

test("o catálogo usa o estoque do sabor e não inventa o lote", () => {
  const now = Date.parse("2026-10-23T12:00:00-03:00");
  const drops = previewCatalogDrops(now);
  const melancia = drops.find((drop) => drop.id === "drop-04-melancia");
  const luna = drops.find((drop) => drop.id === "drop-luna");
  const teaser = drops.find((drop) => drop.id === "drop-05");
  assert.ok(melancia && luna && teaser);
  assert.equal(melancia.unitsLeft, 14);
  assert.equal(melancia.unitsTotal, null);
  assert.equal(melancia.state, "no_ar");
  assert.equal(melancia.hex, "#ff5d73");
  assert.equal(luna.unitsLeft, 76);
  assert.equal(luna.unitsTotal, null);
  assert.equal(teaser.state, "em_breve");
  assert.equal(teaser.unitsLeft, null);
  assert.equal(scarcityOf(14, null)?.text, "Restam 14");
  assert.equal(scarcityOf(14, null)?.percent, null);
  assert.equal(scarcityOf(14, 40)?.text, "Restam 14 de 40");
  assert.equal(scarcityOf(0, 40)?.text, "Esgotado");
  assert.equal(scarcityOf(null, 10), null);
  assert.equal(scarcityOf(20, 10)?.text, "Restam 20");
  assert.equal(scarcityOf(20, 10)?.percent, null);
});

test("a lista guarda o e-mail com consentimento e a saída apaga", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "pulso-wait-"));
  dirs.push(dir);
  process.env.DROP_WAITLIST_PATH = path.join(dir, "lista.json");
  process.env.API_URL = "http://127.0.0.1:9";
  const at = "2026-10-23T12:00:00.000Z";
  const denied = await joinDropWaitlist("drop-05", { email: "lista@pulso.dev", consent: false }, at);
  assert.equal(denied.status, 400);
  const created = await joinDropWaitlist("drop-05", { email: " Lista@pulso.dev ", consent: true }, at);
  assert.equal(created.status, 201);
  assert.equal(created.body.source, "adapter");
  const again = await joinDropWaitlist("drop-05", { email: "lista@pulso.dev", consent: true }, at);
  assert.equal(again.body.already, true);
  const raw = JSON.parse(readFileSync(process.env.DROP_WAITLIST_PATH, "utf8")) as { entries: Record<string, string>[] };
  assert.equal(raw.entries.length, 1);
  assert.deepEqual(Object.keys(raw.entries[0] ?? {}).sort(), ["consentAt", "consentOrigin", "dropId", "email"]);
  assert.equal(raw.entries[0]?.email, "lista@pulso.dev");
  assert.equal(raw.entries[0]?.consentOrigin, "pagina_drops:v1");
  const erased = await eraseDropWaitlist({ email: "lista@pulso.dev" });
  assert.equal(erased.body.removed, 1);
  const after = JSON.parse(readFileSync(process.env.DROP_WAITLIST_PATH, "utf8")) as { entries: unknown[] };
  assert.equal(after.entries.length, 0);
});
