import { demoOrder, demoUser } from "@/lib/demo";
import type {
  AdminAuthor,
  AdminBanner,
  AdminCategory,
  AdminCoupon,
  AdminCustomer,
  AdminDrop,
  AdminInfluencer,
  AdminLoyalty,
  AdminOrder,
  AdminPost,
  AdminProduct,
  AdminPromotion,
  AdminQuizQuestion,
  AdminReview,
  AdminScratchPrize,
  AdminUgc,
  AdminVideo,
  ProductStatus,
} from "@/lib/admin-types";
import { coupons, influencers, posts, products, reviews, ugc, upcomingDrop, videos } from "@pulso/data";
import {
  CATEGORIES,
  FREE_SHIPPING_CENTS,
  GOALS,
  KIT_DISCOUNT_PERCENT,
  LEVELS,
  MAX_POINTS_REDEEM_RATIO,
  PIX_DISCOUNT_PERCENT,
  PIX_POINTS_BONUS,
  POINT_VALUE_CENTS,
  POINTS_PER_REAL,
  REFERRED_POINTS,
  REFERRER_POINTS,
  SCRATCH_PRIZES,
  SUBSCRIPTION_DEFAULT_PERCENT,
  WELCOME_POINTS,
} from "@pulso/domain";

const SEEDED_AT = "2026-10-01T12:00:00-03:00";

export interface AdminDb {
  version: 2;
  products: AdminProduct[];
  coupons: AdminCoupon[];
  categories: AdminCategory[];
  influencers: AdminInfluencer[];
  authors: AdminAuthor[];
  posts: AdminPost[];
  promotions: AdminPromotion[];
  drops: AdminDrop[];
  quiz: AdminQuizQuestion[];
  reviews: AdminReview[];
  ugc: AdminUgc[];
  videos: AdminVideo[];
  scratch: AdminScratchPrize[];
  loyalty: AdminLoyalty;
  banners: AdminBanner[];
  orders: AdminOrder[];
  customers: AdminCustomer[];
}

export function seedAdminDb(): AdminDb {
  return {
    version: 2,
    products: products.map(toProduct),
    coupons: coupons.map(toCoupon),
    categories: [
      ...CATEGORIES.map((category, position) => ({
        id: category.id,
        kind: "categoria" as const,
        name: category.label,
        blurb: category.blurb,
        imageUrl: null,
        position,
      })),
      ...GOALS.map((goal, position) => ({
        id: goal.id,
        kind: "objetivo" as const,
        name: goal.label,
        blurb: goal.blurb,
        imageUrl: null,
        position,
      })),
    ],
    influencers: influencers.map(toInfluencer),
    authors: [
      {
        id: "redacao-pulso",
        name: "Redação PULSO",
        photoUrl: null,
        bio: "Textos da casa. Sem promessa de saúde e sem registro de verdade.",
        influencerId: null,
      },
    ],
    posts: posts.map(toPost),
    promotions: [],
    drops: seedDrops(),
    quiz: seedQuiz(),
    reviews: [...reviews.map(toReview), pendingReview()],
    ugc: ugc.map((post, position) => ({
      id: post.id,
      author: post.author,
      handle: post.handle,
      caption: post.caption,
      likes: post.likes,
      accent: post.accent,
      productId: post.productSlug ?? null,
      position,
      hidden: false,
    })),
    videos: videos.map((video, position) => ({
      id: video.id,
      slug: video.slug,
      title: video.title,
      caption: video.caption,
      duration: video.duration,
      frames: video.frames,
      transcript: [...video.transcript],
      position,
      hidden: false,
    })),
    scratch: SCRATCH_PRIZES.map((prize, position) => ({
      id: prize.id,
      label: prize.label,
      detail: prize.detail,
      weight: prize.weight,
      couponCode: prize.couponCode ?? null,
      points: prize.points ?? null,
      active: true,
      position,
    })),
    loyalty: seedLoyalty(),
    banners: seedBanners(),
    orders: [seedOrder()],
    customers: [seedCustomer()],
  };
}

