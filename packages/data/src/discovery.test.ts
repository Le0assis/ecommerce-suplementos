import { quizResult } from "@pulso/domain";
import { describe, expect, it } from "vitest";
import { coupons } from "./coupons";
import { influencers } from "./content";
import { upcomingDrop } from "./catalog";
import { getProduct, products } from "./index";

describe("descoberta", () => {
  it("o quiz sem cafeína aponta para produtos reais e tira o pré estimulante", () => {
    const curto = quizResult({
      goal: "hipertrofia",
      days: 4,
      caffeine: "zero",
      flavor: "fruta",
      budget: "baixo",
    });
    expect(curto.productSlugs).not.toContain("caos-pre-treino");
    expect(curto.productSlugs).toContain("base-creatina");
    expect(curto.productSlugs.length).toBeLessThanOrEqual(3);

    const aberto = quizResult({
      goal: "energia",
      days: 5,
      caffeine: "zero",
      flavor: "citrica",
      budget: "alto",
    });
    expect(aberto.productSlugs).toContain("foco-pre-sem-cafeina");
    expect(aberto.productSlugs).not.toContain("caos-pre-treino");
    for (const slug of [...curto.productSlugs, ...aberto.productSlugs]) {
      expect(getProduct(slug)?.hidden).not.toBe(true);
    }
  });

  it("o kit bruto referencia produtos do catálogo", () => {
    const kit = getProduct("kit-bruto");
    expect(kit?.isKit).toBe(true);
    expect(kit?.kitItems?.length).toBeGreaterThanOrEqual(3);
    for (const item of kit?.kitItems ?? []) {
      expect(getProduct(item.productSlug)).toBeTruthy();
      expect(item.quantity).toBeGreaterThan(0);
    }
  });

  it("cada atleta tem cupom ativo", () => {
    expect(influencers.length).toBeGreaterThanOrEqual(4);
    for (const influencer of influencers) {
      const coupon = coupons.find((item) => item.code === influencer.coupon);
      expect(coupon?.active).toBe(true);
      expect(coupon?.influencerSlug).toBe(influencer.slug);
    }
  });

  it("drops e o teaser têm data legível", () => {
    const dated = products.filter((product) => product.drop && !product.drop.teaser);
    expect(dated.length).toBeGreaterThan(0);
    for (const product of dated) {
      expect(Number.isFinite(new Date(product.drop!.endsAt).getTime())).toBe(true);
      expect(product.drop!.unitsLeft).toBeGreaterThan(0);
    }
    expect(Number.isFinite(new Date(upcomingDrop.endsAt).getTime())).toBe(true);
    expect(upcomingDrop.teaser).toBe(true);
  });
});
