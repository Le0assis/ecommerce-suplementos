import { writeAudit } from "@pulso/db/audit";
import {
  archiveAdminProduct,
  CatalogError,
  getAdminProduct,
  listAdminProducts,
  saveAdminProduct,
  toDbStatus,
  type AdminProduct,
} from "@pulso/db/catalog";
import { randomUUID } from "node:crypto";
import type { Hono } from "hono";
import type { z } from "zod";
import { invalidateCatalogCache } from "../catalog-source";
import { HttpError, pageQuery, parseInput, raiseCatalog, readJson, requireActor, type AdminRuntime } from "./http";
import { flavorSchema, imageSchema, productSchema, variantSchema } from "./schemas";

type ProductBody = z.infer<typeof productSchema>;

function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function toStoredProduct(body: ProductBody, fallbackId?: string): AdminProduct {
  const id = body.id || fallbackId || body.slug;
  const flavors = body.flavors.map((flavor, index) => ({
    id: flavor.id || slugify(flavor.name) || `sabor-${index + 1}`,
    name: flavor.name,
    tagline: flavor.tagline,
    hex: flavor.hex,
    family: flavor.family,
    limited: flavor.limited,
    stock: flavor.stock ?? 0,
  }));
  return {
    id,
    slug: body.slug,
    name: body.name,
    line: body.line,
    tagline: body.tagline,
    description: body.description,
    howToUse: body.howToUse,
    categoryId: body.categoryId,
    goals: body.goals,
    badges: body.badges,
    status: body.status === "ativo" ? "publicado" : body.status,
    caffeineMg: body.caffeineMg,
    proteinG: body.proteinG,
    influencerId: body.influencerId,
    subscriptionEnabled: body.subscriptionEnabled,
    subscriptionPercent: body.subscriptionPercent,
    subscriptionIntervalDays: body.subscriptionIntervalDays,
    isKit: body.isKit,
    kitItems: body.kitItems,
    flavors,
    variants: body.variants.map((variant, index) => ({
      id: variant.id || `${id}__${variant.flavorId}__${index}`,
      flavorId: variant.flavorId,
      size: variant.size,
      sku: variant.sku,
      priceCents: variant.priceCents,
      compareAtCents: variant.compareAtCents ?? null,
      stock: variant.stock,
      weightGrams: variant.weightGrams,
      servings: variant.servings,
    })),
    label: body.label,
    images: body.images.map((image, index) => ({
      id: image.id || `${id}__img__${index}`,
      flavorId: image.flavorId,
      url: image.url ?? null,
      alt: image.alt,
      position: image.position ?? index,
      isCover: image.isCover,
      fallbackHex: image.fallbackHex,
    })),
    updatedAt: new Date(0).toISOString(),
  };
}

async function saveAudited(ctx: AdminRuntime, actor: { id: string; email: string }, before: AdminProduct | null, product: AdminProduct, action: string) {
  try {
    const saved = await saveAdminProduct(ctx.sql, product);
    await writeAudit(ctx.sql, {
      actorId: actor.id,
      action,
      entity: "product",
      entityId: saved.id,
      before,
      after: saved,
    });
    await invalidateCatalogCache();
    return saved;
  } catch (error) {
    raiseCatalog(error);
  }
}

