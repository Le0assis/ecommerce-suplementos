import type {
  AdminAuthor,
  AdminBanner,
  AdminCategory,
  AdminCustomer,
  AdminDrop,
  AdminInfluencer,
  AdminInfluencerImage,
  AdminLoyalty,
  AdminOrder,
  AdminPost,
  AdminPostBlock,
  AdminPromotion,
  AdminQuizOption,
  AdminQuizQuestion,
  AdminReview,
  AdminScratchPrize,
  AdminSubscription,
  AdminUgc,
  AdminVideo,
  DropStatus,
  OrderStatus,
  PostStatus,
  ReviewStatus,
  SubscriptionStatus,
} from "@/lib/admin-types";
import { slugify } from "@/lib/admin-types";
import { bannerHrefError } from "@/lib/safe-href";
import type { AdminDb } from "@/server/admin-seed";
import { acceptableImageUrl, AdminRuleError, archiveProduct, createProduct, getProduct, updateProduct } from "@/server/admin-store";

const POST_STATUS: PostStatus[] = ["rascunho", "agendado", "publicado", "arquivado"];
const DROP_STATUS: DropStatus[] = ["em_breve", "no_ar", "encerrado"];
const REVIEW_STATUS: ReviewStatus[] = ["pendente", "aprovada", "oculta"];
const ORDER_STATUS: OrderStatus[] = ["pagamento_pendente", "pago", "separando", "enviado", "entregue", "cancelado"];
const SUB_STATUS: SubscriptionStatus[] = ["ativa", "pausada", "cancelada"];
const BLOCKS = ["paragrafo", "titulo", "imagem", "citacao_lateral", "produto"] as const;

export interface RecordResult {
  status: number;
  body: Record<string, unknown>;
  next?: AdminDb;
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

function decimal(value: unknown, fallback: number): number {
  const number = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : Number.NaN;
  return Number.isFinite(number) ? number : fallback;
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) throw new AdminRuleError(400, `${label} inválido.`);
  return value;
}

function optionalDate(value: unknown, fallback: string | null): string | null {
  if (value === undefined) return fallback;
  if (value === null || value === "") return null;
  if (typeof value !== "string" || Number.isNaN(new Date(value).getTime())) throw new AdminRuleError(400, "Data inválida.");
  return value;
}

