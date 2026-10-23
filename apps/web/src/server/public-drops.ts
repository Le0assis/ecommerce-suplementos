import type { AdminDb } from "@/server/admin-seed";
import { peekAdminDb } from "@/server/admin-store";
import { waitlistCounts } from "@/server/drop-waitlist";
import { dropViewState, stockOf, type DropViewState } from "@/lib/drop-view";
import { influencers, products, upcomingDrop } from "@pulso/data";

export interface PublicDropView {
  id: string;
  edition: string;
  name: string;
  productSlug: string | null;
  flavorId: string | null;
  flavorName: string | null;
  hex: string;
  startsAt: string | null;
  endsAt: string | null;
  unitsLeft: number | null;
  unitsTotal: number | null;
  teaser: string;
  heroImageUrl: string | null;
  story: string;
  ingredients: string;
  influencerName: string | null;
  state: DropViewState;
  waitlistCount: number;
  buyHref: string | null;
}

interface DropSeed {
  id: string;
  edition: string;
  name: string;
  productId: string | null;
  flavorId: string | null;
  startsAt: string | null;
  endsAt: string | null;
  unitsTotal: number | null;
  unitsLeft: number | null;
  teaser: string;
  heroImageUrl: string | null;
  story: string;
  status: "em_breve" | "no_ar" | "encerrado";
  trustUnits: boolean;
  waitlistCount?: number;
}

function shortText(value: string): string {
  const sentence = value.split(". ")[0]?.trim() ?? "";
  if (!sentence) return "";
  return sentence.length > 180 ? `${sentence.slice(0, 177)}…` : sentence;
}

function catalogStock(productId: string | null, flavorId: string | null): number | null {
  if (!productId) return null;
  const product = products.find((item) => item.id === productId || item.slug === productId);
  if (!product) return null;
  return stockOf(product.flavors, flavorId);
}

function adminStock(db: AdminDb | null, productId: string | null, flavorId: string | null): number | null {
  if (!db || !productId) return null;
  const product = db.products.find((item) => item.id === productId || item.slug === productId);
  if (!product) return null;
  return stockOf(product.flavors, flavorId);
}

function decorate(seed: DropSeed, now: number, counts: Record<string, number>, db: AdminDb | null): PublicDropView {
  const product = seed.productId ? products.find((item) => item.id === seed.productId || item.slug === seed.productId) : undefined;
  const flavor = seed.flavorId ? product?.flavors.find((item) => item.id === seed.flavorId) : undefined;
  const swatch = flavor ?? product?.flavors.find((item) => item.limited) ?? product?.flavors[0];
  const influencer = product?.influencerSlug ? influencers.find((item) => item.slug === product.influencerSlug) : undefined;
  const flavorMin = adminStock(db, seed.productId, seed.flavorId) ?? catalogStock(seed.productId, seed.flavorId);
  const unitsLeft = seed.trustUnits ? seed.unitsLeft : (seed.unitsLeft ?? flavorMin);
  const unitsTotal = seed.unitsTotal !== null && (unitsLeft === null || seed.unitsTotal >= unitsLeft) ? seed.unitsTotal : null;
  const state = dropViewState({ status: seed.status, startsAt: seed.startsAt, endsAt: seed.endsAt, unitsLeft }, now);
  const story = seed.story.trim() || flavor?.tagline || "";
  return {
    id: seed.id,
    edition: seed.edition,
    name: seed.name || flavor?.name || product?.name || seed.edition,
    productSlug: product?.slug ?? null,
    flavorId: flavor?.id ?? seed.flavorId,
    flavorName: flavor?.name ?? null,
    hex: swatch?.hex ?? "#ff5d73",
    startsAt: seed.startsAt,
    endsAt: seed.endsAt,
    unitsLeft,
    unitsTotal,
    teaser: seed.teaser,
    heroImageUrl: seed.heroImageUrl,
    story,
    ingredients: product ? shortText(product.label.ingredients) : "",
    influencerName: influencer?.name ?? null,
    state,
    waitlistCount: seed.waitlistCount ?? counts[seed.id] ?? 0,
    buyHref: state === "no_ar" && product ? `/loja/${product.slug}${flavor ? `?sabor=${flavor.id}` : ""}` : null,
  };
}

