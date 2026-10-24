import assert from "node:assert/strict";
import { test } from "vitest";
import { demoUser } from "./demo";
import { mergePersistedStore, persistedStoreSlice } from "./store-persist";
import { usePulso } from "./store";

const CPF = "52998224725";
const OTHER_CPF = "39053344705";

test("a chave pulso-store não leva conta, sessão, pedido nem CPF", () => {
  const state = usePulso.getState();
  const slice = usePulso.persist.getOptions().partialize?.({
    ...state,
    currentUserId: demoUser.id,
    guestOrders: [{ ...demoUser.orders[0], code: "PLGUEST", cpf: OTHER_CPF }],
  });
  const raw = JSON.stringify(slice);
  assert.equal(raw.includes(CPF), false);
  assert.equal(raw.includes(OTHER_CPF), false);
  assert.equal(raw.includes(demoUser.password), false);
  assert.equal(raw.includes("PLDEMOANA"), false);
  assert.equal(raw.includes("PLGUEST"), false);
  assert.equal(raw.includes(demoUser.id), false);
  assert.equal("users" in (slice as object), false);
  assert.equal("guestOrders" in (slice as object), false);
  assert.equal("currentUserId" in (slice as object), false);
  assert.deepEqual(slice, persistedStoreSlice(state));
});

test("um blob antigo com CPF e pedido não volta no merge", () => {
  const current = usePulso.getState();
  const merged = mergePersistedStore(
    {
      users: [{ id: "x", email: "x@pulso.test", password: "segredo-local", cpf: OTHER_CPF, orders: [] }],
      currentUserId: "x",
      guestOrders: [{ code: "PLGUEST", cpf: OTHER_CPF }],
      password: "segredo-local",
      cpf: OTHER_CPF,
      cart: [{ lineId: "1", productSlug: "caos-pre-treino", quantity: 2 }],
      couponCode: "PULSO10",
    },
    current,
  );
  assert.equal(merged.currentUserId, null);
  assert.deepEqual(merged.guestOrders, []);
  assert.equal(merged.users.some((user) => user.email === "x@pulso.test"), false);
  assert.equal(merged.users.some((user) => user.email === demoUser.email), true);
  assert.equal(JSON.stringify(merged.users).includes(OTHER_CPF), false);
  assert.equal(JSON.stringify(merged.users).includes("segredo-local"), false);
  assert.equal(merged.couponCode, "PULSO10");
  assert.equal(merged.cart[0]?.productSlug, "caos-pre-treino");
  assert.equal(merged.hydrated, true);
});