function hexColor(value: unknown, fallback: string | null, required: boolean): string | null {
  if (value === undefined) return fallback;
  const raw = text(value).toLowerCase();
  if (!raw) {
    if (required) throw new AdminRuleError(400, "A cor usa hex de 6 dígitos.");
    return null;
  }
  if (!/^#[0-9a-f]{6}$/.test(raw)) throw new AdminRuleError(400, "A cor usa hex de 6 dígitos.");
  return raw;
}

function imageOrNull(value: unknown, fallback: string | null): string | null {
  if (value === undefined) return fallback;
  const url = text(value);
  if (!url) return null;
  if (!acceptableImageUrl(url)) throw new AdminRuleError(400, "Use uma URL https ou uma imagem JPG, PNG ou WebP de até 300 KB.");
  return url;
}

function httpsOrNull(value: unknown, fallback: string | null, label: string): string | null {
  if (value === undefined) return fallback;
  const url = text(value);
  if (!url) return null;
  try {
    if (new URL(url).protocol !== "https:") throw new Error("protocol");
  } catch {
    throw new AdminRuleError(400, `${label} precisa ser uma URL https.`);
  }
  return url;
}

function optionalWhole(value: unknown, fallback: number | null): number | null {
  if (value === undefined) return fallback;
  if (value === null || value === "") return null;
  const number = whole(value, Number.NaN);
  if (!Number.isFinite(number)) throw new AdminRuleError(400, "Número inválido.");
  return number;
}

function windowOk(startsAt: string | null, endsAt: string | null) {
  if (startsAt && endsAt && new Date(endsAt).getTime() < new Date(startsAt).getTime()) {
    throw new AdminRuleError(400, "O fim não pode ser antes do começo.");
  }
}

function slicePage<T>(items: T[], search: URLSearchParams) {
  const page = Math.max(1, whole(search.get("page"), 1));
  const pageSize = Math.min(100, Math.max(1, whole(search.get("pageSize"), 50)));
  const total = items.length;
  const start = (page - 1) * pageSize;
  return { items: items.slice(start, start + pageSize), total, page, pageSize };
}

function narrow<T>(items: T[], search: URLSearchParams, haystack: (item: T) => string, statusOf?: (item: T) => string): T[] {
  let next = items;
  const status = search.get("status") ?? "";
  if (statusOf && status && status !== "todos") {
    next = status === "ativos" ? next.filter((item) => statusOf(item) !== "arquivado") : next.filter((item) => statusOf(item) === status);
  }
  const q = (search.get("q") ?? "").trim().toLowerCase();
  if (q) next = next.filter((item) => haystack(item).toLowerCase().includes(q));
  const hidden = search.get("hidden");
  if (hidden === "true" || hidden === "false") {
    next = next.filter((item) => {
      const flag = (item as { hidden?: boolean }).hidden;
      return hidden === "true" ? flag === true : flag === false;
    });
  }
  return next;
}

function must<T extends { id: string }>(items: T[], id: string, label: string): T {
  const found = items.find((item) => item.id === id);
  if (!found) throw new AdminRuleError(404, `${label} não encontrado.`);
  return found;
}

function productExists(db: AdminDb, id: string) {
  if (!db.products.some((product) => product.id === id)) throw new AdminRuleError(400, "Produto não encontrado.");
}

function categoryExists(db: AdminDb, id: string) {
  if (!db.categories.some((category) => category.id === id && category.kind === "categoria")) {
    throw new AdminRuleError(400, "Categoria não encontrada.");
  }
}

export function dispatchRecords(db: AdminDb, method: string, segments: string[], search: URLSearchParams, body: unknown): RecordResult | null {
  const [resource, id, child] = segments;
  if (child) return null;
  if (resource === "settings") return settings(db, method, id, body);
  if (resource === "kits") return kits(db, method, id, search, body);
  if (resource === "categories") return categories(db, method, id, search, body);
  if (resource === "influencers") return influencers(db, method, id, search, body);
  if (resource === "authors") return authors(db, method, id, search, body);
  if (resource === "posts") return posts(db, method, id, search, body);
  if (resource === "promotions") return promotions(db, method, id, search, body);
  if (resource === "drops") return drops(db, method, id, search, body);
  if (resource === "quiz") return quiz(db, method, id, search, body);
  if (resource === "reviews") return reviews(db, method, id, search, body);
  if (resource === "ugc") return ugc(db, method, id, search, body);
  if (resource === "videos") return videos(db, method, id, search, body);
  if (resource === "scratch-prizes") return scratch(db, method, id, search, body);
  if (resource === "banners") return banners(db, method, id, search, body);
  if (resource === "orders") return orders(db, method, id, search, body);
  if (resource === "customers") return customers(db, method, id, search, body);
  return null;
}

function settings(db: AdminDb, method: string, id: string | undefined, body: unknown): RecordResult {
  if (id !== "loyalty") throw new AdminRuleError(404, "Configuração não encontrada.");
  if (method === "GET") return { status: 200, body: { item: db.loyalty } };
  if (method === "PATCH") {
    const loyalty = parseLoyalty(body, db.loyalty);
    return { status: 200, body: { item: loyalty }, next: { ...db, loyalty } };
  }
  throw new AdminRuleError(405, "Fidelidade só se lê ou se atualiza.");
}

function kits(db: AdminDb, method: string, id: string | undefined, search: URLSearchParams, body: unknown): RecordResult {
  const kitsOnly = db.products.filter((product) => product.isKit);
  if (!id && method === "GET") {
    return { status: 200, body: slicePage(narrow(kitsOnly, search, (item) => `${item.name} ${item.slug}`, (item) => item.status), search) };
  }
  if (!id && method === "POST") {
    const created = createKit(db, body);
    return { status: 201, body: { item: created.product }, next: created.db };
  }
  if (id && method === "GET") {
    const product = getProduct(db, id);
    if (!product.isKit) throw new AdminRuleError(404, "Kit não encontrado.");
    return { status: 200, body: { item: product } };
  }
  if (id && method === "PATCH") {
    const current = getProduct(db, id);
    if (!current.isKit) throw new AdminRuleError(404, "Kit não encontrado.");
    const updated = updateProduct(db, id, { ...(isRecord(body) ? body : {}), isKit: true });
    return { status: 200, body: { item: updated.product }, next: updated.db };
  }
  if (id && method === "DELETE") {
    const current = getProduct(db, id);
    if (!current.isKit) throw new AdminRuleError(404, "Kit não encontrado.");
    const archived = archiveProduct(db, id);
    return { status: 200, body: { item: archived.product }, next: archived.db };
  }
  throw new AdminRuleError(405, "Método não aceito para kits.");
}

export function createKit(db: AdminDb, input: unknown) {
  const source = record(input, "Kit");
  const name = text(source.name);
  if (!name) throw new AdminRuleError(400, "O kit precisa de nome.");
  const discount = whole(source.discountPercent, 0);
  if (discount < 0 || discount > 12) throw new AdminRuleError(400, "O desconto do kit fica entre 0% e 12%.");
  if (!Array.isArray(source.kitItems) || source.kitItems.length < 1) throw new AdminRuleError(400, "O kit precisa de pelo menos um produto.");
  const seen = new Set<string>();
  const kitItems = source.kitItems.slice(0, 12).map((item) => {
    const row = record(item, "Item do kit");
    const productId = text(row.productId);
    const product = db.products.find((entry) => entry.id === productId && !entry.isKit);
    if (!product) throw new AdminRuleError(400, "O kit só aponta para produto que não é kit.");
    if (seen.has(productId)) throw new AdminRuleError(400, "O mesmo produto entrou duas vezes no kit.");
    seen.add(productId);
    const quantity = whole(row.quantity, 0);
    if (quantity < 1) throw new AdminRuleError(400, "A quantidade do kit começa em 1.");
    if (!product.variants.length) throw new AdminRuleError(400, `${product.name} não tem preço.`);
    return { product, productId, quantity };
  });
  const sum = kitItems.reduce((total, item) => total + Math.min(...item.product.variants.map((variant) => variant.priceCents)) * item.quantity, 0);
  const priceCents = Math.round((sum * (100 - discount)) / 100);
  const stock = Math.min(
    ...kitItems.map((item) => {
      const available = item.product.flavors.reduce((total, flavor) => total + flavor.stock, 0);
      return Math.floor(available / item.quantity);
    }),
  );
  const slug = slugify(text(source.slug) || name);
  const sku = `KIT-${slug}`.toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 48);
  return createProduct(db, {
    name,
    slug,
    line: "Kit",
    categoryId: "kit",
    status: "rascunho",
    isKit: true,
    kitItems: kitItems.map((item) => ({ productId: item.productId, quantity: item.quantity })),
    flavors: [{ id: "combo", name: "Combo", tagline: "Montado no admin.", hex: "#d6ff3c", family: "neutro", limited: false, stock: Math.max(0, stock) }],
    variants: [
      {
        id: "combo__kit",
        flavorId: "combo",
        size: "Kit",
        sku,
        priceCents,
        compareAtCents: discount > 0 ? sum : null,
        stock: Math.max(0, stock),
        weightGrams: 0,
        servings: 1,
      },
    ],
    label: {
      registration: "NI-DEMO-KIT",
      category: "Suplemento alimentar",
      serving: "Conforme cada produto do kit",
      servingsPerContainer: 1,
      ingredients: "Ver o rótulo de cada produto do kit.",
      allergens: "Ver alergênicos de cada produto do kit.",
      warnings: ["Este produto não é um medicamento."],
      nutrition: [],
      manufacturer: "PULSO Indústria de Alimentos Ltda. (empresa fictícia deste protótipo).",
    },
  });
}

function categories(db: AdminDb, method: string, id: string | undefined, search: URLSearchParams, body: unknown): RecordResult {
  if (!id && method === "GET") {
    const kind = search.get("kind");
    const base = kind === "categoria" || kind === "objetivo" ? db.categories.filter((item) => item.kind === kind) : db.categories;
    return { status: 200, body: slicePage(narrow(base, search, (item) => `${item.name} ${item.id} ${item.blurb}`), search) };
  }
  if (!id && method === "POST") {
    const item = parseCategory(db, body);
    return { status: 201, body: { item }, next: { ...db, categories: [...db.categories, item].sort((a, b) => a.position - b.position) } };
  }
  if (id && method === "PATCH") {
    const item = parseCategory(db, body, must(db.categories, id, "Categoria"));
    return { status: 200, body: { item }, next: { ...db, categories: db.categories.map((entry) => (entry.id === id ? item : entry)) } };
  }
  if (id && method === "DELETE") {
    const current = must(db.categories, id, "Categoria");
    const used =
      db.products.some((product) => product.categoryId === id || product.goals.some((goal) => goal === id)) ||
      db.promotions.some((promotion) => promotion.categoryId === id);
    if (used) throw new AdminRuleError(409, `${current.name} está em uso. Tire dos produtos ou das promoções antes de apagar.`);
    return { status: 200, body: { ok: true }, next: { ...db, categories: db.categories.filter((entry) => entry.id !== id) } };
  }
  throw new AdminRuleError(405, "Método não aceito para categorias.");
}

function parseCategory(db: AdminDb, input: unknown, existing?: AdminCategory): AdminCategory {
  const source = record(input, "Categoria");
  const name = text(source.name, existing?.name);
  if (!name) throw new AdminRuleError(400, "A categoria precisa de nome.");
  const id = existing?.id || slugify(text(source.id) || name);
  if (!id) throw new AdminRuleError(400, "Slug inválido.");
  if (db.categories.some((item) => item.id === id && item.id !== existing?.id)) throw new AdminRuleError(409, "Já existe uma categoria ou objetivo com esse slug.");
  const kind = existing?.kind || text(source.kind, "categoria");
  if (kind !== "categoria" && kind !== "objetivo") throw new AdminRuleError(400, "O tipo é categoria ou objetivo.");
  return {
    id,
    kind,
    name,
    blurb: text(source.blurb, existing?.blurb ?? "").slice(0, 280),
    imageUrl: imageOrNull(source.imageUrl, existing?.imageUrl ?? null),
    position: Math.max(0, whole(source.position, existing?.position ?? db.categories.length)),
  };
}

