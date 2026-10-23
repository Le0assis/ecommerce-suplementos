import type { AdminPost, AdminPostBlock } from "@/lib/admin-types";
import { peekAdminDb } from "@/server/admin-store";
import { getInfluencer, influencers, posts as catalogPosts, products as catalogProducts } from "@pulso/data";
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

export interface PublicAthleteCard {
  slug: string;
  name: string;
  handle: string;
  city: string;
  accent: string;
  variant: CollabPageModel["variant"];
  path: string;
}

function athleteCard(slug: string, name: string, handle: string, city: string, accent: string): PublicAthleteCard {
  return { slug, name, handle: atHandle(handle), city, accent, variant: variantOf(slug), path: `/atletas/${slug}` };
}

export function listPublicAthletes(): PublicAthleteCard[] {
  const db = peekAdminDb();
  const cards = influencers.map((person) => athleteCard(person.slug, person.name, person.handle, person.city, person.accent));
  const known = new Set(cards.map((card) => card.slug));
  for (const person of db?.influencers ?? []) {
    if (!person.active || known.has(person.slug)) continue;
    cards.push(athleteCard(person.slug, person.name, person.handle, person.city, person.accent));
    known.add(person.slug);
  }
  return cards;
}

export async function loadPublicAthletes(): Promise<PublicAthleteCard[]> {
  const cards = listPublicAthletes();
  const remote = await fetchApi("/v1/influencers");
  if (remote?.source !== "postgres" || !Array.isArray(remote.body.influencers)) return cards;
  const known = new Set(cards.map((card) => card.slug));
  for (const person of remote.body.influencers as RemoteInfluencer[]) {
    if (!person.slug || known.has(person.slug)) continue;
    cards.push(athleteCard(person.slug, person.name, person.handle, person.city ?? "", person.accent || "#d6ff3c"));
    known.add(person.slug);
  }
  return cards;
}

interface RemoteInfluencer {
  slug: string;
  name: string;
  handle: string;
  coupon?: string;
  discountPercent?: number;
  city?: string;
  sport?: string;
  bio?: string;
  followers?: string;
  accent?: string;
  productSlugs?: string[];
  story?: string;
  instagramUrl?: string | null;
  path?: string;
  quotes?: { id: string; body: string; position?: number }[];
  images?: { id: string; url: string | null; alt: string; caption?: string; instagramPostUrl?: string | null; fallbackHex?: string | null; position?: number }[];
}

async function fetchApi(path: string): Promise<{ source?: string; body: Record<string, unknown> } | null> {
  const base = (process.env.API_URL ?? "http://127.0.0.1:8787").replace(/\/$/, "");
  try {
    const response = await fetch(`${base}${path}`, { cache: "no-store", signal: AbortSignal.timeout(800) });
    if (!response.ok) return null;
    const body = (await response.json()) as Record<string, unknown>;
    return { source: typeof body.source === "string" ? body.source : undefined, body };
  } catch {
    return null;
  }
}

function collabFromRemote(person: RemoteInfluencer, posts: { slug: string; title: string; excerpt: string }[]): CollabPageModel {
  const handle = atHandle(person.handle);
  const accent = person.accent || "#d6ff3c";
  return {
    name: person.name,
    handle,
    city: person.city ?? "",
    sport: person.sport ?? "",
    followers: person.followers ?? "",
    bio: person.bio ?? "",
    story: person.story ?? "",
    accent,
    coupon: person.coupon ?? "",
    discountPercent: person.discountPercent ?? 0,
    instagramUrl: instagramOf(handle, person.instagramUrl),
    variant: variantOf(person.slug),
    quotes: (person.quotes ?? [])
      .filter((quote) => quote.body.trim())
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
      .slice(0, 4)
      .map((quote) => ({ id: quote.id || quote.body, body: quote.body })),
    images: (person.images ?? [])
      .filter((image) => image.alt.trim())
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
      .map((image) => ({
        id: image.id || image.alt,
        url: image.url,
        alt: image.alt,
        caption: image.caption ?? "",
        href: image.instagramPostUrl ?? null,
        hex: image.fallbackHex || accent,
      })),
    products: catalogProductsByIds(person.productSlugs ?? []),
    posts,
  };
}

export async function loadPublicCollab(slug: string, now = Date.now()): Promise<CollabPageModel | null> {
  const remote = await fetchApi(`/v1/influencers/${encodeURIComponent(slug)}`);
  if (remote?.source === "postgres" && remote.body.influencer && typeof remote.body.influencer === "object") {
    const postsRemote = await fetchApi(`/v1/posts?influencer=${encodeURIComponent(slug)}`);
    const posts = Array.isArray(postsRemote?.body.posts)
      ? (postsRemote.body.posts as { slug?: string; title?: string; excerpt?: string }[])
          .filter((post) => post.slug && post.title)
          .map((post) => ({ slug: post.slug as string, title: post.title as string, excerpt: post.excerpt ?? "" }))
      : [];
    return collabFromRemote(remote.body.influencer as RemoteInfluencer, posts);
  }
  return resolveCollab(slug, now);
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

export async function loadPublicArticle(slug: string, now = Date.now()): Promise<PublicArticle | null> {
  const remote = await fetchApi(`/v1/posts/${encodeURIComponent(slug)}`);
  if (remote?.source === "postgres" && remote.body.post && typeof remote.body.post === "object") {
    const post = remote.body.post as {
      title?: string;
      excerpt?: string;
      category?: string;
      author?: string;
      blocks?: AdminPostBlock[];
      authorId?: string | null;
      influencerSlug?: string;
    };
    const blocks = Array.isArray(post.blocks) && post.blocks.length
      ? post.blocks
      : [];
    const productIds = blocks.flatMap((block) => (block.type === "produto" ? [block.productId] : []));
    return {
      title: post.title ?? "",
      excerpt: post.excerpt ?? "",
      category: post.category || "Suplemento",
      authorName: post.author || "Redação PULSO",
      authorBio: "",
      authorHref: post.influencerSlug ? `/atletas/${post.influencerSlug}` : null,
      blocks,
      products: articleProducts(productIds),
    };
  }
  return resolveArticle(slug, now);
}
