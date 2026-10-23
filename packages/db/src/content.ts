import type { Influencer, Post } from "@pulso/domain";
import { CatalogError } from "./catalog";
import type { Sql } from "./sql";

function iso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function pgCode(error: unknown): string {
  return typeof error === "object" && error && "code" in error ? String((error as { code: unknown }).code) : "";
}

function num(value: unknown, fallback = 0): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export interface QuoteRow {
  id: string;
  body: string;
  position: number;
}

export interface InfluencerImageRow {
  id: string;
  url: string | null;
  alt: string;
  caption: string | null;
  instagramPostUrl: string | null;
  fallbackHex: string | null;
  position: number;
}

export interface InfluencerAdmin {
  id: string;
  slug: string;
  name: string;
  handle: string;
  instagramUrl: string | null;
  city: string;
  sport: string;
  bio: string;
  story: string;
  followers: string;
  accent: string;
  discountPercent: number | null;
  active: boolean;
  couponCode: string | null;
  productIds: string[];
  quotes: QuoteRow[];
  images: InfluencerImageRow[];
}

export interface AuthorRow {
  id: string;
  name: string;
  photoUrl: string | null;
  bio: string | null;
  influencerId: string | null;
}

export type PostBlock =
  | { id: string; type: "paragrafo"; text: string }
  | { id: string; type: "titulo"; text: string }
  | { id: string; type: "imagem"; url: string | null; alt: string; caption: string }
  | { id: string; type: "citacao_lateral"; text: string; side: "esquerda" | "direita" }
  | { id: string; type: "produto"; productId: string };

export interface PostAdmin {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  category: string;
  coverUrl: string | null;
  coverHex: string | null;
  authorId: string | null;
  influencerId: string | null;
  status: "rascunho" | "agendado" | "publicado" | "arquivado";
  publishedAt: string | null;
  readMinutes: number;
  seoTitle: string;
  seoDescription: string;
  shareImageUrl: string | null;
  blocks: PostBlock[];
}

function blockFrom(id: string, type: string, content: Record<string, unknown>): PostBlock {
  if (type === "titulo") return { id, type, text: String(content.text ?? "") };
  if (type === "imagem") {
    return {
      id,
      type,
      url: typeof content.url === "string" ? content.url : null,
      alt: String(content.alt ?? ""),
      caption: String(content.caption ?? ""),
    };
  }
  if (type === "citacao_lateral") {
    return { id, type, text: String(content.text ?? ""), side: content.side === "direita" ? "direita" : "esquerda" };
  }
  if (type === "produto") return { id, type, productId: String(content.product_id ?? content.productId ?? "") };
  return { id, type: "paragrafo", text: String(content.text ?? "") };
}

function blockContent(block: PostBlock): Record<string, unknown> {
  if (block.type === "imagem") return { url: block.url, alt: block.alt, caption: block.caption };
  if (block.type === "citacao_lateral") return { text: block.text, side: block.side };
  if (block.type === "produto") return { product_id: block.productId };
  return { text: block.text };
}

