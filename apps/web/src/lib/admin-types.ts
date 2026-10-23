import type { Badge, CategoryId, FlavorFamily, GoalId } from "@pulso/domain";

/**
 * Contrato do painel. A API real fala estes formatos em `/v1/admin/*`.
 * O adaptador local usa os mesmos tipos enquanto o backend não publica a rota.
 */

export type AdminRole = "dono" | "editor" | "atendimento";

export type AdminDataSource = "api" | "adapter";

export type ProductStatus = "rascunho" | "ativo" | "oculto" | "arquivado";
export type PostStatus = "rascunho" | "agendado" | "publicado" | "arquivado";
export type DropStatus = "em_breve" | "no_ar" | "encerrado";
export type ReviewStatus = "pendente" | "aprovada" | "oculta";
export type OrderStatus = "pagamento_pendente" | "pago" | "separando" | "enviado" | "entregue" | "cancelado";
export type SubscriptionStatus = "ativa" | "pausada" | "cancelada";

export type AdminResource =
  | "products"
  | "kits"
  | "categories"
  | "influencers"
  | "authors"
  | "posts"
  | "coupons"
  | "promotions"
  | "drops"
  | "quiz"
  | "reviews"
  | "ugc"
  | "videos"
  | "scratch-prizes"
  | "banners"
  | "orders"
  | "customers"
  | "loyalty"
  | "uploads"
  | "waitlist";

export interface AdminPublicUser {
  id: string;
  email: string;
  name: string;
  role: AdminRole;
}

export interface AdminSessionView {
  user: AdminPublicUser;
  source: AdminDataSource;
  devSecret: boolean;
}

export interface AdminFlavor {
  id: string;
  name: string;
  tagline: string;
  hex: string;
  family: FlavorFamily;
  limited: boolean;
  stock: number;
}

export interface AdminVariant {
  id: string;
  flavorId: string;
  size: string;
  sku: string;
  priceCents: number;
  compareAtCents: number | null;
  stock: number;
  weightGrams: number;
  servings: number;
}

export interface AdminNutritionRow {
  nutrient: string;
  amount: string;
  dailyValue: string;
}

export interface AdminLabel {
  registration: string;
  category: string;
  serving: string;
  servingsPerContainer: number;
  ingredients: string;
  allergens: string;
  warnings: string[];
  nutrition: AdminNutritionRow[];
  manufacturer: string;
}

export interface AdminImage {
  id: string;
  flavorId: string | null;
  url: string | null;
  alt: string;
  position: number;
  isCover: boolean;
}

export interface AdminKitItem {
  productId: string;
  quantity: number;
}

export interface AdminProduct {
  id: string;
  slug: string;
  name: string;
  line: string;
  tagline: string;
  description: string;
  howToUse: string;
  categoryId: CategoryId | string;
  goals: GoalId[] | string[];
  badges: Badge[] | string[];
  status: ProductStatus;
  caffeineMg: number;
  proteinG: number;
  influencerId: string | null;
  subscriptionEnabled: boolean;
  subscriptionPercent: number;
  subscriptionIntervalDays: number;
  isKit: boolean;
  kitItems: AdminKitItem[];
  flavors: AdminFlavor[];
  variants: AdminVariant[];
  label: AdminLabel;
  images: AdminImage[];
  updatedAt: string;
}

export interface AdminCoupon {
  id: string;
  code: string;
  label: string;
  kind: "percent" | "shipping";
  value: number;
  minCents: number;
  startsAt: string | null;
  endsAt: string | null;
  maxUses: number | null;
  uses: number;
  influencerId: string | null;
  active: boolean;
}

export interface AdminInfluencerRef {
  id: string;
  slug: string;
  name: string;
  handle: string;
}

export interface AdminCategory {
  id: string;
  kind: "categoria" | "objetivo";
  name: string;
  blurb: string;
  imageUrl: string | null;
  position: number;
}

/** Linha de GET /v1/admin/categories e /goals. A API usa slug, sem id e sem kind. */
export interface AdminNamed {
  slug: string;
  name: string;
  blurb: string | null;
  imageUrl: string | null;
  position: number;
}

export interface AdminQuote {
  id: string;
  body: string;
  position: number;
}

export interface AdminInfluencerImage {
  id: string;
  url: string | null;
  alt: string;
  caption: string;
  instagramPostUrl: string | null;
  fallbackHex: string | null;
  position: number;
}

export interface AdminInfluencer extends AdminInfluencerRef {
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
  quotes: AdminQuote[];
  images: AdminInfluencerImage[];
}

export interface AdminAuthor {
  id: string;
  name: string;
  photoUrl: string | null;
  bio: string;
  influencerId: string | null;
}

