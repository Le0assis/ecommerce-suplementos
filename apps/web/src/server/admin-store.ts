import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Badge, FlavorFamily, GoalId } from "@pulso/domain";
import { CATEGORIES, GOALS } from "@pulso/domain";
import type { AdminCoupon, AdminFlavor, AdminImage, AdminInfluencer, AdminKitItem, AdminLabel, AdminProduct, AdminVariant, ProductStatus } from "@/lib/admin-types";
import { slugify } from "@/lib/admin-types";
import { migrateAdminDb, seedAdminDb, type AdminDb } from "@/server/admin-seed";

const FAMILIES: FlavorFamily[] = ["citrica", "doce", "fruta", "neutro", "chocolate"];
const BADGES: Badge[] = ["drop", "limited", "bestseller", "novo", "collab"];
const STATUSES: ProductStatus[] = ["rascunho", "ativo", "oculto", "arquivado"];
const GOALS_IDS = GOALS.map((goal) => goal.id);
const CATEGORY_IDS = CATEGORIES.map((category) => category.id);
const LOCAL_IMAGE_BYTES = 300 * 1024;

export class AdminRuleError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function storeFile(): string {
  return process.env.ADMIN_MOCK_PATH ?? path.join(process.cwd(), ".data", "admin-mock.json");
}

export function readAdminDb(): AdminDb {
  const file = storeFile();
  try {
    const parsed = JSON.parse(readFileSync(/*turbopackIgnore: true*/ file, "utf8")) as unknown;
    const migrated = migrateAdminDb(parsed);
    if (!migrated) throw new AdminRuleError(500, "arquivo do adaptador inválido");
    if (!isRecord(parsed) || parsed.version !== 2) writeAdminDb(migrated);
    return migrated;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    const reset = code === "ENOENT" || error instanceof SyntaxError || (error instanceof AdminRuleError && error.message === "arquivo do adaptador inválido");
    if (!reset) throw error;
    const seeded = seedAdminDb();
    writeAdminDb(seeded);
    return seeded;
  }
}

/** Leitura da vitrine. Não cria nem regrava o arquivo. */
export function peekAdminDb(): AdminDb | null {
  try {
    const parsed = JSON.parse(readFileSync(/*turbopackIgnore: true*/ storeFile(), "utf8")) as unknown;
    return migrateAdminDb(parsed);
  } catch {
    return null;
  }
}

export function writeAdminDb(db: AdminDb): void {
  const file = storeFile();
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(/*turbopackIgnore: true*/ file, JSON.stringify(db));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim() : fallback;
}

function whole(value: unknown, fallback = 0): number {
  const number = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : Number.NaN;
  if (!Number.isFinite(number)) return fallback;
  return Math.trunc(number);
}

function nowIso(): string {
  return new Date().toISOString();
}

function mustProduct(db: AdminDb, id: string): AdminProduct {
  const product = db.products.find((item) => item.id === id);
  if (!product) throw new AdminRuleError(404, "Produto não encontrado.");
  return product;
}

function replaceProduct(db: AdminDb, product: AdminProduct): AdminDb {
  return { ...db, products: db.products.map((item) => (item.id === product.id ? product : item)) };
}

export function listProducts(db: AdminDb, search: URLSearchParams) {
  const page = Math.max(1, whole(search.get("page"), 1));
  const pageSize = Math.min(100, Math.max(1, whole(search.get("pageSize"), 20)));
  const q = (search.get("q") ?? "").trim().toLowerCase();
  const status = search.get("status") ?? "";
  let items = db.products;
  if (!status || status === "ativos") items = items.filter((item) => item.status !== "arquivado");
  else if (status !== "todos") items = items.filter((item) => item.status === status);
  if (q) {
    items = items.filter((item) =>
      `${item.name} ${item.slug} ${item.line} ${item.variants.map((variant) => variant.sku).join(" ")}`.toLowerCase().includes(q),
    );
  }
  const total = items.length;
  const start = (page - 1) * pageSize;
  return { items: items.slice(start, start + pageSize), total, page, pageSize };
}

export function getProduct(db: AdminDb, id: string): AdminProduct {
  return mustProduct(db, id);
}

