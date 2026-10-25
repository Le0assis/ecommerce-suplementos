import assert from "node:assert/strict";
import { test } from "vitest";
import { isEndedAdminSession } from "@/lib/admin-fetch";
import { WAITLIST_DENIED, canAccess, deniedAdminCopy, resourceForAdminPath } from "@/lib/admin-types";

test("o menu separa dono, editor e atendimento", () => {
  assert.equal(canAccess("dono", "loyalty"), true);
  assert.equal(canAccess("dono", "orders"), true);
  assert.equal(canAccess("editor", "products"), true);
  assert.equal(canAccess("editor", "posts"), true);
  assert.equal(canAccess("editor", "quiz"), true);
  assert.equal(canAccess("editor", "scratch-prizes"), true);
  assert.equal(canAccess("editor", "banners"), true);
  assert.equal(canAccess("editor", "orders"), false);
  assert.equal(canAccess("editor", "loyalty"), false);
  assert.equal(canAccess("atendimento", "orders"), true);
  assert.equal(canAccess("atendimento", "reviews"), true);
  assert.equal(canAccess("atendimento", "customers"), true);
  assert.equal(canAccess("atendimento", "products"), false);
  assert.equal(canAccess("dono", "audit"), true);
  assert.equal(canAccess("editor", "audit"), false);
  assert.equal(canAccess("atendimento", "audit"), false);
  assert.equal(resourceForAdminPath("/admin/auditoria"), "audit");
  assert.equal(canAccess("dono", "waitlist"), true);
  assert.equal(canAccess("editor", "waitlist"), false);
  assert.equal(deniedAdminCopy("editor", "waitlist"), WAITLIST_DENIED);
  assert.equal(deniedAdminCopy("editor", "orders"), "Seu papel não faz isso.");
  assert.equal(deniedAdminCopy("dono", "waitlist"), null);
  assert.equal(deniedAdminCopy("atendimento", "waitlist"), null);
  assert.equal(canAccess("atendimento", "waitlist"), true);
  assert.equal(resourceForAdminPath("/admin/lista-espera"), "waitlist");
  assert.equal(resourceForAdminPath("/admin"), null);
  assert.equal(resourceForAdminPath("/admin/pedidos/abc"), "orders");
  assert.equal(resourceForAdminPath("/admin/vitrine"), "banners");
});

test("sessão inválida ou vencida encerra o painel", () => {
  assert.equal(isEndedAdminSession("Sessão inválida ou vencida."), true);
  assert.equal(isEndedAdminSession("Sessão expirada."), true);
  assert.equal(isEndedAdminSession("Faça login para continuar."), true);
  assert.equal(isEndedAdminSession("Seu papel não faz isso."), false);
});
