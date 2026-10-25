import { describe, expect, it } from "vitest";
import { createApp } from "./app";
import { applyPublicCors } from "./cors";

const checkout = {
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
  paymentMethod: "pix",
  acceptLgpd: true,
  acceptAge: true,
  acceptTerms: true,
};

describe("preço no servidor", () => {
  it("recalcula o Pix e o frete e recusa preço, desconto e saldo do navegador", async () => {
    const app = createApp();
    const rejected = await app.request("/v1/checkout/simulate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        lines: [{ slug: "caos-pre-treino", variant: "caos-pre-treino__limao__300", qty: 1, unitPriceCents: 1 }],
        checkout,
        pointsBalance: 99999,
        lifetimePoints: 6000,
      }),
    });
    expect(rejected.status).toBe(400);
    const points = await app.request("/v1/checkout/simulate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        lines: [{ slug: "caos-pre-treino", variant: "caos-pre-treino__limao__300", qty: 1 }],
        couponCode: "PULSO10",
        pointsToRedeem: 100000,
        checkout,
      }),
    });
    expect(points.status).toBe(422);
    expect(await points.json()).toEqual({
      error: "O saldo de pontos ainda não está no servidor.",
      code: "pontos_indisponiveis",
    });
    const ok = await app.request("/v1/checkout/simulate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        lines: [{ slug: "caos-pre-treino", variant: "caos-pre-treino__limao__300", qty: 1 }],
        couponCode: "PULSO10",
        checkout,
      }),
    });
    expect(ok.status).toBe(200);
    const body = await ok.json();
    expect(body.simulated).toBe(true);
    expect(body.quote.discountCents).toBe(1499);
    expect(body.quote.pointsUsed).toBe(0);
    expect(body.quote.pixCents).toBe(1349);
    expect(body.quote.shippingCents).toBe(1890);
    expect(body.quote.totalCents).toBe(14032);
  });
});

describe("cupons", () => {
  it("lista só o cupom público e valida o código da raspadinha", async () => {
    const app = createApp();
    const list = await app.request("/v1/coupons");
    const body = await list.json();
    const codes = body.coupons.map((coupon: { code: string }) => coupon.code);
    expect(codes).toContain("PULSO10");
    expect(codes).toContain("LUNA15");
    expect(codes).not.toContain("RASPA5");
    expect(codes).not.toContain("VENCIDO");
    const hidden = await app.request("/v1/coupons/validate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: "raspa5" }),
    });
    expect(hidden.status).toBe(200);
    expect((await hidden.json()).coupon.code).toBe("RASPA5");
  });
});

describe("origem e IP", () => {
  it("recusa origem desconhecida e, em produção, também a lista vazia", async () => {
    const app = createApp();
    const evil = await app.request("/v1/products", { headers: { origin: "https://evil.example" } });
    expect(evil.status).toBe(403);
    const local = await app.request("/v1/products", { headers: { origin: "http://127.0.0.1:43123" } });
    expect(local.status).toBe(200);
    expect(local.headers.get("access-control-allow-origin")).toBe("http://127.0.0.1:43123");
    expect(local.headers.get("access-control-allow-credentials")).toBe("true");
    const closed = applyPublicCors(
      { req: { header: () => "https://loja.example", method: "GET" }, header() {}, json: (body: unknown, status: number) => Response.json(body, { status }) } as never,
      { NODE_ENV: "production" },
    );
    expect(closed?.status).toBe(403);
  });

  it("o limite público ignora X-Forwarded-For de quem não é proxy", async () => {
    const previous = process.env.TRUSTED_PROXIES;
    delete process.env.TRUSTED_PROXIES;
    try {
      const app = createApp();
      let blocked = 0;
      for (let index = 0; index < 61; index += 1) {
        const response = await app.request("/v1/coupons/validate", {
          method: "POST",
          headers: { "content-type": "application/json", "x-forwarded-for": `198.51.100.${index}` },
          body: JSON.stringify({ code: "nao-existe" }),
        });
        if (response.status === 429) blocked += 1;
      }
      expect(blocked).toBeGreaterThan(0);
    } finally {
      if (previous === undefined) delete process.env.TRUSTED_PROXIES;
      else process.env.TRUSTED_PROXIES = previous;
    }
  });
});
