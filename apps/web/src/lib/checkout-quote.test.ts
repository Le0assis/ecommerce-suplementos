import assert from "node:assert/strict";
import { test } from "vitest";
import { forwardCheckoutQuote, forwardCheckoutSimulate } from "@/server/checkout-quote";
import {
  CHECKOUT_QUOTE_SHA,
  POINTS_UNAVAILABLE_MESSAGE,
  canRedeemPoints,
  onlyQuoteFields,
  pointsUnavailableMessage,
  readServerQuote,
  rejectPointsRedeem,
  serverCheckoutActive,
  serverCheckoutPayload,
} from "@/lib/checkout-quote";

test("o payload novo leva slug, variant e qty, sem preço nem nome", () => {
  const body = serverCheckoutPayload({
    lines: [
      { productSlug: "caos-pre-treino", variantId: "caos-pre-treino__limao__30", quantity: 2.8 },
      { productSlug: "shape-whey-isolado", variantId: "shape-whey-isolado__chocolate__900", quantity: 1 },
    ],
    couponCode: " luna15 ",
    pointsToRedeem: 40,
  });
  assert.deepEqual(body, {
    lines: [
      { slug: "caos-pre-treino", variant: "caos-pre-treino__limao__30", qty: 2 },
      { slug: "shape-whey-isolado", variant: "shape-whey-isolado__chocolate__900", qty: 1 },
    ],
    couponCode: "LUNA15",
  });
  assert.equal("pointsToRedeem" in body, false);
  assert.equal("unitPriceCents" in body, false);
  assert.equal("name" in body, false);
  assert.equal(JSON.stringify(body).includes("Caos"), false);
  assert.equal(JSON.stringify(body).includes("14990"), false);
});

test("cupom vazio e zero pontos ficam de fora", () => {
  const body = serverCheckoutPayload({
    lines: [{ productSlug: "caos-pre-treino", variantId: "caos-pre-treino__limao__30", quantity: 1 }],
    couponCode: "  ",
    pointsToRedeem: 0,
  });
  assert.deepEqual(Object.keys(body), ["lines"]);
});

test("campos de dinheiro do cliente são ignorados", () => {
  const clean = onlyQuoteFields({
    lines: [{ slug: "caos-pre-treino", variant: "caos-pre-treino__limao__30", qty: 1, name: "Caos", unitPriceCents: 1 }],
    couponCode: "pulso10",
    pointsToRedeem: 400,
    totalCents: 999,
  });
  assert.deepEqual(clean, {
    lines: [{ slug: "caos-pre-treino", variant: "caos-pre-treino__limao__30", qty: 1 }],
    couponCode: "PULSO10",
  });
  assert.equal(clean !== null && "pointsToRedeem" in clean, false);
});

test("resgate só aparece com saldo positivo", () => {
  assert.equal(canRedeemPoints(0), false);
  assert.equal(canRedeemPoints(undefined), false);
  assert.equal(canRedeemPoints(null), false);
  assert.equal(canRedeemPoints(Number.NaN), false);
  assert.equal(canRedeemPoints(860), true);
});

test("o resumo do servidor traz nome, desconto e pontos", () => {
  const summary = readServerQuote({
    summary: {
      lines: [{ slug: "caos-pre-treino", variant: "caos-pre-treino__limao__30", qty: 1, name: "Caos", unitPriceCents: 14990, lineCents: 14990 }],
      discountCents: 1500,
      discountLabel: "LUNA15",
      pointsCents: 500,
      pointsUsed: 50,
      pointsEarned: 12,
      merchandiseCents: 12990,
      pixCents: 1299,
      totalCents: 11691,
    },
  });
  assert.equal(summary?.lines[0]?.name, "Caos");
  assert.equal(summary?.discountCents, 1500);
  assert.equal(summary?.pointsEarned, 12);
  assert.equal(summary?.totalCents, 11691);
  assert.equal(summary?.shippingCents, null);
});

test("pointsToRedeem acima de zero responde 422 e não vira desconto", async () => {
  const rejected = rejectPointsRedeem({
    lines: [{ slug: "caos-pre-treino", variant: "caos-pre-treino__limao__30", qty: 1 }],
    pointsToRedeem: 860,
  });
  assert.equal(rejected?.status, 422);
  assert.equal(rejected?.body.code, "pontos_indisponiveis");
  assert.equal(pointsUnavailableMessage(rejected?.body, 422), POINTS_UNAVAILABLE_MESSAGE);
  assert.equal(rejectPointsRedeem({ lines: [{ slug: "caos", variant: "v", qty: 1 }], pointsToRedeem: 0 }), null);
  const held = await forwardCheckoutQuote({
    lines: [{ slug: "caos-pre-treino", variant: "caos-pre-treino__limao__30", qty: 1 }],
    pointsToRedeem: 40,
  });
  assert.equal(held.status, 422);
  assert.equal((held.body as { code: string }).code, "pontos_indisponiveis");
  assert.equal((held.body as { error: string }).error, POINTS_UNAVAILABLE_MESSAGE);
  const simulated = await forwardCheckoutSimulate({
    lines: [{ slug: "caos-pre-treino", variant: "caos-pre-treino__limao__30", qty: 1 }],
    pointsToRedeem: 40,
  });
  assert.equal(simulated.status, 422);
  assert.equal((simulated.body as { code: string }).code, "pontos_indisponiveis");
  assert.equal((simulated.body as { error: string }).error, POINTS_UNAVAILABLE_MESSAGE);
  const open = await forwardCheckoutSimulate({
    lines: [{ slug: "caos-pre-treino", variant: "caos-pre-treino__limao__30", qty: 1 }],
  });
  assert.equal(open.status, 409);
});

test("sem o SHA do Backend o contrato atual continua e a rota não chama a API", async () => {
  assert.equal(CHECKOUT_QUOTE_SHA, "");
  assert.equal(serverCheckoutActive(), false);
  const held = await forwardCheckoutQuote({
    lines: [{ slug: "caos-pre-treino", variant: "caos-pre-treino__limao__30", qty: 1, unitPriceCents: 1 }],
  });
  assert.equal(held.status, 409);
  assert.match(String((held.body as { error: string }).error), /contrato atual/);
});
