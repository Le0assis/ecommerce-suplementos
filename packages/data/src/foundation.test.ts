import { CATEGORIES, GOALS } from "@pulso/domain";
import { describe, expect, it } from "vitest";
import { products } from "./index";

describe("fundação do catálogo", () => {
  it("cada produto tem sabor, variante e rótulo de suplemento", () => {
    expect(products.length).toBeGreaterThanOrEqual(14);
    for (const product of products) {
      expect(product.flavors.length).toBeGreaterThan(0);
      expect(product.variants.length).toBeGreaterThan(0);
      expect(product.label.registration).toMatch(/^NI-DEMO-/);
      expect(product.label.allergens.length).toBeGreaterThan(3);
      expect(product.label.nutrition.length).toBeGreaterThan(0);
      expect(product.label.serving.length).toBeGreaterThan(0);
      expect(product.label.warnings.some((line) => line.toLowerCase().includes("não é um medicamento"))).toBe(true);
      expect(CATEGORIES.some((category) => category.id === product.category)).toBe(true);
      for (const goal of product.goals) {
        expect(GOALS.some((item) => item.id === goal)).toBe(true);
      }
      for (const flavor of product.flavors) {
        expect(product.variants.some((variant) => variant.flavorId === flavor.id)).toBe(true);
      }
    }
  });
});