function parseFlavor(input: unknown): AdminFlavor {
  if (!isRecord(input)) throw new AdminRuleError(400, "Sabor inválido.");
  const name = text(input.name);
  if (!name) throw new AdminRuleError(400, "O sabor precisa de nome.");
  const id = slugify(text(input.id) || name);
  if (!id) throw new AdminRuleError(400, "O sabor precisa de id.");
  const family = text(input.family);
  if (!FAMILIES.includes(family as FlavorFamily)) throw new AdminRuleError(400, "Família de sabor inválida.");
  const hex = text(input.hex, "#d6ff3c").toLowerCase();
  if (!/^#[0-9a-f]{6}$/.test(hex)) throw new AdminRuleError(400, "A cor do sabor usa hex de 6 dígitos.");
  const stock = whole(input.stock, 0);
  if (stock < 0) throw new AdminRuleError(400, "Estoque não pode ser negativo.");
  return { id, name, tagline: text(input.tagline), hex, family: family as FlavorFamily, limited: input.limited === true, stock };
}

function parseVariant(input: unknown, flavors: AdminFlavor[]): AdminVariant {
  if (!isRecord(input)) throw new AdminRuleError(400, "Variante inválida.");
  const flavorId = text(input.flavorId);
  if (!flavors.some((flavor) => flavor.id === flavorId)) throw new AdminRuleError(400, "A variante aponta para um sabor que não existe.");
  const size = text(input.size);
  if (!size) throw new AdminRuleError(400, "A variante precisa de tamanho.");
  const sku = text(input.sku).toUpperCase();
  if (!/^[A-Z0-9-]{3,48}$/.test(sku)) throw new AdminRuleError(400, "SKU inválido.");
  const priceCents = whole(input.priceCents, -1);
  const compareRaw = input.compareAtCents;
  const compareAtCents = compareRaw === null || compareRaw === "" || compareRaw === undefined ? null : whole(compareRaw, -1);
  const stock = whole(input.stock, 0);
  const weightGrams = whole(input.weightGrams, 0);
  const servings = whole(input.servings, 0);
  if (priceCents < 0 || stock < 0 || weightGrams < 0) throw new AdminRuleError(400, "Preço e estoque não podem ser negativos.");
  if (servings < 1) throw new AdminRuleError(400, "A variação precisa de pelo menos uma porção, mesmo em rascunho.");
  if (compareAtCents !== null && compareAtCents < 0) throw new AdminRuleError(400, "O preço riscado não pode ser negativo.");
  const id = text(input.id) || `${flavorId}__${slugify(size)}`;
  return { id, flavorId, size, sku, priceCents, compareAtCents, stock, weightGrams, servings };
}

export function acceptableImageUrl(url: string): boolean {
  return safeImageUrl(url);
}

function safeImageUrl(url: string): boolean {
  if (/^data:image\/(jpeg|png|webp);base64,[a-z0-9+/=\s]+$/i.test(url)) {
    const base64 = url.split(",")[1] ?? "";
    return Buffer.from(base64, "base64").byteLength <= LOCAL_IMAGE_BYTES;
  }
  try {
    return new URL(url).protocol === "https:";
  } catch {
    return false;
  }
}

function parseImage(input: unknown, flavors: AdminFlavor[]): AdminImage {
  if (!isRecord(input)) throw new AdminRuleError(400, "Foto inválida.");
  const alt = text(input.alt);
  const url = text(input.url);
  if (!alt) throw new AdminRuleError(400, "A foto precisa de texto alternativo.");
  if (!url || !safeImageUrl(url)) throw new AdminRuleError(400, "Use uma URL https ou uma imagem JPG, PNG ou WebP de até 300 KB.");
  const flavorId = text(input.flavorId);
  if (flavorId && !flavors.some((flavor) => flavor.id === flavorId)) throw new AdminRuleError(400, "A foto aponta para um sabor que não existe.");
  return {
    id: text(input.id) || `foto-${slugify(alt).slice(0, 24) || "item"}`,
    flavorId: flavorId || null,
    url,
    alt,
    position: Math.max(0, whole(input.position, 0)),
    isCover: input.isCover === true,
  };
}

function parseLabel(input: unknown, fallback: AdminLabel): AdminLabel {
  const source = isRecord(input) ? input : {};
  const warnings = Array.isArray(source.warnings) ? source.warnings.map((item) => text(item)).filter(Boolean).slice(0, 12) : fallback.warnings;
  if (!warnings.length) throw new AdminRuleError(400, "O rótulo precisa de pelo menos uma advertência.");
  const nutritionSource = Array.isArray(source.nutrition) ? source.nutrition : fallback.nutrition;
  const nutrition = nutritionSource.slice(0, 40).map((row) => {
    if (!isRecord(row)) throw new AdminRuleError(400, "Linha nutricional inválida.");
    const nutrient = text(row.nutrient);
    const amount = text(row.amount);
    if (!nutrient || !amount) throw new AdminRuleError(400, "Cada linha nutricional precisa de nutriente e quantidade.");
    return { nutrient, amount, dailyValue: text(row.dailyValue) };
  });
  const ingredients = text(source.ingredients, fallback.ingredients);
  const allergens = text(source.allergens, fallback.allergens);
  if (!ingredients || !allergens) throw new AdminRuleError(400, "Informe ingredientes e alergênicos.");
  return {
    registration: text(source.registration, fallback.registration) || "NI-DEMO-NOVO",
    category: text(source.category, fallback.category) || "Suplemento alimentar",
    serving: text(source.serving, fallback.serving),
    servingsPerContainer: Math.max(0, whole(source.servingsPerContainer, fallback.servingsPerContainer)),
    ingredients,
    allergens,
    warnings,
    nutrition,
    manufacturer: text(source.manufacturer, fallback.manufacturer),
  };
}

function parseKitItems(input: unknown, db: AdminDb, selfId: string): AdminKitItem[] {
  if (!Array.isArray(input)) return [];
  return input.slice(0, 12).map((item) => {
    if (!isRecord(item)) throw new AdminRuleError(400, "Item de kit inválido.");
    const productId = text(item.productId);
    if (productId === selfId) throw new AdminRuleError(400, "O kit não pode incluir ele mesmo.");
    if (!db.products.some((product) => product.id === productId)) throw new AdminRuleError(400, "O kit aponta para um produto que não existe.");
    const quantity = whole(item.quantity, 0);
    if (quantity < 1) throw new AdminRuleError(400, "A quantidade do kit começa em 1.");
    return { productId, quantity };
  });
}

function uniqueIds<T extends { id: string }>(items: T[], label: string): T[] {
  const seen = new Set<string>();
  for (const item of items) {
    if (seen.has(item.id)) throw new AdminRuleError(400, `Há dois ${label} com o mesmo id.`);
    seen.add(item.id);
  }
  return items;
}

function parseProduct(db: AdminDb, input: unknown, existing?: AdminProduct): AdminProduct {
  if (!isRecord(input)) throw new AdminRuleError(400, "Produto inválido.");
  const base = existing;
  const name = text(input.name, base?.name);
  if (!name) throw new AdminRuleError(400, "O produto precisa de nome.");
  const slug = slugify(text(input.slug, base?.slug || name));
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new AdminRuleError(400, "Slug inválido.");
  const id = base?.id || slug;
  if (db.products.some((product) => product.slug === slug && product.id !== id)) throw new AdminRuleError(409, "Já existe um produto com esse slug.");
  const status = text(input.status, base?.status ?? "rascunho");
  if (!STATUSES.includes(status as ProductStatus)) throw new AdminRuleError(400, "Status inválido.");
  const categoryId = text(input.categoryId, String(base?.categoryId ?? ""));
  if (!CATEGORY_IDS.includes(categoryId as (typeof CATEGORY_IDS)[number])) throw new AdminRuleError(400, "Categoria inválida.");
  const goals = Array.isArray(input.goals) ? input.goals.map((item) => text(item)).filter(Boolean) : [...(base?.goals ?? [])];
  if (goals.some((goal) => !GOALS_IDS.includes(goal as GoalId))) throw new AdminRuleError(400, "Objetivo inválido.");
  const badges = Array.isArray(input.badges) ? input.badges.map((item) => text(item)).filter(Boolean) : [...(base?.badges ?? [])];
  if (badges.some((badge) => !BADGES.includes(badge as Badge))) throw new AdminRuleError(400, "Selo inválido.");
  const flavors = uniqueIds(
    (Array.isArray(input.flavors) ? input.flavors : (base?.flavors ?? [])).slice(0, 24).map((item) => parseFlavor(item)),
    "sabores",
  );
  const variants = uniqueIds(
    (Array.isArray(input.variants) ? input.variants : (base?.variants ?? [])).slice(0, 80).map((item) => parseVariant(item, flavors)),
    "variantes",
  );
  const skuSeen = new Set<string>();
  for (const variant of variants) {
    if (skuSeen.has(variant.sku)) throw new AdminRuleError(400, "Há duas variantes com o mesmo SKU.");
    skuSeen.add(variant.sku);
    if (db.products.some((product) => product.id !== id && product.variants.some((item) => item.sku === variant.sku))) {
      throw new AdminRuleError(409, `O SKU ${variant.sku} já está em outro produto.`);
    }
  }
  const images = normalizeCovers(
    uniqueIds((Array.isArray(input.images) ? input.images : (base?.images ?? [])).slice(0, 12).map((item) => parseImage(item, flavors)), "fotos"),
  );
  const influencerId = input.influencerId === null ? null : text(input.influencerId, base?.influencerId ?? "");
  if (influencerId && !db.influencers.some((influencer) => influencer.id === influencerId)) {
    throw new AdminRuleError(400, "Influencer não encontrado.");
  }
  const subscriptionPercent = Math.min(30, Math.max(0, whole(input.subscriptionPercent, base?.subscriptionPercent ?? 10)));
  return {
    id,
    slug,
    name,
    line: text(input.line, base?.line ?? ""),
    tagline: text(input.tagline, base?.tagline ?? ""),
    description: text(input.description, base?.description ?? "").slice(0, 4000),
    howToUse: text(input.howToUse, base?.howToUse ?? "").slice(0, 2000),
    categoryId,
    goals,
    badges,
    status: status as ProductStatus,
    caffeineMg: Math.max(0, whole(input.caffeineMg, base?.caffeineMg ?? 0)),
    proteinG: Math.max(0, whole(input.proteinG, base?.proteinG ?? 0)),
    influencerId: influencerId || null,
    subscriptionEnabled: typeof input.subscriptionEnabled === "boolean" ? input.subscriptionEnabled : (base?.subscriptionEnabled ?? true),
    subscriptionPercent,
    subscriptionIntervalDays: Math.max(1, whole(input.subscriptionIntervalDays, base?.subscriptionIntervalDays ?? 30)),
    isKit: typeof input.isKit === "boolean" ? input.isKit : (base?.isKit ?? false),
    kitItems: parseKitItems(input.kitItems ?? base?.kitItems ?? [], db, id),
    flavors,
    variants,
    label: parseLabel(input.label, base?.label ?? seedLabel()),
    images,
    updatedAt: nowIso(),
  };
}

function seedLabel(): AdminLabel {
  return {
    registration: "NI-DEMO-NOVO",
    category: "Suplemento alimentar",
    serving: "",
    servingsPerContainer: 0,
    ingredients: "A definir no rótulo demo.",
    allergens: "A definir.",
    warnings: ["Este produto não é um medicamento."],
    nutrition: [],
    manufacturer: "PULSO Indústria de Alimentos Ltda. (empresa fictícia deste protótipo).",
  };
}

function normalizeCovers(images: AdminImage[]): AdminImage[] {
  let coverSeen = false;
  return images.map((image) => {
    if (!image.isCover) return image;
    if (coverSeen) return { ...image, isCover: false };
    coverSeen = true;
    return image;
  });
}

export function createProduct(db: AdminDb, input: unknown): { db: AdminDb; product: AdminProduct } {
  const product = parseProduct(db, input);
  return { db: { ...db, products: [product, ...db.products] }, product };
}

export function updateProduct(db: AdminDb, id: string, input: unknown): { db: AdminDb; product: AdminProduct } {
  const product = parseProduct(db, input, mustProduct(db, id));
  return { db: replaceProduct(db, product), product };
}

export function archiveProduct(db: AdminDb, id: string): { db: AdminDb; product: AdminProduct } {
  const current = mustProduct(db, id);
  const product = { ...current, status: "arquivado" as const, updatedAt: nowIso() };
  return { db: replaceProduct(db, product), product };
}

export function duplicateProduct(db: AdminDb, id: string): { db: AdminDb; product: AdminProduct } {
  const source = mustProduct(db, id);
  let slug = `${source.slug}-copia`;
  let n = 2;
  while (db.products.some((item) => item.slug === slug)) {
    slug = `${source.slug}-copia-${n}`;
    n += 1;
  }
  const copy = structuredClone(source);
  copy.id = slug;
  copy.slug = slug;
  copy.name = `${source.name} (cópia)`;
  copy.status = "rascunho";
  copy.updatedAt = nowIso();
  copy.variants = copy.variants.map((variant, index) => {
    const suffix = `-C${index + 1}`;
    return { ...variant, sku: `${variant.sku.slice(0, 48 - suffix.length)}${suffix}` };
  });
  return { db: { ...db, products: [copy, ...db.products] }, product: copy };
}

export function addFlavor(db: AdminDb, productId: string, input: unknown): { db: AdminDb; product: AdminProduct } {
  const current = mustProduct(db, productId);
  const flavor = parseFlavor(input);
  if (current.flavors.some((item) => item.id === flavor.id)) throw new AdminRuleError(409, "Já existe um sabor com esse id.");
  const product = { ...current, flavors: [...current.flavors, flavor], updatedAt: nowIso() };
  return { db: replaceProduct(db, product), product };
}

export function updateFlavor(db: AdminDb, productId: string, flavorId: string, input: unknown): { db: AdminDb; product: AdminProduct } {
  const current = mustProduct(db, productId);
  if (!current.flavors.some((item) => item.id === flavorId)) throw new AdminRuleError(404, "Sabor não encontrado.");
  const flavor = parseFlavor({ ...(isRecord(input) ? input : {}), id: flavorId });
  const product = { ...current, flavors: current.flavors.map((item) => (item.id === flavorId ? flavor : item)), updatedAt: nowIso() };
  return { db: replaceProduct(db, product), product };
}

export function deleteFlavor(db: AdminDb, productId: string, flavorId: string): { db: AdminDb; product: AdminProduct } {
  const current = mustProduct(db, productId);
  if (!current.flavors.some((item) => item.id === flavorId)) throw new AdminRuleError(404, "Sabor não encontrado.");
  const product = {
    ...current,
    flavors: current.flavors.filter((item) => item.id !== flavorId),
    variants: current.variants.filter((item) => item.flavorId !== flavorId),
    images: current.images.map((item) => (item.flavorId === flavorId ? { ...item, flavorId: null } : item)),
    updatedAt: nowIso(),
  };
  return { db: replaceProduct(db, product), product };
}

export function addVariant(db: AdminDb, productId: string, input: unknown): { db: AdminDb; product: AdminProduct } {
  const current = mustProduct(db, productId);
  const variant = parseVariant(input, current.flavors);
  if (current.variants.some((item) => item.id === variant.id || item.sku === variant.sku)) throw new AdminRuleError(409, "Variante ou SKU já existe.");
  const product = { ...current, variants: [...current.variants, variant], updatedAt: nowIso() };
  return { db: replaceProduct(db, product), product };
}

export function updateVariant(db: AdminDb, productId: string, variantId: string, input: unknown): { db: AdminDb; product: AdminProduct } {
  const current = mustProduct(db, productId);
  if (!current.variants.some((item) => item.id === variantId)) throw new AdminRuleError(404, "Variante não encontrada.");
  const variant = parseVariant({ ...(isRecord(input) ? input : {}), id: variantId }, current.flavors);
  if (current.variants.some((item) => item.id !== variantId && item.sku === variant.sku)) throw new AdminRuleError(409, "SKU já existe.");
  const product = { ...current, variants: current.variants.map((item) => (item.id === variantId ? variant : item)), updatedAt: nowIso() };
  return { db: replaceProduct(db, product), product };
}

export function deleteVariant(db: AdminDb, productId: string, variantId: string): { db: AdminDb; product: AdminProduct } {
  const current = mustProduct(db, productId);
  if (!current.variants.some((item) => item.id === variantId)) throw new AdminRuleError(404, "Variante não encontrada.");
  const product = { ...current, variants: current.variants.filter((item) => item.id !== variantId), updatedAt: nowIso() };
  return { db: replaceProduct(db, product), product };
}

export function addImage(db: AdminDb, productId: string, input: unknown): { db: AdminDb; product: AdminProduct } {
  const current = mustProduct(db, productId);
  const image = parseImage(input, current.flavors);
  const images = normalizeCovers([...current.images.filter((item) => item.id !== image.id), image]);
  const product = { ...current, images, updatedAt: nowIso() };
  return { db: replaceProduct(db, product), product };
}

export function deleteImage(db: AdminDb, productId: string, imageId: string): { db: AdminDb; product: AdminProduct } {
  const current = mustProduct(db, productId);
  if (!current.images.some((item) => item.id === imageId)) throw new AdminRuleError(404, "Foto não encontrada.");
  const product = { ...current, images: current.images.filter((item) => item.id !== imageId), updatedAt: nowIso() };
  return { db: replaceProduct(db, product), product };
}

export function listCoupons(db: AdminDb, search: URLSearchParams) {
  const page = Math.max(1, whole(search.get("page"), 1));
  const pageSize = Math.min(100, Math.max(1, whole(search.get("pageSize"), 50)));
  const q = (search.get("q") ?? "").trim().toLowerCase();
  const active = search.get("active");
  let items = db.coupons;
  if (active === "true") items = items.filter((item) => item.active);
  if (active === "false") items = items.filter((item) => !item.active);
  if (q) items = items.filter((item) => `${item.code} ${item.label}`.toLowerCase().includes(q));
  const total = items.length;
  const start = (page - 1) * pageSize;
  return { items: items.slice(start, start + pageSize), total, page, pageSize };
}

function parseCoupon(input: unknown, db: AdminDb, existing?: AdminCoupon): AdminCoupon {
  if (!isRecord(input)) throw new AdminRuleError(400, "Cupom inválido.");
  const code = text(input.code, existing?.code).toUpperCase();
  if (!/^[A-Z0-9]{3,20}$/.test(code)) throw new AdminRuleError(400, "O código usa 3 a 20 letras ou números.");
  const id = existing?.id || code.toLowerCase();
  if (db.coupons.some((coupon) => coupon.code === code && coupon.id !== id)) throw new AdminRuleError(409, "Já existe um cupom com esse código.");
  const kind = text(input.kind, existing?.kind ?? "percent");
  if (kind !== "percent" && kind !== "shipping") throw new AdminRuleError(400, "Tipo de cupom inválido.");
  const value = kind === "shipping" ? 0 : whole(input.value, existing?.value ?? 0);
  if (kind === "percent" && (value < 1 || value > 30)) throw new AdminRuleError(400, "O cupom percentual fica entre 1% e 30%.");
  const minCents = Math.max(0, whole(input.minCents, existing?.minCents ?? 0));
  const maxRaw = input.maxUses;
  const maxUses = maxRaw === null || maxRaw === "" || maxRaw === undefined ? (existing && input.maxUses === undefined ? existing.maxUses : null) : whole(maxRaw, 0);
  if (maxUses !== null && maxUses < 1) throw new AdminRuleError(400, "O limite de uso começa em 1, ou fica vazio.");
  const influencerId = input.influencerId === null ? null : text(input.influencerId, existing?.influencerId ?? "");
  if (influencerId && !db.influencers.some((influencer) => influencer.id === influencerId)) throw new AdminRuleError(400, "Influencer não encontrado.");
  const uses = existing?.uses ?? 0;
  return {
    id,
    code,
    label: text(input.label, existing?.label || code),
    kind,
    value,
    minCents,
    startsAt: dateOrNull(input.startsAt, existing?.startsAt ?? null),
    endsAt: dateOrNull(input.endsAt, existing?.endsAt ?? null),
    maxUses,
    uses,
    influencerId: influencerId || null,
    active: typeof input.active === "boolean" ? input.active : (existing?.active ?? true),
  };
}

function dateOrNull(value: unknown, fallback: string | null): string | null {
  if (value === undefined) return fallback;
  if (value === null || value === "") return null;
  if (typeof value !== "string") throw new AdminRuleError(400, "Data inválida.");
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new AdminRuleError(400, "Data inválida.");
  return value;
}

export function createCoupon(db: AdminDb, input: unknown): { db: AdminDb; coupon: AdminCoupon } {
  const coupon = parseCoupon(input, db);
  return { db: { ...db, coupons: [coupon, ...db.coupons] }, coupon };
}

export function updateCoupon(db: AdminDb, id: string, input: unknown): { db: AdminDb; coupon: AdminCoupon } {
  const current = db.coupons.find((item) => item.id === id);
  if (!current) throw new AdminRuleError(404, "Cupom não encontrado.");
  const coupon = parseCoupon(input, db, current);
  return { db: { ...db, coupons: db.coupons.map((item) => (item.id === id ? coupon : item)) }, coupon };
}

export function deleteCoupon(db: AdminDb, id: string): AdminDb {
  const current = db.coupons.find((item) => item.id === id);
  if (!current) throw new AdminRuleError(404, "Cupom não encontrado.");
  if (current.uses > 0) throw new AdminRuleError(409, "Este cupom já foi usado. Desative em vez de apagar.");
  return { ...db, coupons: db.coupons.filter((item) => item.id !== id) };
}

export function listInfluencers(db: AdminDb): AdminInfluencer[] {
  return db.influencers;
}

export function inspectLocalUpload(input: unknown): { url: string; alt: string } {
  if (!isRecord(input)) throw new AdminRuleError(400, "Upload inválido.");
  const alt = text(input.alt);
  const url = text(input.dataUrl);
  if (!alt) throw new AdminRuleError(400, "A foto precisa de texto alternativo.");
  if (!safeImageUrl(url)) throw new AdminRuleError(400, "Envie JPG, PNG ou WebP de até 300 KB.");
  return { url, alt };
}