export type AdminPostBlock =
  | { id: string; type: "paragrafo"; text: string }
  | { id: string; type: "titulo"; text: string }
  | { id: string; type: "imagem"; url: string; alt: string; caption: string }
  | { id: string; type: "citacao_lateral"; text: string; side: "esquerda" | "direita" }
  | { id: string; type: "produto"; productId: string };

export interface AdminPost {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  category: string;
  coverUrl: string | null;
  coverHex: string | null;
  authorId: string | null;
  influencerId: string | null;
  status: PostStatus;
  publishedAt: string | null;
  readMinutes: number;
  seoTitle: string;
  seoDescription: string;
  shareImageUrl: string | null;
  blocks: AdminPostBlock[];
}

export interface AdminPromotion {
  id: string;
  name: string;
  kind: "percent" | "fixed_cents" | "compare_at";
  value: number;
  targetType: "produto" | "categoria";
  productId: string | null;
  categoryId: string | null;
  startsAt: string | null;
  endsAt: string | null;
  badge: string | null;
  active: boolean;
}

export interface AdminDrop {
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
  status: DropStatus;
}

export interface AdminQuizOption {
  id: string;
  label: string;
  value: string;
  position: number;
  weights: Record<string, number>;
}

export interface AdminQuizQuestion {
  id: string;
  prompt: string;
  answerKey: string;
  position: number;
  options: AdminQuizOption[];
}

export interface AdminReview {
  id: string;
  productId: string;
  author: string;
  handle: string;
  rating: number;
  title: string;
  body: string;
  verified: boolean;
  helpful: number;
  status: ReviewStatus;
  reply: string;
  createdAt: string;
}

export interface AdminUgc {
  id: string;
  author: string;
  handle: string;
  caption: string;
  likes: number;
  accent: string;
  productId: string | null;
  position: number;
  hidden: boolean;
}

export interface AdminVideo {
  id: string;
  slug: string;
  title: string;
  caption: string;
  duration: string;
  frames: [string, string, string];
  transcript: string[];
  position: number;
  hidden: boolean;
}

export interface AdminScratchPrize {
  id: string;
  label: string;
  detail: string;
  weight: number;
  couponCode: string | null;
  points: number | null;
  active: boolean;
  position: number;
}

export interface AdminLoyaltyLevel {
  id: string;
  name: string;
  minPoints: number;
  multiplier: number;
  perks: string[];
}

export interface AdminLoyalty {
  id: "loja";
  pointsPerReal: number;
  pixPointsBonus: number;
  pointValueCents: number;
  maxPointsRedeemRatio: number;
  welcomePoints: number;
  freeShippingCents: number;
  pixDiscountPercent: number;
  kitDiscountPercent: number;
  subscriptionDefaultPercent: number;
  referrerPoints: number;
  referredPoints: number;
  levels: AdminLoyaltyLevel[];
}

export interface AdminBanner {
  id: string;
  slot: "hero" | "marquee" | "destaque";
  title: string;
  subtitle: string;
  href: string;
  imageUrl: string | null;
  accent: string;
  position: number;
  active: boolean;
  startsAt: string | null;
  endsAt: string | null;
}

export interface AdminOrderLine {
  id: string;
  productId: string;
  variantId: string;
  name: string;
  quantity: number;
  unitPriceCents: number;
}

export interface AdminOrder {
  id: string;
  code: string;
  customerId: string | null;
  email: string;
  status: OrderStatus;
  paymentMethod: "pix" | "boleto" | "card";
  paymentStatus: string;
  subtotalCents: number;
  discountCents: number;
  pixCents: number;
  shippingCents: number;
  totalCents: number;
  pointsEarned: number;
  shippingMethod: string;
  trackingCode: string;
  shipmentStatus: string;
  createdAt: string;
  lines: AdminOrderLine[];
}

export interface AdminSubscription {
  id: string;
  productId: string;
  variantId: string;
  name: string;
  quantity: number;
  unitPriceCents: number;
  intervalDays: number;
  status: SubscriptionStatus;
  nextChargeOn: string;
}

export interface AdminCustomer {
  id: string;
  email: string;
  name: string;
  pointsBalance: number;
  pointsLifetime: number;
  marketingOptIn: boolean;
  subscriptions: AdminSubscription[];
}