export async function listInfluencers(sql: Sql, includeInactive: boolean): Promise<InfluencerAdmin[]> {
  const rows = await sql.query<{
    slug: string;
    name: string;
    handle: string;
    coupon_code: string;
    instagram_url: string | null;
    city: string | null;
    sport: string | null;
    bio: string | null;
    story: string | null;
    followers: string | null;
    accent: string | null;
    discount_percent: number | null;
    active: boolean;
  }>(
    `select slug, name, handle, coupon_code, instagram_url, city, sport, bio, story, followers, accent, discount_percent, active
     from influencers ${includeInactive ? "" : "where active = true"} order by name asc`,
  );
  if (!rows.rows.length) return [];
  const ids = rows.rows.map((row) => row.slug);
  const [quotes, images, products] = await Promise.all([
    sql.query<{ id: string; influencer_id: string; body: string; position: number }>(
      "select id, influencer_id, body, position from influencer_quotes where influencer_id = any($1::text[]) order by position",
      [ids],
    ),
    sql.query<{
      id: string;
      influencer_id: string;
      url: string | null;
      alt: string;
      caption: string | null;
      instagram_post_url: string | null;
      fallback_hex: string | null;
      position: number;
    }>(
      `select id, influencer_id, url, alt, caption, instagram_post_url, fallback_hex, position
       from influencer_images where influencer_id = any($1::text[]) order by position`,
      [ids],
    ),
    sql.query<{ influencer_id: string; product_id: string; position: number }>(
      "select influencer_id, product_id, position from influencer_products where influencer_id = any($1::text[]) order by position",
      [ids],
    ),
  ]);
  return rows.rows.map((row) => ({
    id: row.slug,
    slug: row.slug,
    name: row.name,
    handle: row.handle,
    instagramUrl: row.instagram_url,
    city: row.city ?? "",
    sport: row.sport ?? "",
    bio: row.bio ?? "",
    story: row.story ?? "",
    followers: row.followers ?? "",
    accent: row.accent ?? "#d6ff3c",
    discountPercent: row.discount_percent === null ? null : num(row.discount_percent),
    active: row.active,
    couponCode: row.coupon_code,
    productIds: products.rows.filter((item) => item.influencer_id === row.slug).map((item) => item.product_id),
    quotes: quotes.rows
      .filter((item) => item.influencer_id === row.slug)
      .map((item) => ({ id: item.id, body: item.body, position: num(item.position) })),
    images: images.rows
      .filter((item) => item.influencer_id === row.slug)
      .map((item) => ({
        id: item.id,
        url: item.url,
        alt: item.alt,
        caption: item.caption,
        instagramPostUrl: item.instagram_post_url,
        fallbackHex: item.fallback_hex,
        position: num(item.position),
      })),
  }));
}

