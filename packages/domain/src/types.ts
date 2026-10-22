export const CATEGORIES = [
  { id: "pre-treino", label: "Pré-treino", blurb: "Energia pra série que importa" },
  { id: "whey", label: "Whey", blurb: "Proteína com sabor de verdade" },
  { id: "creatina", label: "Creatina", blurb: "O básico que funciona todo dia" },
  { id: "aminoacidos", label: "Aminoácidos", blurb: "Intra, EAA e recuperação" },
  { id: "termogenico", label: "Termogênico", blurb: "Café na veia, sem milagre" },
  { id: "vitaminas", label: "Vitaminas", blurb: "O que a rotina não cobre" },
  { id: "hipercalorico", label: "Hipercalórico", blurb: "Pra quem quer volume no prato e no copo" },
  { id: "barra", label: "Barras", blurb: "Proteína que cabe na mochila" },
  { id: "kit", label: "Kits", blurb: "Stack pronto, menos decisão" },
] as const;

export const GOALS = [
  { id: "hipertrofia", label: "Hipertrofia", blurb: "Construir shape com consistência" },
  { id: "emagrecimento", label: "Cutting", blurb: "Definir sem viver de fome" },
  { id: "energia", label: "Energia", blurb: "Treino depois da aula ou do trampo" },
  { id: "recuperacao", label: "Recuperação", blurb: "Dormir e voltar inteiro" },
  { id: "resistencia", label: "Resistência", blurb: "Aguentar a sessão até o fim" },
  { id: "saude", label: "Saúde", blurb: "Rotina leve, todo dia" },
] as const;

export type CategoryId = (typeof CATEGORIES)[number]["id"];
export type GoalId = (typeof GOALS)[number]["id"];
export type FlavorFamily = "citrica" | "doce" | "fruta" | "neutro" | "chocolate";
export type PaymentMethod = "pix" | "boleto" | "card";
export type ShippingMethod = "pac" | "sedex";
export type Badge = "drop" | "limited" | "bestseller" | "novo" | "collab";

export interface Flavor {
  id: string;
  name: string;
  tagline: string;
  hex: string;
  family: FlavorFamily;
  stock: number;
  limited?: boolean;
}

export interface ProductVariant {
  id: string;
  flavorId: string;
  size: string;
  sku: string;
  priceCents: number;
  compareAtCents?: number;
  stock: number;
  weightGrams: number;
  servings: number;
}

export interface NutritionRow {
  nutrient: string;
  amount: string;
  dailyValue?: string;
}

export interface ProductLabel {
  registration: string;
  category: string;
  serving: string;
  servingsPerContainer: number;
  ingredients: string;
  allergens: string;
  warnings: string[];
  nutrition: NutritionRow[];
  manufacturer: string;
}

export interface ProductDrop {
  id: string;
  edition: string;
  endsAt: string;
  unitsLeft: number;
  teaser?: boolean;
}

export interface KitItem {
  productSlug: string;
  quantity: number;
}

export interface Product {
  id: string;
  slug: string;
  name: string;
  line: string;
  tagline: string;
  description: string;
  howToUse: string;
  category: CategoryId;
  goals: GoalId[];
  flavors: Flavor[];
  variants: ProductVariant[];
  badges: Badge[];
  rating: number;
  reviewCount: number;
  subscription: { enabled: boolean; discountPercent: number; intervalDays: number };
  caffeineMg: number;
  proteinPerServingGrams: number;
  influencerSlug?: string;
  drop?: ProductDrop;
  isKit?: boolean;
  kitItems?: KitItem[];
  hidden?: boolean;
}

export interface Review {
  id: string;
  productSlug: string;
  author: string;
  handle: string;
  rating: number;
  title: string;
  body: string;
  photos: { alt: string; hex: string }[];
  verified: boolean;
  createdAt: string;
  helpful: number;
}

export interface Influencer {
  slug: string;
  name: string;
  handle: string;
  coupon: string;
  discountPercent: number;
  city: string;
  sport: string;
  bio: string;
  followers: string;
  accent: string;
  productSlugs: string[];
}

export interface Post {
  slug: string;
  title: string;
  excerpt: string;
  category: string;
  readMinutes: number;
  author: string;
  publishedAt: string;
  coverHex: string;
  body: string[];
}

export interface UgcPost {
  id: string;
  author: string;
  handle: string;
  caption: string;
  likes: number;
  accent: string;
  productSlug?: string;
}

export interface Coupon {
  code: string;
  label: string;
  kind: "percent" | "shipping";
  percent?: number;
  influencerSlug?: string;
  active: boolean;
}

export interface Level {
  id: "rookie" | "atleta" | "bruto" | "lenda";
  name: string;
  minPoints: number;
  multiplier: number;
  perks: string[];
}

export interface CatalogPatch {
  hidden?: boolean;
  priceCents?: number;
  name?: string;
}
