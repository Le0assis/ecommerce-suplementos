import type { AdminPost, AdminPostBlock } from "@/lib/admin-types";
import { safeBannerHref } from "@/lib/safe-href";
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
  const direct = safeBannerHref(explicit);
  if (direct) return direct;
  const bare = handle.replace(/^@/, "");
  if (/^[A-Za-z0-9._]+$/.test(bare)) return `https://instagram.com/${bare}`;
  return "https://instagram.com";
}

function publicSlug(slug: string): string | null {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(slug) ? slug : null;
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
      href: safeBannerHref(image.instagramPostUrl),
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

function athleteCard(slug: string, name: string, handle: string, city: string, accent: string): PublicAthleteCard | null {
  const safe = publicSlug(slug);
  if (!safe) return null;
  return { slug: safe, name, handle: atHandle(handle), city, accent, variant: variantOf(safe), path: `/atletas/${safe}` };
}

export function listPublicAthletes(): PublicAthleteCard[] {
  const db = peekAdminDb();
  const cards = influencers.flatMap((person) => {
    const card = athleteCard(person.slug, person.name, person.handle, person.city, person.accent);
    return card ? [card] : [];
  });
  const known = new Set(cards.map((card) => card.slug));
  for (const person of db?.influencers ?? []) {
    if (!person.active || known.has(person.slug)) continue;
    const card = athleteCard(person.slug, person.name, person.handle, person.city, person.accent);
    if (!card) continue;
    cards.push(card);
    known.add(person.slug);
  }
  return cards;
}

function catalogAthleteCards(): PublicAthleteCard[] {
  return influencers.flatMap((person) => {
    const card = athleteCard(person.slug, person.name, person.handle, person.city, person.accent);
    return card ? [card] : [];
  });
}

export async function loadPublicAthletes(): Promise<PublicAthleteCard[]> {
  const remote = await fetchApi("/v1/influencers");
  if (remote.kind !== "ok" || !Array.isArray(remote.body.influencers)) return catalogAthleteCards();
  return (remote.body.influencers as RemoteInfluencer[]).flatMap((person) => {
    if (!person.slug || !person.name) return [];
    const card = athleteCard(person.slug, person.name, person.handle ?? "", person.city ?? "", person.accent || "#d6ff3c");
    return card ? [card] : [];
  });
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

type ApiHit = { kind: "ok"; body: Record<string, unknown> } | { kind: "missing" } | { kind: "down" };

async function fetchApi(path: string): Promise<ApiHit> {
  const base = (process.env.API_URL ?? "http://127.0.0.1:8787").replace(/\/$/, "");
  try {
    const response = await fetch(`${base}${path}`, { cache: "no-store", signal: AbortSignal.timeout(800) });
    if (response.status === 404) return { kind: "missing" };
    if (!response.ok) return { kind: "down" };
    const body = (await response.json()) as Record<string, unknown>;
    return { kind: "ok", body };
  } catch {
    return { kind: "down" };
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
        href: safeBannerHref(image.instagramPostUrl),
        hex: image.fallbackHex || accent,
      })),
    products: catalogProductsByIds(person.productSlugs ?? []),
    posts: posts.flatMap((post) => (publicSlug(post.slug) ? [post] : [])),
  };
}

function catalogCollab(slug: string): CollabPageModel | null {
  const catalog = getInfluencer(slug);
  if (!catalog) return null;
  const handle = atHandle(catalog.handle);
  return {
    name: catalog.name,
    handle,
    city: catalog.city,
    sport: catalog.sport,
    followers: catalog.followers,
    bio: catalog.bio,
    story: "",
    accent: catalog.accent,
    coupon: catalog.coupon,
    discountPercent: catalog.discountPercent,
    instagramUrl: instagramOf(handle, null),
    variant: variantOf(slug),
    quotes: [],
    images: [],
    products: catalogProductsByIds(catalog.productSlugs),
    posts: catalogPosts
      .filter((post) => post.author === catalog.name)
      .flatMap((post) => (publicSlug(post.slug) ? [{ slug: post.slug, title: post.title, excerpt: post.excerpt }] : [])),
  };
}

