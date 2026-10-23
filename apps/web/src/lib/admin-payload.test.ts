import assert from "node:assert/strict";
import { test } from "vitest";
import { adminErrorMessage } from "@/lib/admin-fetch";
import { omitEmptyIds, uniqueSlug } from "@/lib/admin-payload";
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
});