function fromCatalog(db: AdminDb | null): DropSeed[] {
  const source = db?.drops.length ? db.drops : null;
  if (source) {
    return source.map((drop) => ({
      id: drop.id,
      edition: drop.edition,
      name: drop.name,
      productId: drop.productId,
      flavorId: drop.flavorId,
      startsAt: drop.startsAt,
      endsAt: drop.endsAt,
      unitsTotal: drop.unitsTotal,
      unitsLeft: drop.unitsLeft,
      teaser: drop.teaser,
      heroImageUrl: drop.heroImageUrl,
      story: drop.story,
      status: drop.status,
      trustUnits: false,
    }));
  }
  const live: DropSeed[] = products.flatMap((product) => {
    if (!product.drop) return [];
    const flavor = product.flavors.find((item) => product.drop?.id.endsWith(`-${item.id}`));
    return [{
      id: product.drop.id,
      edition: product.drop.edition,
      name: flavor?.name ?? product.name,
      productId: product.id,
      flavorId: flavor?.id ?? null,
      startsAt: null,
      endsAt: product.drop.endsAt,
      unitsTotal: null,
      unitsLeft: flavor ? null : product.drop.unitsLeft,
      teaser: "",
      heroImageUrl: null,
      story: "",
      status: "no_ar" as const,
      trustUnits: false,
    }];
  });
  live.push({
    id: upcomingDrop.id,
    edition: upcomingDrop.edition,
    name: upcomingDrop.name,
    productId: null,
    flavorId: null,
    startsAt: null,
    endsAt: upcomingDrop.endsAt,
    unitsTotal: null,
    unitsLeft: null,
    teaser: "O sabor ainda não tem nome.",
    heroImageUrl: null,
    story: "",
    status: "em_breve",
    trustUnits: false,
  });
  return live;
}

function fromApi(drops: Partial<DropSeed>[], source: string): DropSeed[] {
  return drops.flatMap((drop) => {
    if (!drop.id || !drop.edition) return [];
    const status = drop.status === "em_breve" || drop.status === "encerrado" || drop.status === "no_ar" ? drop.status : "no_ar";
    return [{
      id: drop.id,
      edition: drop.edition,
      name: drop.name ?? "",
      productId: drop.productId ?? null,
      flavorId: drop.flavorId ?? null,
      startsAt: drop.startsAt ?? null,
      endsAt: drop.endsAt ?? null,
      unitsTotal: typeof drop.unitsTotal === "number" ? drop.unitsTotal : null,
      unitsLeft: typeof drop.unitsLeft === "number" ? drop.unitsLeft : null,
      waitlistCount: typeof drop.waitlistCount === "number" ? drop.waitlistCount : undefined,
      teaser: drop.teaser ?? "",
      heroImageUrl: drop.heroImageUrl ?? null,
      story: drop.story ?? "",
      status,
      trustUnits: source === "postgres",
    }];
  });
}

export function previewCatalogDrops(now: number): PublicDropView[] {
  return assembleDrops(now, fromCatalog(null), {}, null);
}

export function assembleDrops(now: number, seeds: DropSeed[], counts: Record<string, number>, db: AdminDb | null): PublicDropView[] {
  return seeds.map((seed) => decorate(seed, now, counts, db));
}

async function fetchApi(): Promise<{ drops: DropSeed[]; source: string } | null> {
  const base = (process.env.API_URL ?? "http://127.0.0.1:8787").replace(/\/$/, "");
  try {
    const response = await fetch(`${base}/v1/drops`, { signal: AbortSignal.timeout(800), cache: "no-store" });
    if (!response.ok) return null;
    const body = (await response.json()) as { source?: string; drops?: Partial<DropSeed>[] };
    if (!Array.isArray(body.drops)) return null;
    return { drops: fromApi(body.drops, body.source ?? ""), source: body.source ?? "" };
  } catch {
    return null;
  }
}

export async function loadPublicDrops(now = Date.now()): Promise<PublicDropView[]> {
  const db = peekAdminDb();
  const counts = waitlistCounts();
  const api = await fetchApi();
  const seeds = api?.drops.length ? api.drops : fromCatalog(db);
  return assembleDrops(now, seeds, counts, api?.source === "postgres" ? null : db);
}
