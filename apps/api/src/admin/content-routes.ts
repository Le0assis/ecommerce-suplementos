import { writeAudit } from "@pulso/db/audit";
import { archiveInfluencer, archivePost, deleteAuthor, listAuthors, listInfluencers, listPosts, saveAuthor, saveInfluencer, savePost } from "@pulso/db/content";
import { randomUUID } from "node:crypto";
import type { Hono } from "hono";
import { z } from "zod";
import { guard, parseInput, readJson, requireActor, type AdminRuntime } from "./http";

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "A cor precisa ser um hex de 6 dígitos.");
const httpsOrNull = z
  .union([z.string().url().refine((value) => value.startsWith("https://"), "O link precisa ser https."), z.literal(""), z.null()])
  .optional()
  .transform((value) => (value ? value : null));

const influencerSchema = z.object({
  slug: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  name: z.string().trim().min(1).max(80),
  handle: z.string().trim().min(1).max(40),
  instagramUrl: httpsOrNull,
  city: z.string().trim().max(80).default(""),
  sport: z.string().trim().max(80).default(""),
  bio: z.string().trim().max(600).default(""),
  story: z.string().trim().max(800).default(""),
  followers: z.string().trim().max(40).default(""),
  accent: hex,
  discountPercent: z.number().int().min(0).max(30).nullable().optional().default(null),
  active: z.boolean().default(true),
  couponCode: z.string().trim().max(32).nullable().optional().default(null),
  productIds: z.array(z.string().trim().min(1)).max(20).default([]),
  quotes: z
    .array(z.object({ id: z.string().optional(), body: z.string().trim().min(1).max(240), position: z.number().int().optional() }))
    .max(8)
    .default([]),
  images: z
    .array(
      z.object({
        id: z.string().optional(),
        url: httpsOrNull,
        alt: z.string().trim().min(1, "A foto precisa de texto alternativo.").max(200),
        caption: z.string().trim().max(180).nullable().optional().default(null),
        instagramPostUrl: httpsOrNull,
        fallbackHex: z.union([hex, z.null()]).optional().default(null),
        position: z.number().int().optional(),
      }),
    )
    .max(12)
    .default([]),
});

const authorSchema = z.object({
  id: z.string().trim().min(1).max(80).optional(),
  name: z.string().trim().min(1).max(80),
  photoUrl: httpsOrNull,
  bio: z.string().trim().max(400).nullable().optional().default(null),
  influencerId: z.string().trim().min(1).nullable().optional().default(null),
});

const blockSchema = z.discriminatedUnion("type", [
  z.object({ id: z.string().optional(), type: z.literal("paragrafo"), text: z.string().trim().min(1).max(4000) }),
  z.object({ id: z.string().optional(), type: z.literal("titulo"), text: z.string().trim().min(1).max(180) }),
  z.object({
    id: z.string().optional(),
    type: z.literal("imagem"),
    url: httpsOrNull,
    alt: z.string().trim().min(1).max(200),
    caption: z.string().trim().max(180).default(""),
  }),
  z.object({
    id: z.string().optional(),
    type: z.literal("citacao_lateral"),
    text: z.string().trim().min(1).max(400),
    side: z.enum(["esquerda", "direita"]),
  }),
  z.object({ id: z.string().optional(), type: z.literal("produto"), productId: z.string().trim().min(1) }),
]);

const postSchema = z.object({
  slug: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  title: z.string().trim().min(1).max(160),
  excerpt: z.string().trim().max(240).default(""),
  category: z.string().trim().max(40).default(""),
  coverUrl: httpsOrNull,
  coverHex: z.union([hex, z.null()]).optional().default(null),
  authorId: z.string().trim().min(1).nullable().optional().default(null),
  influencerId: z.string().trim().min(1).nullable().optional().default(null),
  status: z.enum(["rascunho", "agendado", "publicado", "arquivado"]).default("rascunho"),
  publishedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional().default(null),
  readMinutes: z.number().int().positive().default(4),
  seoTitle: z.string().trim().max(160).default(""),
  seoDescription: z.string().trim().max(240).default(""),
  shareImageUrl: httpsOrNull,
  blocks: z.array(blockSchema).max(40).default([]),
});