function postsFromRemote(body: Record<string, unknown>): { slug: string; title: string; excerpt: string }[] {
  if (!Array.isArray(body.posts)) return [];
  return (body.posts as { slug?: string; title?: string; excerpt?: string }[]).flatMap((post) => {
    if (!post.slug || !post.title || !publicSlug(post.slug)) return [];
    return [{ slug: post.slug, title: post.title, excerpt: post.excerpt ?? "" }];
  });
}

export async function loadPublicCollab(slug: string): Promise<CollabPageModel | null> {
  const [remote, postsRemote] = await Promise.all([
    fetchApi(`/v1/influencers/${encodeURIComponent(slug)}`),
    fetchApi(`/v1/posts?influencer=${encodeURIComponent(slug)}`),
  ]);
  if (remote.kind === "missing") return null;
  if (remote.kind === "ok" && remote.body.influencer && typeof remote.body.influencer === "object") {
    const posts = postsRemote.kind === "ok" ? postsFromRemote(postsRemote.body) : [];
    return collabFromRemote(remote.body.influencer as RemoteInfluencer, posts);
  }
  if (remote.kind === "down") return catalogCollab(slug);
  return null;
}

export interface PublicPostCard {
  slug: string;
  title: string;
  excerpt: string;
  category: string;
  readMinutes: number;
  publishedAt: string;
  path: string;
}

export function catalogPostCards(): PublicPostCard[] {
  return catalogPosts.flatMap((post) => {
    if (!publicSlug(post.slug)) return [];
    return [{
      slug: post.slug,
      title: post.title,
      excerpt: post.excerpt,
      category: post.category,
      readMinutes: post.readMinutes,
      publishedAt: post.publishedAt,
      path: `/blog/${post.slug}`,
    }];
  });
}

export async function loadPublicPosts(): Promise<PublicPostCard[]> {
  const remote = await fetchApi("/v1/posts");
  if (remote.kind !== "ok" || !Array.isArray(remote.body.posts)) return catalogPostCards();
  return (remote.body.posts as Partial<PublicPostCard>[]).flatMap((post) => {
    if (!post.slug || !post.title || !publicSlug(post.slug)) return [];
    return [{
      slug: post.slug,
      title: post.title,
      excerpt: post.excerpt ?? "",
      category: post.category || "Suplemento",
      readMinutes: typeof post.readMinutes === "number" ? post.readMinutes : 1,
      publishedAt: post.publishedAt || "",
      path: `/blog/${post.slug}`,
    }];
  });
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
    authorHref: influencer && publicSlug(influencer.slug) ? `/atletas/${influencer.slug}` : null,
    blocks,
    products: articleProducts(productIds),
  };
}

function articleFromRemote(post: {
  title?: string;
  excerpt?: string;
  category?: string;
  author?: string;
  authorBio?: string | null;
  blocks?: AdminPostBlock[];
  body?: string[];
  influencerSlug?: string;
}): PublicArticle {
  const blocks = Array.isArray(post.blocks) && post.blocks.length
    ? post.blocks
    : (post.body ?? []).map((text, index) => ({ id: `p${index + 1}`, type: "paragrafo" as const, text }));
  const productIds = blocks.flatMap((block) => (block.type === "produto" ? [block.productId] : []));
  const influencer = post.influencerSlug && publicSlug(post.influencerSlug) ? post.influencerSlug : null;
  return {
    title: post.title ?? "",
    excerpt: post.excerpt ?? "",
    category: post.category || "Suplemento",
    authorName: post.author || "Redação PULSO",
    authorBio: post.authorBio ?? "",
    authorHref: influencer ? `/atletas/${influencer}` : null,
    blocks,
    products: articleProducts(productIds),
  };
}

function catalogArticle(slug: string): PublicArticle | null {
  const catalog = catalogPosts.find((post) => post.slug === slug);
  if (!catalog) return null;
  return articleFromRemote({
    title: catalog.title,
    excerpt: catalog.excerpt,
    category: catalog.category,
    author: catalog.author,
    body: catalog.body,
  });
}

export async function loadPublicArticle(slug: string): Promise<PublicArticle | null> {
  const remote = await fetchApi(`/v1/posts/${encodeURIComponent(slug)}`);
  if (remote.kind === "missing") return null;
  if (remote.kind === "ok" && remote.body.post && typeof remote.body.post === "object") {
    return articleFromRemote(remote.body.post as Parameters<typeof articleFromRemote>[0]);
  }
  if (remote.kind === "down") return catalogArticle(slug);
  return null;
}