function influencers(db: AdminDb, method: string, id: string | undefined, search: URLSearchParams, body: unknown): RecordResult {
  if (!id && method === "GET") {
    return { status: 200, body: slicePage(narrow(db.influencers, search, (item) => `${item.name} ${item.handle} ${item.slug}`), search) };
  }
  if (!id && method === "POST") {
    const item = parseInfluencer(db, body);
    return { status: 201, body: { item }, next: linkCoupon({ ...db, influencers: [item, ...db.influencers] }, item, null) };
  }
  if (id && method === "GET") return { status: 200, body: { item: must(db.influencers, id, "Influencer") } };
  if (id && method === "PATCH") {
    const current = must(db.influencers, id, "Influencer");
    const item = parseInfluencer(db, body, current);
    const next = { ...db, influencers: db.influencers.map((entry) => (entry.id === id ? item : entry)) };
    return { status: 200, body: { item }, next: linkCoupon(next, item, current.couponCode) };
  }
  if (id && method === "DELETE") {
    const current = must(db.influencers, id, "Influencer");
    const item = { ...current, active: false };
    return { status: 200, body: { item }, next: { ...db, influencers: db.influencers.map((entry) => (entry.id === id ? item : entry)) } };
  }
  throw new AdminRuleError(405, "Método não aceito para influencers.");
}

function linkCoupon(db: AdminDb, influencer: AdminInfluencer, previous: string | null): AdminDb {
  let coupons = db.coupons.map((coupon) => ({ ...coupon }));
  if (previous && previous !== influencer.couponCode) {
    coupons = coupons.map((coupon) => (coupon.code === previous && coupon.influencerId === influencer.id ? { ...coupon, influencerId: null } : coupon));
  }
  if (influencer.couponCode) {
    coupons = coupons.map((coupon) => (coupon.code === influencer.couponCode ? { ...coupon, influencerId: influencer.id } : coupon));
  }
  return { ...db, coupons };
}

function parseInfluencer(db: AdminDb, input: unknown, existing?: AdminInfluencer): AdminInfluencer {
  const source = record(input, "Influencer");
  const name = text(source.name, existing?.name);
  if (!name) throw new AdminRuleError(400, "O influencer precisa de nome.");
  const slug = existing?.slug || slugify(text(source.slug) || name);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new AdminRuleError(400, "Slug inválido.");
  if (db.influencers.some((item) => item.slug === slug && item.id !== existing?.id)) throw new AdminRuleError(409, "Já existe um influencer com esse slug.");
  let handle = text(source.handle, existing?.handle ?? "");
  if (handle && !handle.startsWith("@")) handle = `@${handle}`;
  if (!/^@[a-zA-Z0-9._]{2,40}$/.test(handle)) throw new AdminRuleError(400, "O @ precisa ter 2 a 40 letras, números, ponto ou _.");
  const productIds = Array.isArray(source.productIds) ? source.productIds.map((item) => text(item)).filter(Boolean) : [...(existing?.productIds ?? [])];
  for (const productId of productIds) productExists(db, productId);
  const couponCode = source.couponCode === null ? null : text(source.couponCode, existing?.couponCode ?? "");
  if (couponCode && !db.coupons.some((coupon) => coupon.code === couponCode)) throw new AdminRuleError(400, "Cadastre o cupom antes de ligar ao influencer.");
  const discountRaw = source.discountPercent;
  const discountPercent = discountRaw === null || discountRaw === "" ? null : whole(discountRaw, existing?.discountPercent ?? 0);
  if (discountPercent !== null && (discountPercent < 0 || discountPercent > 30)) throw new AdminRuleError(400, "O desconto do influencer fica entre 0% e 30%.");
  const quotes = parseQuotes(source.quotes, existing?.quotes ?? []);
  const images = parseInfluencerImages(source.images, existing?.images ?? []);
  return {
    id: existing?.id || slug,
    slug,
    name,
    handle,
    instagramUrl: httpsOrNull(source.instagramUrl, existing?.instagramUrl ?? null, "O Instagram"),
    city: text(source.city, existing?.city ?? ""),
    sport: text(source.sport, existing?.sport ?? ""),
    bio: text(source.bio, existing?.bio ?? "").slice(0, 600),
    story: text(source.story, existing?.story ?? "").slice(0, 800),
    followers: text(source.followers, existing?.followers ?? ""),
    accent: hexColor(source.accent, existing?.accent ?? "#d6ff3c", true) ?? "#d6ff3c",
    discountPercent,
    active: typeof source.active === "boolean" ? source.active : (existing?.active ?? true),
    couponCode: couponCode || null,
    productIds,
    quotes,
    images,
  };
}

function parseQuotes(input: unknown, fallback: AdminInfluencer["quotes"]): AdminInfluencer["quotes"] {
  if (input === undefined) return fallback;
  if (!Array.isArray(input)) throw new AdminRuleError(400, "Frases inválidas.");
  return input.slice(0, 4).map((item, index) => {
    const row = record(item, "Frase");
    const body = text(row.body);
    if (!body) throw new AdminRuleError(400, "A frase não pode ficar vazia.");
    return { id: text(row.id) || `frase-${index + 1}`, body: body.slice(0, 180), position: index };
  });
}

function parseInfluencerImages(input: unknown, fallback: AdminInfluencerImage[]): AdminInfluencerImage[] {
  if (input === undefined) return fallback;
  if (!Array.isArray(input)) throw new AdminRuleError(400, "Fotos inválidas.");
  return input.slice(0, 12).map((item, index) => {
    const row = record(item, "Foto");
    const alt = text(row.alt);
    if (!alt) throw new AdminRuleError(400, "A foto precisa de texto alternativo.");
    const url = imageOrNull(row.url, null);
    const fallbackHex = hexColor(row.fallbackHex, null, false);
    if (!url && !fallbackHex) throw new AdminRuleError(400, "A foto precisa de URL ou de uma cor reserva.");
    return {
      id: text(row.id) || `foto-${index + 1}`,
      url,
      alt: alt.slice(0, 180),
      caption: text(row.caption).slice(0, 180),
      instagramPostUrl: httpsOrNull(row.instagramPostUrl, null, "O link do post"),
      fallbackHex,
      position: index,
    };
  });
}

function authors(db: AdminDb, method: string, id: string | undefined, search: URLSearchParams, body: unknown): RecordResult {
  if (!id && method === "GET") return { status: 200, body: slicePage(narrow(db.authors, search, (item) => item.name), search) };
  if (!id && method === "POST") {
    const item = parseAuthor(db, body);
    return { status: 201, body: { item }, next: { ...db, authors: [...db.authors, item] } };
  }
  if (id && method === "PATCH") {
    const item = parseAuthor(db, body, must(db.authors, id, "Autor"));
    return { status: 200, body: { item }, next: { ...db, authors: db.authors.map((entry) => (entry.id === id ? item : entry)) } };
  }
  if (id && method === "DELETE") {
    must(db.authors, id, "Autor");
    if (db.posts.some((post) => post.authorId === id)) throw new AdminRuleError(409, "Esse autor tem posts. Troque o autor deles antes de apagar.");
    return { status: 200, body: { ok: true }, next: { ...db, authors: db.authors.filter((entry) => entry.id !== id) } };
  }
  throw new AdminRuleError(405, "Método não aceito para autores.");
}