export function mountProducts(admin: Hono, runtime: () => AdminRuntime): void {
  admin.get("/products", async (c) => {
    const ctx = runtime();
    await requireActor(c, ctx, "products");
    const paging = pageQuery(c, 20);
    const status = c.req.query("status") ?? "";
    try {
      if (status && status !== "ativos" && status !== "todos") toDbStatus(status);
    } catch (error) {
      raiseCatalog(error);
    }
    const result = await listAdminProducts(ctx.sql, { ...paging, status, kitsOnly: false });
    return c.json(result);
  });

  admin.post("/products", async (c) => {
    const ctx = runtime();
    const actor = await requireActor(c, ctx, "products");
    const body = parseInput(productSchema, await readJson(c));
    if (await getAdminProduct(ctx.sql, body.slug)) throw new HttpError(409, "Já existe um produto com esse slug.");
    if (body.id && body.id !== body.slug && (await getAdminProduct(ctx.sql, body.id))) {
      throw new HttpError(409, "Já existe um produto com esse id.");
    }
    const saved = await saveAudited(ctx, actor, null, toStoredProduct(body), "product.create");
    return c.json({ item: saved }, 201);
  });

  admin.get("/products/:id", async (c) => {
    const ctx = runtime();
    await requireActor(c, ctx, "products");
    const item = await getAdminProduct(ctx.sql, c.req.param("id"));
    if (!item) throw new HttpError(404, "Produto não encontrado.");
    return c.json({ item });
  });

  admin.patch("/products/:id", async (c) => {
    const ctx = runtime();
    const actor = await requireActor(c, ctx, "products");
    const current = await getAdminProduct(ctx.sql, c.req.param("id"));
    if (!current) throw new HttpError(404, "Produto não encontrado.");
    const body = parseInput(productSchema, await readJson(c));
    const saved = await saveAudited(ctx, actor, current, toStoredProduct(body, current.id), "product.update");
    return c.json({ item: saved });
  });

  admin.delete("/products/:id", async (c) => {
    const ctx = runtime();
    const actor = await requireActor(c, ctx, "products");
    const current = await getAdminProduct(ctx.sql, c.req.param("id"));
    if (!current) throw new HttpError(404, "Produto não encontrado.");
    try {
      const saved = await archiveAdminProduct(ctx.sql, current.id);
      await writeAudit(ctx.sql, {
        actorId: actor.id,
        action: "product.archive",
        entity: "product",
        entityId: saved.id,
        before: current,
        after: saved,
      });
      await invalidateCatalogCache();
      return c.json({ item: saved });
    } catch (error) {
      raiseCatalog(error);
    }
  });

  admin.post("/products/:id/duplicate", async (c) => {
    const ctx = runtime();
    const actor = await requireActor(c, ctx, "products");
    const current = await getAdminProduct(ctx.sql, c.req.param("id"));
    if (!current) throw new HttpError(404, "Produto não encontrado.");
    let slug = `${current.slug}-copia`;
    for (let n = 2; await getAdminProduct(ctx.sql, slug); n += 1) slug = `${current.slug}-copia-${n}`;
    const copy: AdminProduct = {
      ...current,
      id: slug,
      slug,
      name: `${current.name} (cópia)`,
      status: "rascunho",
      variants: current.variants.map((variant, index) => ({
        ...variant,
        id: `${slug}__${variant.flavorId}__${index}`,
        sku: `${variant.sku}-C${randomUUID().slice(0, 4)}`.toUpperCase(),
      })),
      images: current.images.map((image, index) => ({ ...image, id: `${slug}__img__${index}` })),
    };
    const saved = await saveAudited(ctx, actor, null, copy, "product.duplicate");
    return c.json({ item: saved }, 201);
  });

  admin.post("/products/:id/flavors", async (c) => {
    const ctx = runtime();
    const actor = await requireActor(c, ctx, "products");
    const current = await must(ctx, c.req.param("id"));
    const flavor = parseInput(flavorSchema, await readJson(c));
    const next = toStoredProduct(
      parseInput(productSchema, {
        ...current,
        flavors: [...current.flavors, flavor],
      }),
      current.id,
    );
    const saved = await saveAudited(ctx, actor, current, next, "product.flavor.create");
    return c.json({ item: saved }, 201);
  });

  admin.patch("/products/:id/flavors/:flavorId", async (c) => {
    const ctx = runtime();
    const actor = await requireActor(c, ctx, "products");
    const current = await must(ctx, c.req.param("id"));
    const flavorId = c.req.param("flavorId");
    if (!current.flavors.some((flavor) => flavor.id === flavorId)) throw new HttpError(404, "Sabor não encontrado.");
    const patch = parseInput(flavorSchema.partial(), await readJson(c));
    const flavors = current.flavors.map((flavor) => (flavor.id === flavorId ? { ...flavor, ...patch, id: flavor.id } : flavor));
    const next = toStoredProduct(parseInput(productSchema, { ...current, flavors }), current.id);
    const saved = await saveAudited(ctx, actor, current, next, "product.flavor.update");
    return c.json({ item: saved });
  });

  admin.delete("/products/:id/flavors/:flavorId", async (c) => {
    const ctx = runtime();
    const actor = await requireActor(c, ctx, "products");
    const current = await must(ctx, c.req.param("id"));
    const flavorId = c.req.param("flavorId");
    if (!current.flavors.some((flavor) => flavor.id === flavorId)) throw new HttpError(404, "Sabor não encontrado.");
    const next = toStoredProduct(
      parseInput(productSchema, {
        ...current,
        flavors: current.flavors.filter((flavor) => flavor.id !== flavorId),
        variants: current.variants.filter((variant) => variant.flavorId !== flavorId),
        images: current.images.map((image) => (image.flavorId === flavorId ? { ...image, flavorId: null } : image)),
      }),
      current.id,
    );
    const saved = await saveAudited(ctx, actor, current, next, "product.flavor.delete");
    return c.json({ item: saved });
  });

  admin.post("/products/:id/variants", async (c) => {
    const ctx = runtime();
    const actor = await requireActor(c, ctx, "products");
    const current = await must(ctx, c.req.param("id"));
    const variant = parseInput(variantSchema, await readJson(c));
    const next = toStoredProduct(parseInput(productSchema, { ...current, variants: [...current.variants, variant] }), current.id);
    const saved = await saveAudited(ctx, actor, current, next, "product.variant.create");
    return c.json({ item: saved }, 201);
  });

  admin.patch("/products/:id/variants/:variantId", async (c) => {
    const ctx = runtime();
    const actor = await requireActor(c, ctx, "products");
    const current = await must(ctx, c.req.param("id"));
    const variantId = c.req.param("variantId");
    if (!current.variants.some((variant) => variant.id === variantId)) throw new HttpError(404, "Variação não encontrada.");
    const patch = parseInput(variantSchema.partial(), await readJson(c));
    const variants = current.variants.map((variant) => (variant.id === variantId ? { ...variant, ...patch, id: variant.id } : variant));
    const next = toStoredProduct(parseInput(productSchema, { ...current, variants }), current.id);
    const saved = await saveAudited(ctx, actor, current, next, "product.variant.update");
    return c.json({ item: saved });
  });

  admin.delete("/products/:id/variants/:variantId", async (c) => {
    const ctx = runtime();
    const actor = await requireActor(c, ctx, "products");
    const current = await must(ctx, c.req.param("id"));
    const variantId = c.req.param("variantId");
    if (!current.variants.some((variant) => variant.id === variantId)) throw new HttpError(404, "Variação não encontrada.");
    const next = toStoredProduct(
      parseInput(productSchema, { ...current, variants: current.variants.filter((variant) => variant.id !== variantId) }),
      current.id,
    );
    const saved = await saveAudited(ctx, actor, current, next, "product.variant.delete");
    return c.json({ item: saved });
  });

  admin.post("/products/:id/images", async (c) => {
    const ctx = runtime();
    const actor = await requireActor(c, ctx, "products");
    const current = await must(ctx, c.req.param("id"));
    const image = parseInput(imageSchema, await readJson(c));
    const next = toStoredProduct(parseInput(productSchema, { ...current, images: [...current.images, image] }), current.id);
    const saved = await saveAudited(ctx, actor, current, next, "product.image.create");
    return c.json({ item: saved }, 201);
  });

  admin.delete("/products/:id/images/:imageId", async (c) => {
    const ctx = runtime();
    const actor = await requireActor(c, ctx, "products");
    const current = await must(ctx, c.req.param("id"));
    const imageId = c.req.param("imageId");
    if (!current.images.some((image) => image.id === imageId)) throw new HttpError(404, "Foto não encontrada.");
    const next = toStoredProduct(
      parseInput(productSchema, { ...current, images: current.images.filter((image) => image.id !== imageId) }),
      current.id,
    );
    const saved = await saveAudited(ctx, actor, current, next, "product.image.delete");
    return c.json({ item: saved });
  });
}

async function must(ctx: AdminRuntime, id: string): Promise<AdminProduct> {
  const current = await getAdminProduct(ctx.sql, id);
  if (!current) throw new HttpError(404, "Produto não encontrado.");
  return current;
}

void CatalogError;