export async function saveInfluencer(sql: Sql, input: InfluencerAdmin): Promise<InfluencerAdmin> {
  await sql.query(
    `insert into influencers (
       slug, name, handle, coupon_code, payload, instagram_url, city, sport, bio, story, followers, accent, discount_percent, active, updated_at
     ) values ($1, $2, $3, $4, '{}'::jsonb, $5, $6, $7, $8, $9, $10, $11, $12, $13, now())
     on conflict (slug) do update set
       name = excluded.name, handle = excluded.handle, coupon_code = excluded.coupon_code,
       instagram_url = excluded.instagram_url, city = excluded.city, sport = excluded.sport, bio = excluded.bio,
       story = excluded.story, followers = excluded.followers, accent = excluded.accent,
       discount_percent = excluded.discount_percent, active = excluded.active, updated_at = now()`,
    [
      input.slug,
      input.name,
      input.handle,
      input.couponCode ?? "",
      input.instagramUrl,
      input.city,
      input.sport,
      input.bio,
      input.story,
      input.followers,
      input.accent,
      input.discountPercent,
      input.active,
    ],
  );
  await sql.query("delete from influencer_quotes where influencer_id = $1", [input.slug]);
  for (const [index, quote] of input.quotes.entries()) {
    await sql.query("insert into influencer_quotes (id, influencer_id, body, position) values ($1, $2, $3, $4)", [
      quote.id || `${input.slug}__q${index}`,
      input.slug,
      quote.body,
      index,
    ]);
  }
  await sql.query("delete from influencer_images where influencer_id = $1", [input.slug]);
  for (const [index, image] of input.images.entries()) {
    await sql.query(
      `insert into influencer_images (id, influencer_id, url, alt, caption, instagram_post_url, fallback_hex, position)
       values ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [image.id || `${input.slug}__img${index}`, input.slug, image.url, image.alt, image.caption, image.instagramPostUrl, image.fallbackHex, index],
    );
  }
  await sql.query("delete from influencer_products where influencer_id = $1", [input.slug]);
  for (const [index, productId] of input.productIds.entries()) {
    await sql.query("insert into influencer_products (influencer_id, product_id, position) values ($1, $2, $3)", [input.slug, productId, index]);
  }
  const saved = (await listInfluencers(sql, true)).find((row) => row.slug === input.slug);
  if (!saved) throw new CatalogError(500, "Influencer não voltou depois de gravar.", "SAVE");
  return saved;
}

export async function archiveInfluencer(sql: Sql, slug: string): Promise<InfluencerAdmin> {
  const current = (await listInfluencers(sql, true)).find((row) => row.slug === slug);
  if (!current) throw new CatalogError(404, "Influencer não encontrado.", "NOT_FOUND");
  return saveInfluencer(sql, { ...current, active: false });
}

export function toPublicInfluencer(row: InfluencerAdmin): Influencer & {
  story: string;
  instagramUrl: string | null;
  quotes: QuoteRow[];
  images: InfluencerImageRow[];
} {
  return {
    slug: row.slug,
    name: row.name,
    handle: row.handle,
    coupon: row.couponCode ?? "",
    discountPercent: row.discountPercent ?? 0,
    city: row.city,
    sport: row.sport,
    bio: row.bio,
    followers: row.followers,
    accent: row.accent,
    productSlugs: row.productIds,
    story: row.story,
    instagramUrl: row.instagramUrl,
    quotes: row.quotes,
    images: row.images,
  };
}

export async function listAuthors(sql: Sql): Promise<AuthorRow[]> {
  const rows = await sql.query<{ id: string; name: string; photo_url: string | null; bio: string | null; influencer_id: string | null }>(
    "select id, name, photo_url, bio, influencer_id from authors order by name asc",
  );
  return rows.rows.map((row) => ({
    id: row.id,
    name: row.name,
    photoUrl: row.photo_url,
    bio: row.bio,
    influencerId: row.influencer_id,
  }));
}

export async function saveAuthor(sql: Sql, input: AuthorRow): Promise<AuthorRow> {
  await sql.query(
    `insert into authors (id, name, photo_url, bio, influencer_id)
     values ($1, $2, $3, $4, $5)
     on conflict (id) do update set name = excluded.name, photo_url = excluded.photo_url, bio = excluded.bio, influencer_id = excluded.influencer_id`,
    [input.id, input.name, input.photoUrl, input.bio, input.influencerId],
  );
  const saved = (await listAuthors(sql)).find((row) => row.id === input.id);
  if (!saved) throw new CatalogError(500, "Autor não voltou depois de gravar.", "SAVE");
  return saved;
}

export async function deleteAuthor(sql: Sql, id: string): Promise<void> {
  try {
    const rows = await sql.query<{ id: string }>("delete from authors where id = $1 returning id", [id]);
    if (!rows.rows.length) throw new CatalogError(404, "Autor não encontrado.", "NOT_FOUND");
  } catch (error) {
    if (error instanceof CatalogError) throw error;
    if (pgCode(error) === "23503") throw new CatalogError(409, "Este autor está em uso.", "IN_USE");
    throw error;
  }
}

async function loadBlocks(sql: Sql, slugs: string[]): Promise<Map<string, PostBlock[]>> {
  const rows = await sql.query<{ id: string; post_id: string; position: number; type: string; content: Record<string, unknown> }>(
    "select id, post_id, position, type, content from post_blocks where post_id = any($1::text[]) order by position",
    [slugs],
  );
  const map = new Map<string, PostBlock[]>();
  for (const row of rows.rows) {
    const list = map.get(row.post_id) ?? [];
    list.push(blockFrom(row.id, row.type, row.content ?? {}));
    map.set(row.post_id, list);
  }
  return map;
}

export async function listPosts(sql: Sql, influencer?: string): Promise<PostAdmin[]> {
  const params: unknown[] = [];
  const where = influencer ? "where influencer_id = $1" : "";
  if (influencer) params.push(influencer);
  const rows = await sql.query<{
    slug: string;
    title: string;
    excerpt: string | null;
    category: string | null;
    cover_url: string | null;
    cover_hex: string | null;
    author_id: string | null;
    influencer_id: string | null;
    status: PostAdmin["status"];
    published_at: Date | string | null;
    read_minutes: number | null;
    seo_title: string | null;
    seo_description: string | null;
    share_image_url: string | null;
  }>(
    `select slug, title, excerpt, category, cover_url, cover_hex, author_id, influencer_id, status, published_at,
            read_minutes, seo_title, seo_description, share_image_url
     from posts ${where} order by published_at desc nulls last`,
    params,
  );
  const blocks = await loadBlocks(sql, rows.rows.map((row) => row.slug));
  return rows.rows.map((row) => ({
    id: row.slug,
    slug: row.slug,
    title: row.title,
    excerpt: row.excerpt ?? "",
    category: row.category ?? "",
    coverUrl: row.cover_url,
    coverHex: row.cover_hex,
    authorId: row.author_id,
    influencerId: row.influencer_id,
    status: row.status,
    publishedAt: iso(row.published_at)?.slice(0, 10) ?? null,
    readMinutes: num(row.read_minutes, 1),
    seoTitle: row.seo_title ?? "",
    seoDescription: row.seo_description ?? "",
    shareImageUrl: row.share_image_url,
    blocks: blocks.get(row.slug) ?? [],
  }));
}

export async function savePost(sql: Sql, input: PostAdmin, authorName: string): Promise<PostAdmin> {
  const published = input.publishedAt || null;
  await sql.query(
    `insert into posts (
       slug, title, published_at, payload, excerpt, category, cover_url, cover_hex, author_name, influencer_id,
       status, read_minutes, author_id, seo_title, seo_description, share_image_url, updated_at
     ) values (
       $1, $2, $3, '{}'::jsonb, $4, $5, $6, $7, $8, $9,
       $10, $11, $12, $13, $14, $15, now()
     )
     on conflict (slug) do update set
       title = excluded.title, published_at = excluded.published_at, excerpt = excluded.excerpt, category = excluded.category,
       cover_url = excluded.cover_url, cover_hex = excluded.cover_hex, author_name = excluded.author_name,
       influencer_id = excluded.influencer_id, status = excluded.status, read_minutes = excluded.read_minutes,
       author_id = excluded.author_id, seo_title = excluded.seo_title, seo_description = excluded.seo_description,
       share_image_url = excluded.share_image_url, updated_at = now()`,
    [
      input.slug,
      input.title,
      published,
      input.excerpt,
      input.category,
      input.coverUrl,
      input.coverHex,
      authorName,
      input.influencerId,
      input.status,
      input.readMinutes,
      input.authorId,
      input.seoTitle,
      input.seoDescription,
      input.shareImageUrl,
    ],
  );
  await sql.query("delete from post_blocks where post_id = $1", [input.slug]);
  for (const [index, block] of input.blocks.entries()) {
    await sql.query("insert into post_blocks (id, post_id, position, type, content) values ($1, $2, $3, $4, $5::jsonb)", [
      block.id || `${input.slug}__b${index}`,
      input.slug,
      index,
      block.type,
      JSON.stringify(blockContent(block)),
    ]);
  }
  const saved = (await listPosts(sql)).find((row) => row.slug === input.slug);
  if (!saved) throw new CatalogError(500, "Post não voltou depois de gravar.", "SAVE");
  return saved;
}

export async function archivePost(sql: Sql, slug: string): Promise<PostAdmin> {
  const current = (await listPosts(sql)).find((row) => row.slug === slug);
  if (!current) throw new CatalogError(404, "Texto não encontrado.", "NOT_FOUND");
  const author = current.authorId ? (await listAuthors(sql)).find((row) => row.id === current.authorId) : undefined;
  return savePost(sql, { ...current, status: "arquivado" }, author?.name ?? "Redação PULSO");
}

export function toPublicPost(row: PostAdmin, author?: AuthorRow | null): Post & {
  blocks: PostBlock[];
  authorId: string | null;
  authorSlug: string | null;
  authorAvatar: string | null;
  authorBio: string | null;
  influencerSlug?: string;
} {
  return {
    slug: row.slug,
    title: row.title,
    excerpt: row.excerpt,
    category: row.category,
    readMinutes: row.readMinutes,
    author: author?.name || "Redação PULSO",
    authorSlug: author?.id ?? null,
    authorAvatar: author?.photoUrl ?? null,
    authorBio: author?.bio ?? null,
    publishedAt: row.publishedAt ?? "",
    coverHex: row.coverHex ?? "#d6ff3c",
    body: row.blocks.filter((block) => block.type === "paragrafo").map((block) => block.text),
    blocks: row.blocks,
    authorId: row.authorId,
    ...(row.influencerId ? { influencerSlug: row.influencerId } : {}),
  };
}

export async function readPublicPosts(sql: Sql, influencer?: string, now = new Date()): Promise<Array<Post & { blocks: PostBlock[] }>> {
  const posts = await listPosts(sql, influencer);
  const authors = await listAuthors(sql);
  const today = now.toISOString().slice(0, 10);
  return posts
    .filter((post) => post.status === "publicado" || (post.status === "agendado" && post.publishedAt && post.publishedAt <= today))
    .map((post) => toPublicPost(post, authors.find((item) => item.id === post.authorId)));
}