function parseAuthor(db: AdminDb, input: unknown, existing?: AdminAuthor): AdminAuthor {
  const source = record(input, "Autor");
  const name = text(source.name, existing?.name);
  if (!name) throw new AdminRuleError(400, "O autor precisa de nome.");
  const id = existing?.id || slugify(text(source.id) || name);
  if (db.authors.some((item) => item.id === id && item.id !== existing?.id)) throw new AdminRuleError(409, "Já existe um autor com esse id.");
  const influencerId = source.influencerId === null ? null : text(source.influencerId, existing?.influencerId ?? "");
  if (influencerId && !db.influencers.some((item) => item.id === influencerId)) throw new AdminRuleError(400, "Influencer não encontrado.");
  return {
    id,
    name,
    photoUrl: imageOrNull(source.photoUrl, existing?.photoUrl ?? null),
    bio: text(source.bio, existing?.bio ?? "").slice(0, 600),
    influencerId: influencerId || null,
  };
}

function posts(db: AdminDb, method: string, id: string | undefined, search: URLSearchParams, body: unknown): RecordResult {
  if (!id && method === "GET") {
    return { status: 200, body: slicePage(narrow(db.posts, search, (item) => `${item.title} ${item.slug} ${item.category}`, (item) => item.status), search) };
  }
  if (!id && method === "POST") {
    const item = parsePost(db, body);
    return { status: 201, body: { item }, next: { ...db, posts: [item, ...db.posts] } };
  }
  if (id && method === "GET") return { status: 200, body: { item: must(db.posts, id, "Post") } };
  if (id && method === "PATCH") {
    const item = parsePost(db, body, must(db.posts, id, "Post"));
    return { status: 200, body: { item }, next: { ...db, posts: db.posts.map((entry) => (entry.id === id ? item : entry)) } };
  }
  if (id && method === "DELETE") {
    const current = must(db.posts, id, "Post");
    const item = { ...current, status: "arquivado" as const };
    return { status: 200, body: { item }, next: { ...db, posts: db.posts.map((entry) => (entry.id === id ? item : entry)) } };
  }
  throw new AdminRuleError(405, "Método não aceito para posts.");
}

function parsePost(db: AdminDb, input: unknown, existing?: AdminPost): AdminPost {
  const source = record(input, "Post");
  const title = text(source.title, existing?.title);
  if (!title) throw new AdminRuleError(400, "O post precisa de título.");
  const slug = existing?.slug || slugify(text(source.slug) || title);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new AdminRuleError(400, "Slug inválido.");
  if (db.posts.some((item) => item.slug === slug && item.id !== existing?.id)) throw new AdminRuleError(409, "Já existe um post com esse slug.");
  const status = text(source.status, existing?.status ?? "rascunho");
  if (!POST_STATUS.includes(status as PostStatus)) throw new AdminRuleError(400, "Status do post inválido.");
  const publishedAt = optionalDate(source.publishedAt, existing?.publishedAt ?? null);
  if ((status === "agendado" || status === "publicado") && !publishedAt) throw new AdminRuleError(400, "Post agendado ou publicado precisa de data.");
  const authorId = source.authorId === null ? null : text(source.authorId, existing?.authorId ?? "");
  if (authorId && !db.authors.some((item) => item.id === authorId)) throw new AdminRuleError(400, "Autor não encontrado.");
  const influencerId = source.influencerId === null ? null : text(source.influencerId, existing?.influencerId ?? "");
  if (influencerId && !db.influencers.some((item) => item.id === influencerId)) throw new AdminRuleError(400, "Influencer não encontrado.");
  const blocks = source.blocks === undefined ? (existing?.blocks ?? []) : parseBlocks(db, source.blocks);
  return {
    id: existing?.id || slug,
    slug,
    title,
    excerpt: text(source.excerpt, existing?.excerpt ?? "").slice(0, 280),
    category: text(source.category, existing?.category ?? "Suplemento").slice(0, 40),
    coverUrl: imageOrNull(source.coverUrl, existing?.coverUrl ?? null),
    coverHex: hexColor(source.coverHex, existing?.coverHex ?? null, false),
    authorId: authorId || null,
    influencerId: influencerId || null,
    status: status as PostStatus,
    publishedAt,
    readMinutes: Math.max(1, whole(source.readMinutes, existing?.readMinutes ?? 4)),
    seoTitle: text(source.seoTitle, existing?.seoTitle || title).slice(0, 70),
    seoDescription: text(source.seoDescription, existing?.seoDescription || text(source.excerpt, existing?.excerpt ?? "")).slice(0, 160),
    shareImageUrl: imageOrNull(source.shareImageUrl, existing?.shareImageUrl ?? null),
    blocks,
  };
}

function parseBlocks(db: AdminDb, input: unknown): AdminPostBlock[] {
  if (!Array.isArray(input)) throw new AdminRuleError(400, "Blocos inválidos.");
  return input.slice(0, 80).map((item, index) => {
    const row = record(item, "Bloco");
    const type = text(row.type);
    if (!BLOCKS.includes(type as (typeof BLOCKS)[number])) throw new AdminRuleError(400, "Tipo de bloco inválido.");
    const id = text(row.id) || `bloco-${index + 1}`;
    if (type === "paragrafo" || type === "titulo") {
      const value = text(row.text);
      if (!value) throw new AdminRuleError(400, "O bloco de texto não pode ficar vazio.");
      return { id, type, text: value.slice(0, 4000) };
    }
    if (type === "imagem") {
      const alt = text(row.alt);
      const url = text(row.url);
      if (!alt) throw new AdminRuleError(400, "A imagem do post precisa de texto alternativo.");
      if (!acceptableImageUrl(url)) throw new AdminRuleError(400, "A imagem do post precisa de uma URL https ou de um arquivo de até 300 KB.");
      return { id, type, url, alt, caption: text(row.caption).slice(0, 180) };
    }
    if (type === "citacao_lateral") {
      const value = text(row.text);
      const side = text(row.side, "esquerda");
      if (!value) throw new AdminRuleError(400, "A citação não pode ficar vazia.");
      if (side !== "esquerda" && side !== "direita") throw new AdminRuleError(400, "A citação fica à esquerda ou à direita.");
      return { id, type, text: value.slice(0, 280), side };
    }
    const productId = text(row.productId);
    productExists(db, productId);
    return { id, type: "produto", productId };
  });
}

