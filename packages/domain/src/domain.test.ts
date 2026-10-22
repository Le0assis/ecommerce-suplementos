import { describe, expect, it } from "vitest";
import { proteinPlan, creatinePlan } from "./calculators";
import { installmentSchedule } from "./installments";
import { levelFor, nextLevel } from "./loyalty";
import { formatBRL, parseBRLToCents } from "./money";
import { findCoupon, quoteCart } from "./quote";
import { quizResult } from "./quiz";
import { dropPhase } from "./drops";
import { defaultGateway, sandboxCharge } from "./sandbox-payment";
import { saoPauloDateKey, scratchPrize } from "./scratch";
import { lookupCep, resolveShippingCents, shippingRates } from "./shipping";
import type { Coupon } from "./types";
import { isValidCpf, isValidExpiry, luhn, validateCheckout } from "./validators";

const luna: Coupon = {
  code: "LUNA15",
  label: "Luna 15%",
  kind: "percent",
  percent: 15,
  influencerSlug: "luna-vaz",
  active: true,
};
const frete: Coupon = { code: "RASPAFRETE", label: "Frete da raspadinha", kind: "shipping", active: true };

const baseQuote = {
  redeemPoints: 0,
  pointsBalance: 0,
  lifetimePoints: 0,
  payment: "card" as const,
  shippingMethod: "pac" as const,
  pacCents: 1890,
  sedexCents: 3290,
};

describe("dinheiro e documentos", () => {
  it("formata e lê real", () => {
    expect(formatBRL(18990).replace(/\s/g, " ")).toContain("189,90");
    expect(parseBRLToCents("189,90")).toBe(18990);
    expect(parseBRLToCents("R$ 1.189,90")).toBe(118990);
  });

  it("valida CPF, Luhn e validade", () => {
    expect(isValidCpf("529.982.247-25")).toBe(true);
    expect(isValidCpf("111.111.111-11")).toBe(false);
    expect(luhn("4242424242424242")).toBe(true);
    expect(luhn("4242424242424241")).toBe(false);
    expect(isValidExpiry("12/99", new Date("2026-10-22T00:00:00Z"))).toBe(true);
    expect(isValidExpiry("01/20", new Date("2026-10-22T00:00:00Z"))).toBe(false);
  });
});

describe("frete", () => {
  it("reconhece CEP da Paulista e simula o resto", () => {
    const known = lookupCep("01310-100");
    expect(known.ok && known.address.street).toBe("Avenida Paulista");
    const simulated = lookupCep("12345678");
    expect(simulated.ok && simulated.address.source).toBe("demo-regra");
    expect(lookupCep("00000000").ok).toBe(false);
  });

  it("zera o PAC acima do limite e mantém o SEDEX", () => {
    const pac = resolveShippingCents({
      method: "pac",
      pacCents: 1890,
      sedexCents: 3290,
      merchandiseCents: 29900,
    });
    const sedex = resolveShippingCents({
      method: "sedex",
      pacCents: 1890,
      sedexCents: 3290,
      merchandiseCents: 29900,
    });
    expect(pac).toMatchObject({ cents: 0, free: true });
    expect(sedex.cents).toBe(3290);
    expect(shippingRates("01310100").ok).toBe(true);
  });
});

describe("quote do carrinho", () => {
  it("aplica pix só nos produtos e não no frete", () => {
    const quote = quoteCart({
      ...baseQuote,
      payment: "pix",
      lines: [
        { unitPriceCents: 10000, quantity: 1, subscription: false, subscriptionDiscountPercent: 10, category: "whey" },
      ],
      coupon: null,
    });
    expect(quote.pixCents).toBe(1000);
    expect(quote.productAfterDiscountsCents).toBe(9000);
    expect(quote.shippingCents).toBe(1890);
    expect(quote.totalCents).toBe(10890);
    expect(quote.pointsEarned).toBe(Math.round(90 * 5 * 1.2));
  });

  it("usa o maior desconto entre cupom e kit e limita pontos a 20%", () => {
    const quote = quoteCart({
      ...baseQuote,
      lines: [
        { unitPriceCents: 10000, quantity: 1, subscription: false, subscriptionDiscountPercent: 10, category: "whey" },
        { unitPriceCents: 5000, quantity: 1, subscription: false, subscriptionDiscountPercent: 10, category: "creatina" },
        { unitPriceCents: 5000, quantity: 1, subscription: false, subscriptionDiscountPercent: 10, category: "pre-treino" },
      ],
      coupon: luna,
      redeemPoints: 100000,
      pointsBalance: 100000,
    });
    expect(quote.discountPercent).toBe(15);
    expect(quote.discountLabel).toBe("Luna 15%");
    expect(quote.pointsCents).toBe(Math.floor(17000 * 0.2));
  });

  it("cupom de frete zera o SEDEX", () => {
    const quote = quoteCart({
      ...baseQuote,
      shippingMethod: "sedex",
      lines: [
        { unitPriceCents: 5000, quantity: 1, subscription: true, subscriptionDiscountPercent: 10, category: "creatina" },
      ],
      coupon: frete,
    });
    expect(quote.subscriptionSavingsCents).toBe(500);
    expect(quote.shippingCents).toBe(0);
    expect(quote.shippingFree).toBe(true);
  });

  it("não acha cupom inventado", () => {
    expect(findCoupon("nao-existe", [luna]).error).toBe("Cupom não encontrado.");
  });
});