function toProduct(product: (typeof products)[number]): AdminProduct {
  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    line: product.line,
    tagline: product.tagline,
    description: product.description,
    howToUse: product.howToUse,
    categoryId: product.category,
    goals: [...product.goals],
    badges: [...product.badges],
    status: product.hidden ? "oculto" : "ativo",
    caffeineMg: product.caffeineMg,
    proteinG: product.proteinPerServingGrams,
    influencerId: product.influencerSlug ?? null,
    subscriptionEnabled: product.subscription.enabled,
    subscriptionPercent: product.subscription.discountPercent,
    subscriptionIntervalDays: product.subscription.intervalDays,
    isKit: Boolean(product.isKit),
    kitItems: (product.kitItems ?? []).map((item) => ({ productId: item.productSlug, quantity: item.quantity })),
    flavors: product.flavors.map((flavor) => ({
      id: flavor.id,
      name: flavor.name,
      tagline: flavor.tagline,
      hex: flavor.hex,
      family: flavor.family,
      limited: Boolean(flavor.limited),
      stock: flavor.stock,
    })),
    variants: product.variants.map((variant) => ({
      id: variant.id,
      flavorId: variant.flavorId,
      size: variant.size,
      sku: variant.sku,
      priceCents: variant.priceCents,
      compareAtCents: variant.compareAtCents ?? null,
      stock: variant.stock,
      weightGrams: variant.weightGrams,
      servings: variant.servings,
    })),
    label: {
      registration: product.label.registration,
      category: product.label.category,
      serving: product.label.serving,
      servingsPerContainer: product.label.servingsPerContainer,
      ingredients: product.label.ingredients,
      allergens: product.label.allergens,
      warnings: [...product.label.warnings],
      nutrition: product.label.nutrition.map((row) => ({
        nutrient: row.nutrient,
        amount: row.amount,
        dailyValue: row.dailyValue ?? "",
      })),
      manufacturer: product.label.manufacturer,
    },
    images: [],
    updatedAt: SEEDED_AT,
  };
}

function toCoupon(coupon: { code: string; label: string; kind: "percent" | "shipping"; percent?: number; influencerSlug?: string; active: boolean }): AdminCoupon {
  return {
    id: coupon.code.toLowerCase(),
    code: coupon.code,
    label: coupon.label,
    kind: coupon.kind,
    value: coupon.percent ?? 0,
    minCents: 0,
    startsAt: null,
    endsAt: coupon.active ? null : "2026-01-01T00:00:00-03:00",
    maxUses: null,
    uses: coupon.code === "VENCIDO" ? 4 : 0,
    influencerId: coupon.influencerSlug ?? null,
    active: coupon.active,
  };
}

function toInfluencer(influencer: (typeof influencers)[number]): AdminInfluencer {
  const handle = influencer.handle.replace(/^@/, "");
  return {
    id: influencer.slug,
    slug: influencer.slug,
    name: influencer.name,
    handle: influencer.handle.startsWith("@") ? influencer.handle : `@${influencer.handle}`,
    instagramUrl: `https://instagram.com/${handle}`,
    city: influencer.city,
    sport: influencer.sport,
    bio: influencer.bio,
    story: "",
    followers: influencer.followers,
    accent: influencer.accent,
    discountPercent: influencer.discountPercent,
    active: true,
    couponCode: influencer.coupon,
    productIds: influencer.productSlugs.filter((slug) => products.some((product) => product.id === slug)),
    quotes: [],
    images: [],
  };
}

function toPost(post: (typeof posts)[number]): AdminPost {
  return {
    id: post.slug,
    slug: post.slug,
    title: post.title,
    excerpt: post.excerpt,
    category: post.category,
    coverUrl: null,
    coverHex: post.coverHex,
    authorId: "redacao-pulso",
    influencerId: null,
    status: "publicado",
    publishedAt: `${post.publishedAt}T12:00:00-03:00`,
    readMinutes: post.readMinutes,
    seoTitle: post.title,
    seoDescription: post.excerpt,
    shareImageUrl: null,
    blocks: post.body.map((text, index) => ({ id: `${post.slug}-p${index + 1}`, type: "paragrafo" as const, text })),
  };
}

function toReview(review: (typeof reviews)[number]): AdminReview {
  return {
    id: review.id,
    productId: review.productSlug,
    author: review.author,
    handle: review.handle,
    rating: review.rating,
    title: review.title,
    body: review.body,
    verified: review.verified,
    helpful: review.helpful,
    status: "aprovada",
    reply: "",
    createdAt: review.createdAt.includes("T") ? review.createdAt : `${review.createdAt}T12:00:00-03:00`,
  };
}

function pendingReview(): AdminReview {
  return {
    id: "rv-pendente-demo",
    productId: "caos-pre-treino",
    author: "Visitante",
    handle: "@fila",
    rating: 3,
    title: "Aguardando a bancada",
    body: "Avaliação de exemplo na fila. Ainda sem resposta da casa.",
    verified: false,
    helpful: 0,
    status: "pendente",
    reply: "",
    createdAt: "2026-10-20T12:00:00-03:00",
  };
}