function promotions(db: AdminDb, method: string, id: string | undefined, search: URLSearchParams, body: unknown): RecordResult {
  if (!id && method === "GET") return { status: 200, body: slicePage(narrow(db.promotions, search, (item) => item.name), search) };
  if (!id && method === "POST") {
    const item = parsePromotion(db, body);
    return { status: 201, body: { item }, next: { ...db, promotions: [item, ...db.promotions] } };
  }
  if (id && method === "PATCH") {
    const item = parsePromotion(db, body, must(db.promotions, id, "Promoção"));
    return { status: 200, body: { item }, next: { ...db, promotions: db.promotions.map((entry) => (entry.id === id ? item : entry)) } };
  }
  if (id && method === "DELETE") {
    must(db.promotions, id, "Promoção");
    return { status: 200, body: { ok: true }, next: { ...db, promotions: db.promotions.filter((entry) => entry.id !== id) } };
  }
  throw new AdminRuleError(405, "Método não aceito para promoções.");
}

function parsePromotion(db: AdminDb, input: unknown, existing?: AdminPromotion): AdminPromotion {
  const source = record(input, "Promoção");
  const name = text(source.name, existing?.name);
  if (!name) throw new AdminRuleError(400, "A promoção precisa de nome.");
  const id = existing?.id || slugify(name);
  if (db.promotions.some((item) => item.id === id && item.id !== existing?.id)) throw new AdminRuleError(409, "Já existe uma promoção com esse id.");
  const kind = text(source.kind, existing?.kind ?? "percent");
  if (kind !== "percent" && kind !== "fixed_cents" && kind !== "compare_at") throw new AdminRuleError(400, "Tipo de promoção inválido.");
  const value = Math.max(0, whole(source.value, existing?.value ?? 0));
  if (kind === "percent" && (value < 1 || value > 30)) throw new AdminRuleError(400, "A promoção percentual fica entre 1% e 30%.");
  const targetType = text(source.targetType, existing?.targetType ?? "produto");
  if (targetType !== "produto" && targetType !== "categoria") throw new AdminRuleError(400, "O alvo é produto ou categoria.");
  const productId = targetType === "produto" ? text(source.productId, existing?.productId ?? "") : "";
  const categoryId = targetType === "categoria" ? text(source.categoryId, existing?.categoryId ?? "") : "";
  if (targetType === "produto") productExists(db, productId);
  if (targetType === "categoria") categoryExists(db, categoryId);
  const startsAt = optionalDate(source.startsAt, existing?.startsAt ?? null);
  const endsAt = optionalDate(source.endsAt, existing?.endsAt ?? null);
  windowOk(startsAt, endsAt);
  const badge = text(source.badge, existing?.badge ?? "");
  return {
    id,
    name,
    kind,
    value,
    targetType,
    productId: productId || null,
    categoryId: categoryId || null,
    startsAt,
    endsAt,
    badge: badge || null,
    active: typeof source.active === "boolean" ? source.active : (existing?.active ?? true),
  };
}

function drops(db: AdminDb, method: string, id: string | undefined, search: URLSearchParams, body: unknown): RecordResult {
  if (!id && method === "GET") {
    return { status: 200, body: slicePage(narrow(db.drops, search, (item) => `${item.edition} ${item.name}`, (item) => item.status), search) };
  }
  if (!id && method === "POST") {
    const item = parseDrop(db, body);
    return { status: 201, body: { item }, next: { ...db, drops: [item, ...db.drops] } };
  }
  if (id && method === "GET") return { status: 200, body: { item: must(db.drops, id, "Drop") } };
  if (id && method === "PATCH") {
    const item = parseDrop(db, body, must(db.drops, id, "Drop"));
    return { status: 200, body: { item }, next: { ...db, drops: db.drops.map((entry) => (entry.id === id ? item : entry)) } };
  }
  if (id && method === "DELETE") {
    const current = must(db.drops, id, "Drop");
    const item = { ...current, status: "encerrado" as const };
    return { status: 200, body: { item }, next: { ...db, drops: db.drops.map((entry) => (entry.id === id ? item : entry)) } };
  }
  throw new AdminRuleError(405, "Método não aceito para drops.");
}

function parseDrop(db: AdminDb, input: unknown, existing?: AdminDrop): AdminDrop {
  const source = record(input, "Drop");
  const edition = text(source.edition, existing?.edition);
  if (!edition) throw new AdminRuleError(400, "O drop precisa de edição.");
  const id = existing?.id || slugify(text(source.id) || edition);
  if (db.drops.some((item) => item.id === id && item.id !== existing?.id)) throw new AdminRuleError(409, "Já existe um drop com esse id.");
  const status = text(source.status, existing?.status ?? "em_breve");
  if (!DROP_STATUS.includes(status as DropStatus)) throw new AdminRuleError(400, "Status do drop inválido.");
  const productId = source.productId === null ? null : text(source.productId, existing?.productId ?? "");
  if (productId) productExists(db, productId);
  const flavorId = source.flavorId === null ? null : text(source.flavorId, existing?.flavorId ?? "");
  const product = productId ? db.products.find((item) => item.id === productId) : undefined;
  if (flavorId && !product?.flavors.some((flavor) => flavor.id === flavorId)) throw new AdminRuleError(400, "Sabor do drop não encontrado.");
  const unitsTotal = optionalWhole(source.unitsTotal, existing?.unitsTotal ?? null);
  let unitsLeft = optionalWhole(source.unitsLeft, existing?.unitsLeft ?? null);
  if (flavorId && product) {
    unitsLeft = product.flavors.find((flavor) => flavor.id === flavorId)?.stock ?? 0;
  }
  if (unitsTotal !== null && unitsTotal < 0) throw new AdminRuleError(400, "O lote total não pode ser negativo.");
  if (unitsLeft !== null && unitsLeft < 0) throw new AdminRuleError(400, "O que resta não pode ser negativo.");
  if (unitsTotal !== null && unitsLeft !== null && unitsLeft > unitsTotal) {
    throw new AdminRuleError(400, "O que resta não pode passar do lote. O número sai do estoque real do sabor.");
  }
  const startsAt = optionalDate(source.startsAt, existing?.startsAt ?? null);
  const endsAt = optionalDate(source.endsAt, existing?.endsAt ?? null);
  windowOk(startsAt, endsAt);
  return {
    id,
    edition,
    name: text(source.name, existing?.name ?? ""),
    productId: productId || null,
    flavorId: flavorId || null,
    startsAt,
    endsAt,
    unitsTotal,
    unitsLeft,
    teaser: text(source.teaser, existing?.teaser ?? "").slice(0, 280),
    heroImageUrl: imageOrNull(source.heroImageUrl, existing?.heroImageUrl ?? null),
    story: text(source.story, existing?.story ?? "").slice(0, 800),
    status: status as DropStatus,
  };
}