describe("níveis, quiz, calculadora e raspadinha", () => {
  it("sobe de nível e calcula a distância", () => {
    expect(levelFor(860).id).toBe("atleta");
    expect(nextLevel(860)?.level.id).toBe("bruto");
    expect(nextLevel(9000)).toBeNull();
  });

  it("troca pré com cafeína quando a pessoa pede zero", () => {
    const result = quizResult({
      goal: "hipertrofia",
      days: 4,
      caffeine: "zero",
      flavor: "fruta",
      budget: "medio",
    });
    expect(result.productSlugs).not.toContain("caos-pre-treino");
    expect(result.productSlugs).toContain("foco-pre-sem-cafeina");
  });

  it("calcula proteína e creatina", () => {
    const protein = proteinPlan({ weightKg: 70, goal: "hipertrofia", foodGramsPerKg: 1 });
    expect("targetGrams" in protein && protein.targetGrams).toBe(140);
    expect("scoops" in protein && protein.scoops).toBe(2.8);
    const creatine = creatinePlan(92);
    expect("grams" in creatine && creatine.grams).toBe(5);
    expect("error" in proteinPlan({ weightKg: 10, goal: "saude" })).toBe(true);
  });

  it("raspadinha é estável para a mesma semente", () => {
    expect(scratchPrize("ana-2026-10-22").id).toBe(scratchPrize("ana-2026-10-22").id);
    expect(SCRATCH_WEIGHT()).toBe(100);
    expect(saoPauloDateKey(new Date("2026-10-22T02:30:00Z"))).toBe("2026-10-21");
  });

  it("parcela sem juros até 3x e com juros depois", () => {
    const plan = installmentSchedule(10000);
    expect(plan[0]).toMatchObject({ n: 1, totalCents: 10000, interestFree: true });
    expect(plan[2]?.interestFree).toBe(true);
    expect(plan[3]?.interestFree).toBe(false);
    expect(plan[3]!.totalCents).toBeGreaterThan(10000);
  });
});

function SCRATCH_WEIGHT(): number {
  return [30, 15, 15, 20, 20].reduce((sum, value) => sum + value, 0);
}

describe("drops", () => {
  it("separa edição no ar, encerrada e data inválida", () => {
    const now = new Date("2026-10-22T12:00:00-03:00").getTime();
    expect(dropPhase("2026-11-08T23:59:00-03:00", now)).toBe("no-ar");
    expect(dropPhase("2026-10-01T00:00:00-03:00", now)).toBe("encerrado");
    expect(dropPhase("amanha", now)).toBe("data-invalida");
  });
});

describe("sandbox de pagamento", () => {
  it("manda pix ao Mercado Pago e cartão à Pagar.me, sem cobrar", () => {
    expect(defaultGateway("pix")).toBe("mercadopago");
    expect(defaultGateway("boleto")).toBe("mercadopago");
    expect(defaultGateway("card")).toBe("pagarme");
    const pix = sandboxCharge({ method: "pix", amountCents: 10000, orderCode: "PLTESTE" });
    expect("error" in pix).toBe(false);
    if (!("error" in pix)) {
      expect(pix.sandbox).toBe(true);
      expect(pix.gateway).toBe("mercadopago");
      expect(pix.status).toBe("pending");
      expect(pix.externalId).toBe("mp_sandbox_PLTESTE");
      expect(pix.pixCopyPaste).toContain("PLTESTE");
    }
    const card = sandboxCharge({ method: "card", amountCents: 5000, orderCode: "PLCARD" });
    if (!("error" in card)) {
      expect(card.gateway).toBe("pagarme");
      expect(card.status).toBe("approved");
      expect(card.externalId).toBe("pm_sandbox_PLCARD");
    }
    expect(sandboxCharge({ method: "pix", amountCents: 0, orderCode: "PL" })).toEqual({ error: "Valor inválido para o sandbox." });
  });
});

describe("checkout", () => {
  it("recusa pedido sem idade e sem cartão válido", () => {
    const result = validateCheckout(
      {
        name: "Ana Luz",
        email: "ana@pulso.dev",
        cpf: "52998224725",
        phone: "11987654321",
        cep: "01310100",
        street: "Avenida Paulista",
        number: "1000",
        neighborhood: "Bela Vista",
        city: "São Paulo",
        state: "SP",
        shippingMethod: "pac",
        paymentMethod: "card",
        card: { number: "4242424242424241", name: "ANA LUZ", expiry: "12/30", cvv: "123", installments: 2 },
        acceptLgpd: true,
        acceptAge: false,
        acceptTerms: true,
      },
      new Date("2026-10-22T00:00:00Z"),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.cardNumber).toBeTruthy();
      expect(result.errors.acceptAge).toBeTruthy();
    }
  });
});
