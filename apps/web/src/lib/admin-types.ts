import type { Badge, CategoryId, FlavorFamily, GoalId } from "@pulso/domain";

/**
 * Contrato do painel. A API real fala estes formatos em `/v1/admin/*`.
 * O adaptador local usa os mesmos tipos enquanto o backend não publica a rota.
 */

export type AdminRole = "dono" | "editor" | "atendimento";

export type AdminDataSource = "api" | "adapter";

export type ProductStatus = "rascunho" | "publicado" | "oculto" | "arquivado";

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
  | "uploads";

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
  url: string;
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
  { href: "/admin/cupons", label: "Cupons", resource: "coupons" },
];

export const PRODUCT_STATUSES: { id: ProductStatus; label: string }[] = [
  { id: "rascunho", label: "Rascunho" },
  { id: "publicado", label: "Publicado" },
  { id: "oculto", label: "Oculto" },
  { id: "arquivado", label: "Arquivado" },
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
    description: "",
    howToUse: "",
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
      serving: "",
      servingsPerContainer: 0,
      ingredients: "",
      allergens: "",
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
