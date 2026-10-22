import { describe, expect, it } from "vitest";
import { applyCatalogPatches, filterProducts, searchProducts } from "./query";
import { getProduct, products } from "./index";

describe("catálogo", () => {
  it("tem os produtos principais e a collab da Luna", () => {
    expect(products.length).toBeGreaterThanOrEqual(12);
    expect(getProduct("caos-pre-treino")?.caffeineMg).toBe(300);
    expect(getProduct("collab-luna")?.influencerSlug).toBe("luna-vaz");
    expect(getProduct("shape-whey-isolado")?.reviewCount).toBeGreaterThan(0);
  });

  it("filtra objetivo, esconde item e acha creatina sem acento", () => {
    const cutting = filterProducts(products, { goal: "emagrecimento" });
    expect(cutting.some((product) => product.slug === "clear-whey")).toBe(true);
    const patched = applyCatalogPatches(products, { "omega-3": { hidden: true, priceCents: 1000 } });
    expect(filterProducts(patched).some((product) => product.slug === "omega-3")).toBe(false);
    expect(filterProducts(patched, { includeHidden: true }).find((product) => product.slug === "omega-3")?.variants[0]?.priceCents).toBe(1000);
    expect(searchProducts(products, "creatína").some((product) => product.slug === "base-creatina")).toBe(true);
  });
});