function quiz(db: AdminDb, method: string, id: string | undefined, search: URLSearchParams, body: unknown): RecordResult {
  if (!id && method === "GET") return { status: 200, body: slicePage(narrow(db.quiz, search, (item) => item.prompt), search) };
  if (!id && method === "POST") {
    const item = parseQuestion(db, body);
    return { status: 201, body: { item }, next: { ...db, quiz: [...db.quiz, item].sort((a, b) => a.position - b.position) } };
  }
  if (id && method === "GET") return { status: 200, body: { item: must(db.quiz, id, "Pergunta") } };
  if (id && method === "PATCH") {
    const item = parseQuestion(db, body, must(db.quiz, id, "Pergunta"));
    return { status: 200, body: { item }, next: { ...db, quiz: db.quiz.map((entry) => (entry.id === id ? item : entry)) } };
  }
  if (id && method === "DELETE") {
    must(db.quiz, id, "Pergunta");
    return { status: 200, body: { ok: true }, next: { ...db, quiz: db.quiz.filter((entry) => entry.id !== id) } };
  }
  throw new AdminRuleError(405, "Método não aceito para o quiz.");
}

function parseQuestion(db: AdminDb, input: unknown, existing?: AdminQuizQuestion): AdminQuizQuestion {
  const source = record(input, "Pergunta");
  const prompt = text(source.prompt, existing?.prompt);
  if (!prompt) throw new AdminRuleError(400, "A pergunta precisa de texto.");
  const id = existing?.id || slugify(text(source.id) || text(source.answerKey) || prompt);
  if (db.quiz.some((item) => item.id === id && item.id !== existing?.id)) throw new AdminRuleError(409, "Já existe uma pergunta com esse id.");
  const answerKey = slugify(text(source.answerKey, existing?.answerKey || id));
  if (!answerKey) throw new AdminRuleError(400, "A chave da resposta é inválida.");
  const options = parseOptions(source.options, existing?.options ?? [], id);
  if (!options.length) throw new AdminRuleError(400, "A pergunta precisa de uma opção.");
  return {
    id,
    prompt: prompt.slice(0, 180),
    answerKey,
    position: Math.max(0, whole(source.position, existing?.position ?? db.quiz.length)),
    options,
  };
}

function parseOptions(input: unknown, fallback: AdminQuizOption[], questionId: string): AdminQuizOption[] {
  if (input === undefined) return fallback;
  if (!Array.isArray(input)) throw new AdminRuleError(400, "Opções inválidas.");
  const options = input.slice(0, 12).map((item, index) => {
    const row = record(item, "Opção");
    const label = text(row.label);
    const value = slugify(text(row.value) || label);
    if (!label || !value) throw new AdminRuleError(400, "Cada opção precisa de rótulo e valor.");
    const weights = parseWeights(row.weights);
    return { id: text(row.id) || `${questionId}-${value}`, label, value, position: index, weights };
  });
  const seen = new Set<string>();
  for (const option of options) {
    if (seen.has(option.value)) throw new AdminRuleError(400, "Há duas opções com o mesmo valor.");
    seen.add(option.value);
  }
  return options;
}

function parseWeights(input: unknown): Record<string, number> {
  if (input === undefined || input === null) return {};
  if (!isRecord(input)) throw new AdminRuleError(400, "Os pesos precisam ser um objeto.");
  const weights: Record<string, number> = {};
  for (const [key, value] of Object.entries(input)) {
    const name = slugify(key);
    if (!name) continue;
    const amount = whole(value, Number.NaN);
    if (!Number.isFinite(amount)) throw new AdminRuleError(400, "Peso inválido.");
    weights[name] = amount;
  }
  return weights;
}

function reviews(db: AdminDb, method: string, id: string | undefined, search: URLSearchParams, body: unknown): RecordResult {
  if (!id && method === "GET") {
    return { status: 200, body: slicePage(narrow(db.reviews, search, (item) => `${item.author} ${item.title} ${item.body}`, (item) => item.status), search) };
  }
  if (id && method === "GET") return { status: 200, body: { item: must(db.reviews, id, "Avaliação") } };
  if (id && method === "PATCH") {
    const item = parseReview(db, body, must(db.reviews, id, "Avaliação"));
    return { status: 200, body: { item }, next: { ...db, reviews: db.reviews.map((entry) => (entry.id === id ? item : entry)) } };
  }
  if (method === "POST" || method === "DELETE") throw new AdminRuleError(405, "Avaliação se aprova, oculta ou responde. Não se cria nem se apaga por aqui.");
  throw new AdminRuleError(405, "Método não aceito para avaliações.");
}

function parseReview(db: AdminDb, input: unknown, existing: AdminReview): AdminReview {
  const source = record(input, "Avaliação");
  const status = text(source.status, existing.status);
  if (!REVIEW_STATUS.includes(status as ReviewStatus)) throw new AdminRuleError(400, "Status da avaliação inválido.");
  const productId = text(source.productId, existing.productId);
  productExists(db, productId);
  const rating = whole(source.rating, existing.rating);
  if (rating < 1 || rating > 5) throw new AdminRuleError(400, "A nota vai de 1 a 5.");
  return {
    ...existing,
    productId,
    status: status as ReviewStatus,
    rating,
    reply: text(source.reply, existing.reply).slice(0, 2000),
    verified: typeof source.verified === "boolean" ? source.verified : existing.verified,
  };
}

function ugc(db: AdminDb, method: string, id: string | undefined, search: URLSearchParams, body: unknown): RecordResult {
  if (!id && method === "GET") return { status: 200, body: slicePage(narrow(db.ugc, search, (item) => `${item.author} ${item.caption}`), search) };
  if (!id && method === "POST") {
    const item = parseUgc(db, body);
    return { status: 201, body: { item }, next: { ...db, ugc: [...db.ugc, item] } };
  }
  if (id && method === "PATCH") {
    const item = parseUgc(db, body, must(db.ugc, id, "Post social"));
    return { status: 200, body: { item }, next: { ...db, ugc: db.ugc.map((entry) => (entry.id === id ? item : entry)) } };
  }
  if (id && method === "DELETE") {
    must(db.ugc, id, "Post social");
    return { status: 200, body: { ok: true }, next: { ...db, ugc: db.ugc.filter((entry) => entry.id !== id) } };
  }
  throw new AdminRuleError(405, "Método não aceito para o social.");
}

function parseUgc(db: AdminDb, input: unknown, existing?: AdminUgc): AdminUgc {
  const source = record(input, "Post social");
  const author = text(source.author, existing?.author);
  const caption = text(source.caption, existing?.caption);
  if (!author || !caption) throw new AdminRuleError(400, "O post social precisa de autor e legenda.");
  const id = existing?.id || slugify(text(source.id) || `${author}-${caption}`).slice(0, 48);
  if (db.ugc.some((item) => item.id === id && item.id !== existing?.id)) throw new AdminRuleError(409, "Já existe um post social com esse id.");
  const productId = source.productId === null ? null : text(source.productId, existing?.productId ?? "");
  if (productId) productExists(db, productId);
  let handle = text(source.handle, existing?.handle ?? "");
  if (handle && !handle.startsWith("@")) handle = `@${handle}`;
  return {
    id,
    author,
    handle,
    caption: caption.slice(0, 280),
    likes: Math.max(0, whole(source.likes, existing?.likes ?? 0)),
    accent: hexColor(source.accent, existing?.accent ?? "#d6ff3c", true) ?? "#d6ff3c",
    productId: productId || null,
    position: Math.max(0, whole(source.position, existing?.position ?? db.ugc.length)),
    hidden: typeof source.hidden === "boolean" ? source.hidden : (existing?.hidden ?? false),
  };
}

