import assert from "node:assert/strict";
import { test } from "vitest";
import { adminErrorMessage } from "@/lib/admin-fetch";
import { omitEmptyIds, resolveSlug, retainOwnedIds, uniqueSlug } from "@/lib/admin-payload";
import { safePreview } from "@/lib/admin-preview";
import { slugify } from "@/lib/admin-types";

test("slugify troca o slug inteiro e uniqueSlug não cola o nome", () => {
  assert.equal(slugify("Whey Isolado"), "whey-isolado");
  assert.equal(slugify("Caos Pré-treino"), "caos-pre-treino");
  assert.equal(uniqueSlug("Whey Isolado", []), "whey-isolado");
  assert.equal(uniqueSlug("Whey Isolado", ["whey-isolado"]), "whey-isolado-2");
  assert.equal(uniqueSlug("Whey Isolado", ["whey-isolado", "whey-isolado-2"]), "whey-isolado-3");
  assert.equal(uniqueSlug("Whey Isolado", ["whey-isolado"], "whey-isolado"), "whey-isolado");
  assert.notEqual(uniqueSlug("Whey Isolado", ["whey-isolado"]), "whey-isoladowhey-isolado");
});

test("slug repetido avisa o slug final", () => {
  const taken = ["whey-isolado"];
  const created = resolveSlug({ base: "Whey Isolado", typed: "", taken, isNew: true });
  assert.equal(created.slug, "whey-isolado-2");
  assert.equal(created.notice, "Esse slug já existe. O slug final é whey-isolado-2.");
  const typed = resolveSlug({ base: "Outro", typed: "whey-isolado", taken, isNew: true });
  assert.equal(typed.slug, "whey-isolado-2");
  assert.match(typed.notice ?? "", /whey-isolado-2/);
  const free = resolveSlug({ base: "Whey Isolado", typed: "meu-pote", taken, isNew: true });
  assert.equal(free.slug, "meu-pote");
  assert.equal(free.notice, null);
  const editing = resolveSlug({ base: "Whey Isolado", typed: "whey-isolado", taken, isNew: false, current: "whey-isolado" });
  assert.equal(editing.slug, "whey-isolado");
  assert.equal(editing.notice, null);
});

test("criar omite id vazio, inclusive nos filhos", () => {
  const body = omitEmptyIds({
    id: "",
    name: "Caos",
    flavors: [{ id: "", name: "Limão" }],
    images: [{ id: "foto-1", url: null }],
  });
  assert.equal("id" in body, false);
  assert.equal("id" in body.flavors[0], false);
  assert.equal(body.images[0]?.id, "foto-1");
});

test("a prévia da foto aceita url nula", () => {
  assert.equal(safePreview(null, "#111111"), "#111111");
  assert.equal(safePreview(undefined, "#111111"), "#111111");
  assert.equal(safePreview("", "#111111"), "#111111");
  assert.match(safePreview("https://cdn.example/a.png", "#111111"), /https:\/\/cdn\.example\/a\.png/);
  assert.equal(safePreview("javascript:alert(1)", "#111111"), "#111111");
});

test("erro de validação mostra o campo", () => {
  assert.equal(adminErrorMessage({ error: "Dados inválidos.", fields: { id: "String must contain at least 1 character(s)" } }), "id: String must contain at least 1 character(s)");
  assert.equal(adminErrorMessage({ error: "Fora do ar." }), "Fora do ar.");
  assert.equal(
    adminErrorMessage({ error: "Já existe um registro com esse identificador.", code: "variacao_de_outro_produto" }),
    "Essa variação já pertence a outro produto. Remova a linha e crie outra.",
  );
  assert.equal(
    adminErrorMessage({ error: "Já existe um registro com esse identificador.", code: "imagem_de_outro_produto" }),
    "Essa foto já pertence a outro produto. Remova a foto e envie outra.",
  );
});

test("variação e foto de outro produto não saem com o id antigo", () => {
  let n = 0;
  const rows = retainOwnedIds(
    [{ id: "var-1", sku: "PL-A" }, { id: "desta" }, { id: "" }],
    new Set(["desta"]),
    () => `novo-${++n}`,
  );
  assert.equal(rows[0]?.id, "novo-1");
  assert.equal(rows[0]?.sku, "PL-A");
  assert.equal(rows[1]?.id, "desta");
  assert.equal(rows[2]?.id, "novo-2");
  assert.equal(rows.some((row) => row.id === "var-1"), false);
});
