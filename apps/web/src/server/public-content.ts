import type { AdminPost, AdminPostBlock } from "@/lib/admin-types";
import { peekAdminDb } from "@/server/admin-store";
import { getInfluencer, posts as catalogPosts, products as catalogProducts } from "@pulso/data";
import type { Product } from "@pulso/domain";

export interface CollabPageModel {
  name: string;
  handle: string;
  city: string;
  sport: string;
  followers: string;
  bio: string;
  story: string;
  accent: string;
  coupon: string;
  discountPercent: number;
  instagramUrl: string;
  variant: "luna" | "caio" | "nanda" | "theo";
  quotes: { id: string; body: string }[];
  images: { id: string; url: string | null; alt: string; caption: string; href: string | null; hex: string }[];
  products: Product[];
  posts: { slug: string; title: string; excerpt: string }[];
}

export interface PublicArticle {
  title: string;
  excerpt: string;
  category: string;
  authorName: string;
  authorBio: string;
  authorHref: string | null;
  blocks: AdminPostBlock[];
  products: { id: string; slug: string; name: string; line: string; hex: string }[];
}

function variantOf(slug: string): CollabPageModel["variant"] {
  if (slug.startsWith("luna")) return "luna";
  if (slug.startsWith("caio")) return "caio";
  if (slug.startsWith("nanda")) return "nanda";
  return "theo";
}

function atHandle(handle: string): string {
  const bare = handle.replace(/^@/, "");
  return handle.startsWith("@") ? handle : `@${bare}`;
}

function instagramOf(handle: string, explicit: string | null | undefined): string {
  if (explicit?.trim()) return explicit.trim();
  return `https://instagram.com/${handle.replace(/^@/, "")}`;
}

function catalogProductsByIds(ids: string[]): Product[] {
  const wanted = new Set(ids);
  return catalogProducts.filter((product) => wanted.has(product.id) || wanted.has(product.slug));
}

function articleProducts(ids: string[]) {
  const source = ids.length ? catalogProductsByIds(ids) : catalogProducts;
  return source.map((product) => ({
    id: product.id,
    slug: product.slug,
    name: product.name,
    line: product.line,
    hex: product.flavors[0]?.hex ?? "#d6ff3c",
  }));
}

function isLive(post: AdminPost, now: number): boolean {
  if (post.status !== "publicado" || !post.publishedAt) return false;
  const at = Date.parse(post.publishedAt);
  return Number.isFinite(at) && at <= now;
}

export function resolveCollab(slug: string, now?: number): CollabPageModel | null {
  const clock = now ?? Date.now();
  const catalog = getInfluencer(slug);
  const db = peekAdminDb();
  const person = db?.influencers.find((item) => item.slug === slug);
  if (person && !person.active) return null;
  if (!person && !catalog) return null;

  const name = person?.name || catalog?.name || "";
  const handle = atHandle(person?.handle || catalog?.handle || "");
  const productIds = person?.productIds.length ? person.productIds : (catalog?.productSlugs ?? []);
  const quotes = (person?.quotes ?? [])
    .filter((quote) => quote.body.trim())
    .sort((a, b) => a.position - b.position)
    .slice(0, 4)
    .map((quote) => ({ id: quote.id || quote.body, body: quote.body }));
  const accent = person?.accent || catalog?.accent || "#d6ff3c";
  const images = (person?.images ?? [])
    .filter((image) => image.alt.trim())
    .sort((a, b) => a.position - b.position)
    .map((image) => ({
      id: image.id || image.alt,
      url: image.url,
      alt: image.alt,
      caption: image.caption,
      href: image.instagramPostUrl,
      hex: image.fallbackHex || accent,
    }));
  const related = db
    ? db.posts
        .filter((post) => post.influencerId === person?.id && isLive(post, clock))
        .map((post) => ({ slug: post.slug, title: post.title, excerpt: post.excerpt }))
    : catalogPosts
        .filter((post) => post.author === name)
        .map((post) => ({ slug: post.slug, title: post.title, excerpt: post.excerpt }));

  return {
    name,
    handle,
    city: person?.city || catalog?.city || "",
    sport: person?.sport || catalog?.sport || "",
    followers: person?.followers || catalog?.followers || "",
    bio: person?.bio || catalog?.bio || "",
    story: person?.story ?? "",
    accent,
    coupon: person?.couponCode || catalog?.coupon || "",
    discountPercent: person?.discountPercent ?? catalog?.discountPercent ?? 0,
    instagramUrl: instagramOf(handle, person?.instagramUrl),
    variant: variantOf(slug),
    quotes,
    images,
    products: catalogProductsByIds(productIds),
    posts: related,
  };
}

export function resolveArticle(slug: string, now?: number): PublicArticle | null {
  const clock = now ?? Date.now();
  const catalog = catalogPosts.find((post) => post.slug === slug);
  const db = peekAdminDb();
  const stored = db?.posts.find((post) => post.slug === slug);
  if (stored?.status === "arquivado") return null;
  if (!stored && !catalog) return null;

  const live = stored && isLive(stored, clock) ? stored : null;
  const author = live?.authorId ? db?.authors.find((item) => item.id === live.authorId) : undefined;
  const influencerId = live?.influencerId || author?.influencerId || null;
  const influencer = influencerId ? db?.influencers.find((item) => item.id === influencerId && item.active) : undefined;
  const blocks: AdminPostBlock[] = live
    ? live.blocks
    : (catalog?.body ?? []).map((text, index) => ({ id: `${slug}-p${index + 1}`, type: "paragrafo" as const, text }));
  const productIds = blocks.flatMap((block) => (block.type === "produto" ? [block.productId] : []));

  return {
    title: live?.title || catalog?.title || "",
    excerpt: live?.excerpt || catalog?.excerpt || "",
    category: live?.category || catalog?.category || "Suplemento",
    authorName: author?.name || catalog?.author || "Redação PULSO",
    authorBio: author?.bio ?? "",
    authorHref: influencer ? `/atletas/${influencer.slug}` : null,
    blocks,
    products: articleProducts(productIds),
  };
}