function videos(db: AdminDb, method: string, id: string | undefined, search: URLSearchParams, body: unknown): RecordResult {
  if (!id && method === "GET") return { status: 200, body: slicePage(narrow(db.videos, search, (item) => `${item.title} ${item.slug}`), search) };
  if (!id && method === "POST") {
    const item = parseVideo(db, body);
    return { status: 201, body: { item }, next: { ...db, videos: [...db.videos, item] } };
  }
  if (id && method === "PATCH") {
    const item = parseVideo(db, body, must(db.videos, id, "Vídeo"));
    return { status: 200, body: { item }, next: { ...db, videos: db.videos.map((entry) => (entry.id === id ? item : entry)) } };
  }
  if (id && method === "DELETE") {
    must(db.videos, id, "Vídeo");
    return { status: 200, body: { ok: true }, next: { ...db, videos: db.videos.filter((entry) => entry.id !== id) } };
  }
  throw new AdminRuleError(405, "Método não aceito para vídeos.");
}

function parseVideo(db: AdminDb, input: unknown, existing?: AdminVideo): AdminVideo {
  const source = record(input, "Vídeo");
  const title = text(source.title, existing?.title);
  if (!title) throw new AdminRuleError(400, "O vídeo precisa de título.");
  const slug = existing?.slug || slugify(text(source.slug) || title);
  if (db.videos.some((item) => item.slug === slug && item.id !== existing?.id)) throw new AdminRuleError(409, "Já existe um vídeo com esse slug.");
  const frames = Array.isArray(source.frames) ? source.frames.map((item) => hexColor(item, null, true)) : existing?.frames;
  if (!frames || frames.length !== 3 || frames.some((item) => !item)) throw new AdminRuleError(400, "O vídeo precisa de exatamente 3 cores hex.");
  const transcript = Array.isArray(source.transcript)
    ? source.transcript.map((item) => text(item)).filter(Boolean).slice(0, 12)
    : [...(existing?.transcript ?? [])];
  if (!transcript.length) throw new AdminRuleError(400, "O vídeo precisa de pelo menos uma linha de transcrição.");
  return {
    id: existing?.id || slug,
    slug,
    title,
    caption: text(source.caption, existing?.caption ?? "").slice(0, 180),
    duration: text(source.duration, existing?.duration ?? "0:15"),
    frames: [frames[0]!, frames[1]!, frames[2]!],
    transcript,
    position: Math.max(0, whole(source.position, existing?.position ?? db.videos.length)),
    hidden: typeof source.hidden === "boolean" ? source.hidden : (existing?.hidden ?? false),
  };
}

function scratch(db: AdminDb, method: string, id: string | undefined, search: URLSearchParams, body: unknown): RecordResult {
  if (!id && method === "GET") return { status: 200, body: slicePage(narrow(db.scratch, search, (item) => item.label), search) };
  if (!id && method === "POST") {
    const item = parseScratch(db, body);
    return { status: 201, body: { item }, next: { ...db, scratch: [...db.scratch, item] } };
  }
  if (id && method === "PATCH") {
    const item = parseScratch(db, body, must(db.scratch, id, "Prêmio"));
    return { status: 200, body: { item }, next: { ...db, scratch: db.scratch.map((entry) => (entry.id === id ? item : entry)) } };
  }
  if (id && method === "DELETE") {
    must(db.scratch, id, "Prêmio");
    return { status: 200, body: { ok: true }, next: { ...db, scratch: db.scratch.filter((entry) => entry.id !== id) } };
  }
  throw new AdminRuleError(405, "Método não aceito para a raspadinha.");
}

function parseScratch(db: AdminDb, input: unknown, existing?: AdminScratchPrize): AdminScratchPrize {
  const source = record(input, "Prêmio");
  const label = text(source.label, existing?.label);
  if (!label) throw new AdminRuleError(400, "O prêmio precisa de nome.");
  const id = existing?.id || slugify(label);
  if (db.scratch.some((item) => item.id === id && item.id !== existing?.id)) throw new AdminRuleError(409, "Já existe um prêmio com esse id.");
  const weight = whole(source.weight, existing?.weight ?? 0);
  if (weight < 1) throw new AdminRuleError(400, "A chance começa em 1.");
  const couponCode = source.couponCode === null ? null : text(source.couponCode, existing?.couponCode ?? "");
  if (couponCode && !db.coupons.some((coupon) => coupon.code === couponCode)) throw new AdminRuleError(400, "Cupom do prêmio não encontrado.");
  const points = source.points === null || source.points === "" ? null : whole(source.points, existing?.points ?? 0);
  if (points !== null && points < 0) throw new AdminRuleError(400, "Os pontos do prêmio não podem ser negativos.");
  return {
    id,
    label,
    detail: text(source.detail, existing?.detail ?? "").slice(0, 180),
    weight,
    couponCode: couponCode || null,
    points,
    active: typeof source.active === "boolean" ? source.active : (existing?.active ?? true),
    position: Math.max(0, whole(source.position, existing?.position ?? db.scratch.length)),
  };
}

function banners(db: AdminDb, method: string, id: string | undefined, search: URLSearchParams, body: unknown): RecordResult {
  if (!id && method === "GET") {
    const slot = search.get("slot");
    const base = slot ? db.banners.filter((item) => item.slot === slot) : db.banners;
    return { status: 200, body: slicePage(narrow(base, search, (item) => `${item.title} ${item.subtitle}`), search) };
  }
  if (!id && method === "POST") {
    const item = parseBanner(db, body);
    return { status: 201, body: { item }, next: { ...db, banners: [...db.banners, item] } };
  }
  if (id && method === "PATCH") {
    const item = parseBanner(db, body, must(db.banners, id, "Banner"));
    return { status: 200, body: { item }, next: { ...db, banners: db.banners.map((entry) => (entry.id === id ? item : entry)) } };
  }
  if (id && method === "DELETE") {
    must(db.banners, id, "Banner");
    return { status: 200, body: { ok: true }, next: { ...db, banners: db.banners.filter((entry) => entry.id !== id) } };
  }
  throw new AdminRuleError(405, "Método não aceito para a vitrine.");
}

function bannerHref(value: string): string {
  const href = value.trim();
  const problem = bannerHrefError(href);
  if (problem) throw new AdminRuleError(400, problem);
  return href;
}