export interface AdminList<T> {
  source: AdminDataSource;
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AdminOne<T> {
  source: AdminDataSource;
  item: T;
}

export interface AdminNavItem {
  href: string;
  label: string;
  resource: AdminResource | null;
}

const EDITOR: AdminResource[] = [
  "products",
  "kits",
  "categories",
  "influencers",
  "authors",
  "posts",
  "coupons",
  "promotions",
  "drops",
  "quiz",
  "ugc",
  "videos",
  "scratch-prizes",
  "banners",
  "uploads",
];

const ATENDIMENTO: AdminResource[] = ["orders", "reviews", "customers"];

export function canAccess(role: AdminRole, resource: AdminResource | null): boolean {
  if (resource === null) return true;
  if (role === "dono") return true;
  if (role === "editor") return EDITOR.includes(resource);
  return ATENDIMENTO.includes(resource);
}

export const ROLE_LABEL: Record<AdminRole, string> = {
  dono: "Dono",
  editor: "Editor",
  atendimento: "Atendimento",
};

export const ADMIN_NAV: AdminNavItem[] = [
  { href: "/admin", label: "Painel", resource: null },
  { href: "/admin/produtos", label: "Produtos", resource: "products" },
  { href: "/admin/kits", label: "Kits", resource: "kits" },
  { href: "/admin/categorias", label: "Categorias", resource: "categories" },
  { href: "/admin/influencers", label: "Influencers", resource: "influencers" },
  { href: "/admin/blog", label: "Blog", resource: "posts" },
  { href: "/admin/cupons", label: "Cupons", resource: "coupons" },
  { href: "/admin/promocoes", label: "Promoções", resource: "promotions" },
  { href: "/admin/drops", label: "Drops", resource: "drops" },
  { href: "/admin/lista-espera", label: "Lista de espera", resource: "waitlist" },
  { href: "/admin/quiz", label: "Quiz", resource: "quiz" },
  { href: "/admin/avaliacoes", label: "Avaliações", resource: "reviews" },
  { href: "/admin/social", label: "Social", resource: "ugc" },
  { href: "/admin/raspadinha", label: "Raspadinha", resource: "scratch-prizes" },
  { href: "/admin/fidelidade", label: "Fidelidade", resource: "loyalty" },
  { href: "/admin/pedidos", label: "Pedidos", resource: "orders" },
  { href: "/admin/clientes", label: "Clientes", resource: "customers" },
  { href: "/admin/vitrine", label: "Vitrine", resource: "banners" },
];

export function resourceForAdminPath(pathname: string): AdminResource | null {
  const match = ADMIN_NAV
    .filter((item) => item.href !== "/admin")
    .sort((a, b) => b.href.length - a.href.length)
    .find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`));
  return match?.resource ?? null;
}

export const PRODUCT_STATUSES: { id: ProductStatus; label: string }[] = [
  { id: "rascunho", label: "Rascunho" },
  { id: "ativo", label: "Ativo" },
  { id: "oculto", label: "Oculto" },
  { id: "arquivado", label: "Arquivado" },
];

export const POST_STATUSES: { id: PostStatus; label: string }[] = [
  { id: "rascunho", label: "Rascunho" },
  { id: "agendado", label: "Agendado" },
  { id: "publicado", label: "Publicado" },
  { id: "arquivado", label: "Arquivado" },
];

export const ORDER_STATUSES: { id: OrderStatus; label: string }[] = [
  { id: "pagamento_pendente", label: "Pagamento pendente" },
  { id: "pago", label: "Pago" },
  { id: "separando", label: "Separando" },
  { id: "enviado", label: "Enviado" },
  { id: "entregue", label: "Entregue" },
  { id: "cancelado", label: "Cancelado" },
];

export function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function blankProduct(): AdminProduct {
  return {
    id: "",
    slug: "",
    name: "",
    line: "",
    tagline: "",
    description: "Ficha de demonstração. Este produto não é um medicamento.",
    howToUse: "Modo de uso de demonstração.",
    categoryId: "pre-treino",
    goals: [],
    badges: [],
    status: "rascunho",
    caffeineMg: 0,
    proteinG: 0,
    influencerId: null,
    subscriptionEnabled: true,
    subscriptionPercent: 10,
    subscriptionIntervalDays: 30,
    isKit: false,
    kitItems: [],
    flavors: [],
    variants: [],
    label: {
      registration: "NI-DEMO-NOVO",
      category: "Suplemento alimentar",
      serving: "30 g",
      servingsPerContainer: 30,
      ingredients: "Ingredientes de demonstração.",
      allergens: "Sem declaração de alergênico neste protótipo.",
      warnings: ["Este produto não é um medicamento."],
      nutrition: [],
      manufacturer: "PULSO Indústria de Alimentos Ltda. (empresa fictícia deste protótipo).",
    },
    images: [],
    updatedAt: "2026-10-01T12:00:00-03:00",
  };
}

export function blankCoupon(): AdminCoupon {
  return {
    id: "",
    code: "",
    label: "",
    kind: "percent",
    value: 10,
    minCents: 0,
    startsAt: null,
    endsAt: null,
    maxUses: null,
    uses: 0,
    influencerId: null,
    active: true,
  };
}