export function mountContent(admin: Hono, runtime: () => AdminRuntime): void {
  admin.get("/influencers", async (c) => {
    const ctx = runtime();
    await requireActor(c, ctx, "influencers");
    return c.json({ items: await listInfluencers(ctx.sql, true) });
  });
  admin.post("/influencers", async (c) => {
    const ctx = runtime();
    const actor = await requireActor(c, ctx, "influencers");
    const body = parseInput(influencerSchema, await readJson(c));
    const saved = await guard(() =>
      saveInfluencer(ctx.sql, {
        ...body,
        id: body.slug,
        couponCode: body.couponCode ? body.couponCode.toUpperCase() : null,
        quotes: body.quotes.map((quote, index) => ({ id: quote.id || "", body: quote.body, position: quote.position ?? index })),
        images: body.images.map((image, index) => ({
          id: image.id || "",
          url: image.url ?? null,
          alt: image.alt,
          caption: image.caption,
          instagramPostUrl: image.instagramPostUrl ?? null,
          fallbackHex: image.fallbackHex,
          position: image.position ?? index,
        })),
      }),
    );
    await writeAudit(ctx.sql, { actorId: actor.id, action: "influencer.save", entity: "influencer", entityId: saved.slug, after: saved });
    return c.json({ item: saved }, 201);
  });
  admin.delete("/influencers/:slug", async (c) => {
    const ctx = runtime();
    const actor = await requireActor(c, ctx, "influencers");
    const saved = await guard(() => archiveInfluencer(ctx.sql, c.req.param("slug")));
    await writeAudit(ctx.sql, { actorId: actor.id, action: "influencer.archive", entity: "influencer", entityId: saved.slug, after: saved });
    return c.json({ item: saved, archived: true });
  });

  admin.get("/authors", async (c) => {
    const ctx = runtime();
    await requireActor(c, ctx, "authors");
    return c.json({ items: await listAuthors(ctx.sql) });
  });
  admin.post("/authors", async (c) => {
    const ctx = runtime();
    const actor = await requireActor(c, ctx, "authors");
    const body = parseInput(authorSchema, await readJson(c));
    const saved = await guard(() => saveAuthor(ctx.sql, { ...body, id: body.id || randomUUID() }));
    await writeAudit(ctx.sql, { actorId: actor.id, action: "author.save", entity: "author", entityId: saved.id, after: saved });
    return c.json({ item: saved }, 201);
  });
  admin.delete("/authors/:id", async (c) => {
    const ctx = runtime();
    const actor = await requireActor(c, ctx, "authors");
    const id = c.req.param("id");
    await guard(() => deleteAuthor(ctx.sql, id));
    await writeAudit(ctx.sql, { actorId: actor.id, action: "author.delete", entity: "author", entityId: id, after: { deleted: true } });
    return c.json({ ok: true });
  });

  admin.get("/posts", async (c) => {
    const ctx = runtime();
    await requireActor(c, ctx, "posts");
    return c.json({ items: await listPosts(ctx.sql, c.req.query("influencer") || undefined) });
  });
  admin.post("/posts", async (c) => {
    const ctx = runtime();
    const actor = await requireActor(c, ctx, "posts");
    const body = parseInput(postSchema, await readJson(c));
    const authors = await listAuthors(ctx.sql);
    const authorName = authors.find((author) => author.id === body.authorId)?.name ?? "Redação PULSO";
    const saved = await guard(() =>
      savePost(
        ctx.sql,
        {
          ...body,
          id: body.slug,
          blocks: body.blocks.map((block) => ({ ...block, id: block.id || "" })),
        },
        authorName,
      ),
    );
    await writeAudit(ctx.sql, { actorId: actor.id, action: "post.save", entity: "post", entityId: saved.slug, after: saved });
    return c.json({ item: saved }, 201);
  });
  admin.delete("/posts/:slug", async (c) => {
    const ctx = runtime();
    const actor = await requireActor(c, ctx, "posts");
    const saved = await guard(() => archivePost(ctx.sql, c.req.param("slug")));
    await writeAudit(ctx.sql, { actorId: actor.id, action: "post.archive", entity: "post", entityId: saved.slug, after: saved });
    return c.json({ item: saved, archived: true });
  });
}