function seedDrops(): AdminDrop[] {
  return [
    {
      id: "drop-04-melancia",
      edition: "Drop 04",
      name: "Melancia Ácida",
      productId: "caos-pre-treino",
      flavorId: "melancia",
      startsAt: null,
      endsAt: "2026-11-08T23:59:00-03:00",
      unitsTotal: null,
      unitsLeft: 14,
      teaser: "",
      heroImageUrl: null,
      story: "",
      status: "no_ar",
    },
    {
      id: "drop-luna",
      edition: "Collab Luna",
      name: "Luna × PULSO",
      productId: "collab-luna",
      flavorId: null,
      startsAt: null,
      endsAt: "2026-11-30T23:59:00-03:00",
      unitsTotal: 76,
      unitsLeft: 76,
      teaser: "",
      heroImageUrl: null,
      story: "",
      status: "no_ar",
    },
    {
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
    },
  ];
}

function seedQuiz(): AdminQuizQuestion[] {
  const specs: { id: string; prompt: string; options: { value: string; label: string; weights: Record<string, number> }[] }[] = [
    {
      id: "goal",
      prompt: "Qual é o objetivo agora?",
      options: GOALS.map((goal) => ({ value: goal.id, label: goal.label, weights: { [goal.id]: 1 } })),
    },
    {
      id: "days",
      prompt: "Quantos dias você treina?",
      options: [2, 3, 4, 5, 6].map((days) => ({ value: String(days), label: `${days} dias`, weights: {} })),
    },
    {
      id: "caffeine",
      prompt: "Cafeína, como é?",
      options: [
        { value: "alta", label: "Quero o máximo", weights: {} },
        { value: "media", label: "No meio", weights: {} },
        { value: "zero", label: "Sem cafeína", weights: {} },
      ],
    },
    {
      id: "flavor",
      prompt: "Que sabor te representa?",
      options: [
        { value: "citrica", label: "Cítrico elétrico", weights: {} },
        { value: "doce", label: "Doce", weights: {} },
        { value: "fruta", label: "Fruta", weights: {} },
        { value: "neutro", label: "Sem sabor", weights: {} },
      ],
    },
    {
      id: "budget",
      prompt: "Orçamento do mês",
      options: [
        { value: "baixo", label: "Até uns R$ 150", weights: {} },
        { value: "medio", label: "R$ 150 a 300", weights: {} },
        { value: "alto", label: "Monta o stack", weights: {} },
      ],
    },
  ];
  return specs.map((question, position) => ({
    id: question.id,
    prompt: question.prompt,
    answerKey: question.id,
    position,
    options: question.options.map((option, optionPosition) => ({
      id: `${question.id}-${option.value}`,
      label: option.label,
      value: option.value,
      position: optionPosition,
      weights: option.weights,
    })),
  }));
}

function seedLoyalty(): AdminLoyalty {
  return {
    id: "loja",
    pointsPerReal: POINTS_PER_REAL,
    pixPointsBonus: PIX_POINTS_BONUS,
    pointValueCents: POINT_VALUE_CENTS,
    maxPointsRedeemRatio: MAX_POINTS_REDEEM_RATIO,
    welcomePoints: WELCOME_POINTS,
    freeShippingCents: FREE_SHIPPING_CENTS,
    pixDiscountPercent: PIX_DISCOUNT_PERCENT,
    kitDiscountPercent: KIT_DISCOUNT_PERCENT,
    subscriptionDefaultPercent: SUBSCRIPTION_DEFAULT_PERCENT,
    referrerPoints: REFERRER_POINTS,
    referredPoints: REFERRED_POINTS,
    levels: LEVELS.map((level) => ({
      id: level.id,
      name: level.name,
      minPoints: level.minPoints,
      multiplier: level.multiplier,
      perks: [...level.perks],
    })),
  };
}

function seedBanners(): AdminBanner[] {
  const phrases = ["PIX 10% OFF", "SABOR ALTO", "FRETE NO CEP", "DROP 04", "CREATINA TODO DIA", "SEM DESCULPA DE RÓTULO", "COLLAB LUNA"];
  return [
    {
      id: "hero-caos",
      slot: "hero",
      title: "Caos",
      subtitle: "O pré que não pede licença.",
      href: "/loja/caos-pre-treino",
      imageUrl: null,
      accent: "#d6ff3c",
      position: 0,
      active: true,
      startsAt: null,
      endsAt: null,
    },
    ...phrases.map((title, position) => ({
      id: `marquee-${position + 1}`,
      slot: "marquee" as const,
      title,
      subtitle: "",
      href: "/",
      imageUrl: null,
      accent: "#d6ff3c",
      position,
      active: true,
      startsAt: null,
      endsAt: null,
    })),
  ];
}