function parseBanner(db: AdminDb, input: unknown, existing?: AdminBanner): AdminBanner {
  const source = record(input, "Banner");
  const title = text(source.title, existing?.title);
  if (!title) throw new AdminRuleError(400, "O banner precisa de título.");
  const id = existing?.id || slugify(title);
  if (db.banners.some((item) => item.id === id && item.id !== existing?.id)) throw new AdminRuleError(409, "Já existe um banner com esse id.");
  const slot = text(source.slot, existing?.slot ?? "destaque");
  if (slot !== "hero" && slot !== "marquee" && slot !== "destaque") throw new AdminRuleError(400, "O lugar do banner é hero, marquee ou destaque.");
  const startsAt = optionalDate(source.startsAt, existing?.startsAt ?? null);
  const endsAt = optionalDate(source.endsAt, existing?.endsAt ?? null);
  windowOk(startsAt, endsAt);
  return {
    id,
    slot,
    title,
    subtitle: text(source.subtitle, existing?.subtitle ?? "").slice(0, 180),
    href: bannerHref(text(source.href, existing?.href ?? "/").slice(0, 200)),
    imageUrl: imageOrNull(source.imageUrl, existing?.imageUrl ?? null),
    accent: hexColor(source.accent, existing?.accent ?? "#d6ff3c", true) ?? "#d6ff3c",
    position: Math.max(0, whole(source.position, existing?.position ?? db.banners.length)),
    active: typeof source.active === "boolean" ? source.active : (existing?.active ?? true),
    startsAt,
    endsAt,
  };
}

function orders(db: AdminDb, method: string, id: string | undefined, search: URLSearchParams, body: unknown): RecordResult {
  if (!id && method === "GET") {
    return { status: 200, body: slicePage(narrow(db.orders, search, (item) => `${item.code} ${item.email}`, (item) => item.status), search) };
  }
  if (id && method === "GET") return { status: 200, body: { item: must(db.orders, id, "Pedido") } };
  if (id && method === "PATCH") {
    const item = parseOrder(body, must(db.orders, id, "Pedido"));
    return { status: 200, body: { item }, next: { ...db, orders: db.orders.map((entry) => (entry.id === id ? item : entry)) } };
  }
  throw new AdminRuleError(405, "Pedido se consulta e se atualiza. Não se apaga.");
}

function parseOrder(input: unknown, existing: AdminOrder): AdminOrder {
  const source = record(input, "Pedido");
  const status = text(source.status, existing.status);
  if (!ORDER_STATUS.includes(status as OrderStatus)) throw new AdminRuleError(400, "Status do pedido inválido.");
  const trackingCode = text(source.trackingCode, existing.trackingCode).toUpperCase();
  if (trackingCode && !/^[A-Z0-9-]{4,40}$/.test(trackingCode)) throw new AdminRuleError(400, "Código de rastreio inválido.");
  return {
    ...existing,
    status: status as OrderStatus,
    paymentStatus: text(source.paymentStatus, existing.paymentStatus).slice(0, 40),
    trackingCode,
    shipmentStatus: text(source.shipmentStatus, existing.shipmentStatus).slice(0, 40),
  };
}

function customers(db: AdminDb, method: string, id: string | undefined, search: URLSearchParams, body: unknown): RecordResult {
  if (!id && method === "GET") return { status: 200, body: slicePage(narrow(db.customers, search, (item) => `${item.name} ${item.email}`), search) };
  if (id && method === "GET") return { status: 200, body: { item: must(db.customers, id, "Cliente") } };
  if (id && method === "PATCH") {
    const item = parseCustomer(body, must(db.customers, id, "Cliente"));
    return { status: 200, body: { item }, next: { ...db, customers: db.customers.map((entry) => (entry.id === id ? item : entry)) } };
  }
  throw new AdminRuleError(405, "Cliente não se apaga por aqui. A exclusão LGPD fica no backend.");
}

function parseCustomer(input: unknown, existing: AdminCustomer): AdminCustomer {
  const source = record(input, "Cliente");
  const pointsBalance = Math.max(0, whole(source.pointsBalance, existing.pointsBalance));
  if (whole(source.pointsBalance, existing.pointsBalance) < 0) throw new AdminRuleError(400, "Os pontos não podem ficar negativos.");
  const pointsLifetime = Math.max(0, whole(source.pointsLifetime, existing.pointsLifetime));
  const subscriptions = Array.isArray(source.subscriptions) ? mergeSubscriptions(existing.subscriptions, source.subscriptions) : existing.subscriptions;
  return {
    ...existing,
    pointsBalance,
    pointsLifetime,
    marketingOptIn: typeof source.marketingOptIn === "boolean" ? source.marketingOptIn : existing.marketingOptIn,
    subscriptions,
  };
}

function mergeSubscriptions(current: AdminSubscription[], input: unknown[]): AdminSubscription[] {
  return current.map((subscription) => {
    const patch = input.find((item) => isRecord(item) && item.id === subscription.id);
    if (!isRecord(patch)) return subscription;
    const status = text(patch.status, subscription.status);
    if (!SUB_STATUS.includes(status as SubscriptionStatus)) throw new AdminRuleError(400, "Status da assinatura inválido.");
    return { ...subscription, status: status as SubscriptionStatus };
  });
}

function parseLoyalty(input: unknown, existing: AdminLoyalty): AdminLoyalty {
  const source = record(input, "Fidelidade");
  const percent = (value: unknown, fallback: number, label: string) => {
    const number = whole(value, fallback);
    if (number < 0 || number > 30) throw new AdminRuleError(400, `${label} fica entre 0% e 30%.`);
    return number;
  };
  const levels = Array.isArray(source.levels)
    ? existing.levels.map((level) => {
        const patch = source.levels && Array.isArray(source.levels) ? source.levels.find((item) => isRecord(item) && item.id === level.id) : undefined;
        if (!isRecord(patch)) return level;
        const perks = Array.isArray(patch.perks) ? patch.perks.map((item) => text(item)).filter(Boolean).slice(0, 6) : level.perks;
        const multiplier = decimal(patch.multiplier, level.multiplier);
        if (multiplier <= 0 || multiplier > 3) throw new AdminRuleError(400, "O multiplicador fica entre 0 e 3.");
        return {
          ...level,
          name: text(patch.name, level.name) || level.name,
          minPoints: Math.max(0, whole(patch.minPoints, level.minPoints)),
          multiplier,
          perks,
        };
      })
    : existing.levels;
  const ratio = decimal(source.maxPointsRedeemRatio, existing.maxPointsRedeemRatio);
  if (ratio < 0 || ratio > 1) throw new AdminRuleError(400, "O teto de resgate fica entre 0 e 1.");
  return {
    ...existing,
    pointsPerReal: Math.max(0, whole(source.pointsPerReal, existing.pointsPerReal)),
    pixPointsBonus: Math.max(0, decimal(source.pixPointsBonus, existing.pixPointsBonus)),
    pointValueCents: Math.max(0, whole(source.pointValueCents, existing.pointValueCents)),
    maxPointsRedeemRatio: ratio,
    welcomePoints: Math.max(0, whole(source.welcomePoints, existing.welcomePoints)),
    freeShippingCents: Math.max(0, whole(source.freeShippingCents, existing.freeShippingCents)),
    pixDiscountPercent: percent(source.pixDiscountPercent, existing.pixDiscountPercent, "O Pix"),
    kitDiscountPercent: percent(source.kitDiscountPercent, existing.kitDiscountPercent, "O kit"),
    subscriptionDefaultPercent: percent(source.subscriptionDefaultPercent, existing.subscriptionDefaultPercent, "A assinatura"),
    referrerPoints: Math.max(0, whole(source.referrerPoints, existing.referrerPoints)),
    referredPoints: Math.max(0, whole(source.referredPoints, existing.referredPoints)),
    levels,
  };
}
