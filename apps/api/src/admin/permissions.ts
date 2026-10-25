export const ROLES = ["dono", "editor", "atendimento"] as const;
export type Role = (typeof ROLES)[number];

export const RESOURCES = [
  "products",
  "kits",
  "categories",
  "influencers",
  "authors",
  "posts",
  "coupons",
  "promotions",
  "drops",
  "waitlist",
  "quiz",
  "reviews",
  "ugc",
  "videos",
  "scratch-prizes",
  "banners",
  "orders",
  "customers",
  "loyalty",
  "uploads",
  "audit",
] as const;

export type Resource = (typeof RESOURCES)[number];

const EDITOR: readonly Resource[] = [
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

const ATENDIMENTO: readonly Resource[] = ["orders", "reviews", "customers", "waitlist"];

export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}

export function can(role: Role, resource: Resource): boolean {
  if (role === "dono") return true;
  if (role === "editor") return EDITOR.includes(resource);
  return ATENDIMENTO.includes(resource);
}
