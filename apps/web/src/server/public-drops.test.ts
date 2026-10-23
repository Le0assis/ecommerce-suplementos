import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, test } from "vitest";
import { scarcityOf } from "@/lib/drop-view";
import { eraseDropWaitlist, joinDropWaitlist } from "@/server/drop-waitlist";
import { assembleDrops, loadPublicDrops, previewCatalogDrops } from "@/server/public-drops";

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

test("o estoque gravado no drop vence o do sabor do catálogo", () => {
  const now = Date.parse("2026-10-23T12:00:00-03:00");
  const [drop] = assembleDrops(
    now,
    [
      {
        id: "drop-04-melancia",
        edition: "Drop 04",
        name: "Melancia",
        productId: "caos-pre-treino",
        flavorId: "melancia",
        startsAt: null,
        endsAt: "2026-11-08T23:59:00-03:00",
        unitsTotal: 40,
        unitsLeft: 3,
        teaser: "",
        heroImageUrl: null,
        story: "",
        status: "no_ar",
        trustUnits: false,
      },
    ],
    {},
    null,
  );
  assert.equal(drop?.unitsLeft, 3);
  assert.equal(drop?.unitsTotal, 40);
});

test("unitsLeft nulo da API não volta para o estoque do sabor", () => {
  const now = Date.parse("2026-10-23T12:00:00-03:00");
  const [drop] = assembleDrops(
    now,
    [
      {
        id: "drop-04-melancia",
        edition: "Drop 04",
        name: "Melancia",
        productId: "caos-pre-treino",
        flavorId: "melancia",
        startsAt: null,
        endsAt: "2026-11-08T23:59:00-03:00",
        unitsTotal: null,
        unitsLeft: null,
        teaser: "",
        heroImageUrl: null,
        story: "",
        status: "no_ar",
        trustUnits: true,
        waitlistCount: 7,
      },
    ],
    { "drop-04-melancia": 99 },
    null,
  );
  assert.equal(drop?.unitsLeft, null);
  assert.equal(drop?.waitlistCount, 7);
});

test("GET /v1/drops manda o estoque e a contagem do próprio drop", async () => {
  const previousFetch = globalThis.fetch;
  process.env.API_URL = "http://pulso.test";
  globalThis.fetch = async () => Response.json({
    source: "mock",
    drops: [
      {
        id: "drop-04-melancia",
        edition: "Drop 04",
        name: "Melancia Ácida",
        productId: "caos-pre-treino",
        flavorId: "melancia",
        endsAt: "2026-11-08T23:59:00-03:00",
        unitsLeft: 9,
        unitsTotal: null,
        status: "no_ar",
        waitlistCount: 4,
      },
      {
        id: "drop-05",
        edition: "Drop 05",
        name: "Em breve",
        unitsLeft: null,
        waitlistCount: 0,
        status: "em_breve",
      },
    ],
  });
  try {
    const drops = await loadPublicDrops(Date.parse("2026-10-23T12:00:00-03:00"));
    const melancia = drops.find((drop) => drop.id === "drop-04-melancia");
    const teaser = drops.find((drop) => drop.id === "drop-05");
    assert.equal(melancia?.unitsLeft, 9);
    assert.equal(melancia?.waitlistCount, 4);
    assert.equal(teaser?.unitsLeft, null);
    assert.equal(teaser?.waitlistCount, 0);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("a lista não grava e-mail local e a resposta não diz se já estava", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "pulso-wait-"));
  dirs.push(dir);
  const file = path.join(dir, "lista.json");
  process.env.DROP_WAITLIST_PATH = file;
  process.env.API_URL = "http://127.0.0.1:9";
  const denied = await joinDropWaitlist("drop-05", { email: "lista@pulso.dev", consent: false });
  assert.equal(denied.status, 400);
  const down = await joinDropWaitlist("drop-05", { email: " Lista@pulso.dev ", consent: true });
  assert.equal(down.status, 503);
  assert.equal("already" in down.body, false);
  assert.equal(existsSync(file), false);
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ ok: true, already: true });
  try {
    const created = await joinDropWaitlist("drop-05", { email: "lista@pulso.dev", consent: true });
    assert.equal(created.status, 200);
    assert.deepEqual(created.body, { ok: true });
    const again = await joinDropWaitlist("drop-05", { email: "lista@pulso.dev", consent: true });
    assert.deepEqual(again.body, { ok: true });
    assert.equal("already" in again.body, false);
  } finally {
    globalThis.fetch = previousFetch;
  }
  const erased = await eraseDropWaitlist({ email: "lista@pulso.dev" });
  assert.deepEqual(erased.body, { ok: true });
  assert.equal(existsSync(file), false);
  const stranger = await eraseDropWaitlist({ email: "outra@pulso.dev" });
  assert.deepEqual(stranger.body, { ok: true });
});
