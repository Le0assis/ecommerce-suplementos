import { CATEGORIES, GOALS, SCRATCH_PRIZES } from "@pulso/domain";
import { coupons, influencers, posts, products, reviews, ugc, upcomingDrop, videos } from "@pulso/data";

export const EXAMPLE_QUIZ_IDS = {
  goal: "quiz-goal",
  days: "quiz-days",
  caffeine: "quiz-caffeine",
  flavor: "quiz-flavor",
  budget: "quiz-budget",
} as const;

export const EXAMPLE_MARQUEE = [
  "PIX 10% OFF",
  "SABOR ALTO",
  "FRETE NO CEP",
  "DROP 04",
  "CREATINA TODO DIA",
  "SEM DESCULPA DE RÓTULO",
  "COLLAB LUNA",
];

export function exampleAuthorId(name: string): string {
  const slug = name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return slug || "autor";
}

export interface ExampleBanner {
  id: string;
  slot: string;
  title: string;
  subtitle: string | null;
  href: string | null;
  position: number;
}

export function exampleBanners(pixDiscountPercent: number): ExampleBanner[] {
  return [
    {
      id: "banner-hero",
      slot: "hero",
      title: "Sabor alto. Treino mais alto.",
      subtitle: "Pré, whey e creatina com cara de rua.",
      href: "/loja/caos-pre-treino",
      position: 0,
    },
    ...EXAMPLE_MARQUEE.map((title, position) => ({
      id: `banner-marquee-${position}`,
      slot: "marquee",
      title,
      subtitle: null,
      href: null,
      position,
    })),
    {
      id: "banner-pix",
      slot: "destaque",
      title: `Pix ${pixDiscountPercent}% off`,
      subtitle: "Em tudo. Sem cupom. O desconto aparece no checkout.",
      href: "/loja",
      position: 0,
    },
    {
      id: "banner-raspadinha",
      slot: "destaque",
      title: "Raspadinha",
      subtitle: "Uma por dia. Pode vir frete, pontos ou quase.",
      href: "/raspadinha",
      position: 1,
    },
    {
      id: "banner-calculadora",
      slot: "destaque",
      title: "Calcula a dose",
      subtitle: "Proteína e creatina, com a letra miúda do lado.",
      href: "/calculadora",
      position: 2,
    },
  ];
}

export interface ExampleSeedKeys {
  categories: string[];
  goals: string[];
  products: string[];
  influencers: string[];
  coupons: string[];
  posts: string[];
  reviews: string[];
  drops: string[];
  authors: string[];
  quizQuestions: string[];
  scratchPrizes: string[];
  banners: string[];
  ugc: string[];
  videos: string[];
  loyalty: string[];
}

export function exampleSeedKeys(pixDiscountPercent: number): ExampleSeedKeys {
  return {
    categories: CATEGORIES.map((category) => category.id),
    goals: GOALS.map((goal) => goal.id),
    products: products.map((product) => product.id),
    influencers: influencers.map((influencer) => influencer.slug),
    coupons: coupons.map((coupon) => coupon.code),
    posts: posts.map((post) => post.slug),
    reviews: reviews.map((review) => review.id),
    drops: [...products.flatMap((product) => (product.drop ? [product.drop.id] : [])), upcomingDrop.id],
    authors: [...new Set(posts.map((post) => exampleAuthorId(post.author)))],
    quizQuestions: Object.values(EXAMPLE_QUIZ_IDS),
    scratchPrizes: SCRATCH_PRIZES.map((prize) => prize.id),
    banners: exampleBanners(pixDiscountPercent).map((banner) => banner.id),
    ugc: ugc.map((post) => post.id),
    videos: videos.map((video) => video.id),
    loyalty: ["padrao"],
  };
}