function seedOrder(): AdminOrder {
  const quote = demoOrder.quote;
  return {
    id: demoOrder.id,
    code: demoOrder.code,
    customerId: demoUser.id,
    email: demoOrder.email,
    status: demoOrder.status,
    paymentMethod: demoOrder.payment.method,
    paymentStatus: demoOrder.payment.status,
    subtotalCents: quote.grossCents,
    discountCents: quote.discountCents,
    pixCents: quote.pixCents,
    shippingCents: quote.shippingCents,
    totalCents: quote.totalCents,
    pointsEarned: quote.pointsEarned,
    shippingMethod: demoOrder.shipping.method,
    trackingCode: demoOrder.shipping.trackingCode ?? "",
    shipmentStatus: demoOrder.status,
    createdAt: demoOrder.createdAt,
    lines: demoOrder.lines.map((line) => ({
      id: line.lineId,
      productId: line.productSlug,
      variantId: line.variantId,
      name: line.name,
      quantity: line.quantity,
      unitPriceCents: line.unitPriceCents,
    })),
  };
}

function seedCustomer(): AdminCustomer {
  return {
    id: demoUser.id,
    email: demoUser.email,
    name: demoUser.name,
    pointsBalance: demoUser.pointsBalance,
    pointsLifetime: demoUser.pointsLifetime,
    marketingOptIn: demoUser.marketingOptIn,
    cpfMasked: "***.***.***-25",
    subscriptions: demoUser.subscriptions.map((subscription) => ({
      id: subscription.id,
      productId: subscription.productSlug,
      variantId: subscription.variantId,
      name: subscription.name,
      quantity: subscription.quantity,
      unitPriceCents: subscription.unitPriceCents,
      intervalDays: subscription.everyDays,
      status: subscription.status,
      nextChargeOn: subscription.nextDate,
    })),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function productStatus(status: unknown): ProductStatus {
  if (status === "publicado" || status === "ativo") return "ativo";
  if (status === "oculto" || status === "arquivado" || status === "rascunho") return status;
  return "rascunho";
}

export function migrateAdminDb(raw: unknown): AdminDb | null {
  if (!isRecord(raw)) return null;
  if (raw.version === 2 && isV2(raw)) return raw as unknown as AdminDb;
  if (raw.version !== 1 || !Array.isArray(raw.products) || !Array.isArray(raw.coupons)) return null;
  const fresh = seedAdminDb();
  const productsV1 = raw.products as AdminProduct[];
  const oldPeople = Array.isArray(raw.influencers) ? (raw.influencers as { id?: string; slug?: string; name?: string; handle?: string }[]) : [];
  const influencersV2 = fresh.influencers.map((person) => {
    const previous = oldPeople.find((item) => item.id === person.id || item.slug === person.slug);
    if (!previous) return person;
    return {
      ...person,
      name: previous.name?.trim() || person.name,
      handle: previous.handle?.trim() || person.handle,
    };
  });
  for (const previous of oldPeople) {
    const id = (previous.id || previous.slug || "").trim();
    if (!id || influencersV2.some((person) => person.id === id)) continue;
    influencersV2.push({
      id,
      slug: previous.slug || id,
      name: previous.name?.trim() || id,
      handle: previous.handle?.trim() || `@${id}`,
      instagramUrl: null,
      city: "",
      sport: "",
      bio: "",
      story: "",
      followers: "",
      accent: "#d6ff3c",
      discountPercent: null,
      active: true,
      couponCode: null,
      productIds: [],
      quotes: [],
      images: [],
    });
  }
  return {
    ...fresh,
    products: productsV1.map((product) => ({ ...product, status: productStatus(product.status) })),
    coupons: raw.coupons as AdminCoupon[],
    influencers: influencersV2,
  };
}

function isV2(raw: Record<string, unknown>): boolean {
  return (
    Array.isArray(raw.products) &&
    Array.isArray(raw.coupons) &&
    Array.isArray(raw.categories) &&
    Array.isArray(raw.influencers) &&
    Array.isArray(raw.authors) &&
    Array.isArray(raw.posts) &&
    Array.isArray(raw.promotions) &&
    Array.isArray(raw.drops) &&
    Array.isArray(raw.quiz) &&
    Array.isArray(raw.reviews) &&
    Array.isArray(raw.ugc) &&
    Array.isArray(raw.videos) &&
    Array.isArray(raw.scratch) &&
    Array.isArray(raw.banners) &&
    Array.isArray(raw.orders) &&
    Array.isArray(raw.customers) &&
    isRecord(raw.loyalty)
  );
}
