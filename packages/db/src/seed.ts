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
  freeShippingThresholdCents,
} from "@pulso/domain";
import { coupons, influencers, posts, products, reviews, ugc, upcomingDrop, videos } from "@pulso/data";
import type pg from "pg";
import { loadEnv } from "./env";
import { closePool, getPool } from "./pool";
import { ExampleSeedRefused, inspectExampleSeed, type ExampleSeedOptions, type SeedClient } from "./seed-gate";

export type { ExampleSeedOptions };
import { EXAMPLE_QUIZ_IDS, exampleAuthorId, exampleBanners } from "./seed-keys";

// Exemplo fictício, copiado do mock da vitrine. Não é cadastro de produção.
// O portão libera a gravação em banco vazio ou que ainda só tem este exemplo.
// NODE_ENV=production, produto fora do mock, updated_at posterior ao marcador
// example_seed ou outra edição do admin recusam, a menos que
// PULSO_SEED_ALLOW_OVERWRITE=1 ou --force-example.
// Apagar e recriar nutrição, imagem, meta, selo, kit, produto do atleta,
// opção do quiz e bloco do post só roda com esse portão liberado.
// Não mexe em pedido, cliente, lista de espera, sessão nem senha de admin.
// Não zera uses do cupom nem a resposta de uma avaliação.

export const EXAMPLE_SEED_OK =
  "Exemplo gravado no Postgres. São dados fictícios do mock; pedido, lista de espera e senha de admin não entram aqui.";

async function deleteMockChildren(client: SeedClient, replaceMockChildren: boolean, sql: string, params: unknown[] = []): Promise<void> {
  if (!replaceMockChildren) {
    throw new ExampleSeedRefused(
      "Seed de exemplo recusado: apagar e recriar os filhos do mock só roda com o portão liberado. Nada foi regravado.",
    );
  }
  await client.query(sql, params);
}

function instagramUrl(handle: string): string {
  return `https://instagram.com/${handle.replace(/^@/, "")}`;
}

async function seedCatalog(client: SeedClient, replaceMockChildren: boolean): Promise<void> {
  for (const [position, category] of CATEGORIES.entries()) {
    await client.query(
      `insert into categories (slug, name, blurb, position)
       values ($1, $2, $3, $4)
       on conflict (slug) do update set name = excluded.name, blurb = excluded.blurb, position = excluded.position`,
      [category.id, category.label, category.blurb, position],
    );
  }
  for (const [position, goal] of GOALS.entries()) {
    await client.query(
      `insert into goals (slug, name, blurb, position)
       values ($1, $2, $3, $4)
       on conflict (slug) do update set name = excluded.name, blurb = excluded.blurb, position = excluded.position`,
      [goal.id, goal.label, goal.blurb, position],
    );
  }

  for (const influencer of influencers) {
    await client.query(
      `insert into influencers (
         slug, name, handle, coupon_code, payload, instagram_url, city, sport, bio, followers, accent, discount_percent, active, updated_at
       ) values ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9, $10, $11, $12, true, now())
       on conflict (slug) do update set
         name = excluded.name,
         handle = excluded.handle,
         coupon_code = excluded.coupon_code,
         payload = excluded.payload,
         instagram_url = excluded.instagram_url,
         city = excluded.city,
         sport = excluded.sport,
         bio = excluded.bio,
         followers = excluded.followers,
         accent = excluded.accent,
         discount_percent = excluded.discount_percent,
         active = excluded.active,
         updated_at = now()`,
      [
        influencer.slug,
        influencer.name,
        influencer.handle,
        influencer.coupon,
        JSON.stringify(influencer),
        instagramUrl(influencer.handle),
        influencer.city,
        influencer.sport,
        influencer.bio,
        influencer.followers,
        influencer.accent,
        influencer.discountPercent,
      ],
    );
  }

  for (const product of products) {
    const status = product.hidden ? "oculto" : "ativo";
    await client.query(
      `insert into products (
         id, slug, name, category, active, payload, updated_at,
         line, tagline, description, how_to_use, category_id, status,
         caffeine_mg, protein_g, influencer_id,
         subscription_enabled, subscription_discount_percent, subscription_interval_days, is_kit
       ) values (
         $1, $2, $3, $4, true, $5::jsonb, now(),
         $6, $7, $8, $9, $10, $11,
         $12, $13, $14,
         $15, $16, $17, $18
       )
       on conflict (id) do update set
         slug = excluded.slug,
         name = excluded.name,
         category = excluded.category,
         active = excluded.active,
         payload = excluded.payload,
         updated_at = now(),
         line = excluded.line,
         tagline = excluded.tagline,
         description = excluded.description,
         how_to_use = excluded.how_to_use,
         category_id = excluded.category_id,
         status = excluded.status,
         caffeine_mg = excluded.caffeine_mg,
         protein_g = excluded.protein_g,
         influencer_id = excluded.influencer_id,
         subscription_enabled = excluded.subscription_enabled,
         subscription_discount_percent = excluded.subscription_discount_percent,
         subscription_interval_days = excluded.subscription_interval_days,
         is_kit = excluded.is_kit`,
      [
        product.id,
        product.slug,
        product.name,
        product.category,
        JSON.stringify(product),
        product.line,
        product.tagline,
        product.description,
        product.howToUse,
        product.category,
        status,
        product.caffeineMg,
        product.proteinPerServingGrams,
        product.influencerSlug ?? null,
        product.subscription.enabled,
        product.subscription.discountPercent,
        product.subscription.intervalDays,
        Boolean(product.isKit),
      ],
    );

    for (const [position, flavor] of product.flavors.entries()) {
      await client.query(
        `insert into product_flavors (id, product_id, slug, name, tagline, hex, family, limited, position)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         on conflict (id) do update set
           slug = excluded.slug,
           name = excluded.name,
           tagline = excluded.tagline,
           hex = excluded.hex,
           family = excluded.family,
           limited = excluded.limited,
           position = excluded.position`,
        [
          `${product.id}__${flavor.id}`,
          product.id,
          flavor.id,
          flavor.name,
          flavor.tagline,
          flavor.hex,
          flavor.family,
          Boolean(flavor.limited),
          position,
        ],
      );
    }

    for (const [position, variant] of product.variants.entries()) {
      await client.query(
        `insert into product_variants (
           id, product_id, flavor_id, sku, size, price_cents, compare_at_cents, stock, weight_g, servings, position
         ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         on conflict (id) do update set
           flavor_id = excluded.flavor_id,
           sku = excluded.sku,
           size = excluded.size,
           price_cents = excluded.price_cents,
           compare_at_cents = excluded.compare_at_cents,
           stock = excluded.stock,
           weight_g = excluded.weight_g,
           servings = excluded.servings,
           position = excluded.position`,
        [
          variant.id,
          product.id,
          `${product.id}__${variant.flavorId}`,
          variant.sku,
          variant.size,
          variant.priceCents,
          variant.compareAtCents ?? null,
          variant.stock,
          variant.weightGrams,
          variant.servings,
          position,
        ],
      );
    }

    await client.query(
      `insert into product_labels (
         product_id, registration, category, serving, servings_per_container, ingredients, allergens, warnings, manufacturer
       ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       on conflict (product_id) do update set
         registration = excluded.registration,
         category = excluded.category,
         serving = excluded.serving,
         servings_per_container = excluded.servings_per_container,
         ingredients = excluded.ingredients,
         allergens = excluded.allergens,
         warnings = excluded.warnings,
         manufacturer = excluded.manufacturer`,
      [
        product.id,
        product.label.registration,
        product.label.category,
        product.label.serving,
        product.label.servingsPerContainer,
        product.label.ingredients,
        product.label.allergens,
        product.label.warnings,
        product.label.manufacturer,
      ],
    );

    await deleteMockChildren(client, replaceMockChildren, "delete from nutrition_rows where product_id = $1", [product.id]);
    for (const [position, row] of product.label.nutrition.entries()) {
      await client.query(
        `insert into nutrition_rows (id, product_id, position, nutrient, amount, daily_value)
         values ($1, $2, $3, $4, $5, $6)`,
        [`${product.id}__nut__${position}`, product.id, position, row.nutrient, row.amount, row.dailyValue ?? null],
      );
    }

    await deleteMockChildren(client, replaceMockChildren, "delete from product_images where product_id = $1", [product.id]);
    for (const [position, flavor] of product.flavors.entries()) {
      await client.query(
        `insert into product_images (id, product_id, flavor_id, url, alt, position, is_cover, fallback_hex)
         values ($1, $2, $3, null, $4, $5, $6, $7)`,
        [`${product.id}__img__${flavor.id}`, product.id, `${product.id}__${flavor.id}`, flavor.name, position, position === 0, flavor.hex],
      );
    }

    await deleteMockChildren(client, replaceMockChildren, "delete from product_goals where product_id = $1", [product.id]);
    for (const goal of product.goals) {
      await client.query("insert into product_goals (product_id, goal_id) values ($1, $2)", [product.id, goal]);
    }

    await deleteMockChildren(client, replaceMockChildren, "delete from product_badges where product_id = $1", [product.id]);
    for (const badge of product.badges) {
      await client.query("insert into product_badges (product_id, badge) values ($1, $2)", [product.id, badge]);
    }
  }

  const productIds = products.map((product) => product.id);
  await deleteMockChildren(client, replaceMockChildren, "delete from kit_items where kit_id = any($1::text[])", [productIds]);
  for (const product of products) {
    for (const [position, item] of (product.kitItems ?? []).entries()) {
      await client.query(
        `insert into kit_items (kit_id, product_id, quantity, position) values ($1, $2, $3, $4)`,
        [product.id, item.productSlug, item.quantity, position],
      );
    }
  }

  const influencerIds = influencers.map((influencer) => influencer.slug);
  await deleteMockChildren(client, replaceMockChildren, "delete from influencer_products where influencer_id = any($1::text[])", [influencerIds]);
  for (const influencer of influencers) {
    for (const [position, productId] of influencer.productSlugs.entries()) {
      await client.query(
        `insert into influencer_products (influencer_id, product_id, position) values ($1, $2, $3)`,
        [influencer.slug, productId, position],
      );
    }
  }

  for (const coupon of coupons) {
    await client.query(
      `insert into coupons (code, label, kind, percent, value, influencer_slug, influencer_id, active, public, updated_at)
       values ($1, $2, $3, $4, $5, $6, $6, $7, $8, now())
       on conflict (code) do update set
         label = excluded.label,
         kind = excluded.kind,
         percent = excluded.percent,
         value = excluded.value,
         influencer_slug = excluded.influencer_slug,
         influencer_id = excluded.influencer_id,
         active = excluded.active,
         public = excluded.public,
         updated_at = now()`,
      [
        coupon.code,
        coupon.label,
        coupon.kind,
        coupon.percent ?? null,
        coupon.percent ?? null,
        coupon.influencerSlug ?? null,
        coupon.active,
        coupon.public === true,
      ],
    );
  }

  for (const post of posts) {
    await client.query(
      `insert into posts (
         slug, title, published_at, payload, excerpt, category, cover_hex, author_name, status, read_minutes, updated_at
       ) values ($1, $2, $3, $4::jsonb, $5, $6, $7, $8, 'publicado', $9, now())
       on conflict (slug) do update set
         title = excluded.title,
         published_at = excluded.published_at,
         payload = excluded.payload,
         excerpt = excluded.excerpt,
         category = excluded.category,
         cover_hex = excluded.cover_hex,
         author_name = excluded.author_name,
         status = excluded.status,
         read_minutes = excluded.read_minutes,
         updated_at = now()`,
      [post.slug, post.title, post.publishedAt, JSON.stringify(post), post.excerpt, post.category, post.coverHex, post.author, post.readMinutes],
    );
  }

  for (const review of reviews) {
    await client.query(
      `insert into reviews (id, product_slug, author, rating, payload, handle, title, body, verified, helpful, created_at)
       values ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9, $10, $11)
       on conflict (id) do update set
         product_slug = excluded.product_slug,
         author = excluded.author,
         rating = excluded.rating,
         payload = excluded.payload,
         handle = excluded.handle,
         title = excluded.title,
         body = excluded.body,
         verified = excluded.verified,
         helpful = excluded.helpful,
         created_at = excluded.created_at`,
      [
        review.id,
        review.productSlug,
        review.author,
        review.rating,
        JSON.stringify(review),
        review.handle,
        review.title,
        review.body,
        review.verified,
        review.helpful,
        review.createdAt,
      ],
    );
  }
}

type Weights = { products: Record<string, number>; goals: Record<string, number> };

const QUIZ_GOAL_STACKS: Record<string, string[]> = {
  hipertrofia: ["shape-whey-isolado", "base-creatina", "caos-pre-treino", "volume-hipercalorico"],
  emagrecimento: ["clear-whey", "corte-termo", "base-creatina", "diaria-multi"],
  energia: ["caos-pre-treino", "pump-intra", "base-creatina"],
  recuperacao: ["night-recuperacao", "shape-whey-isolado", "base-creatina", "omega-3"],
  resistencia: ["pump-intra", "base-creatina", "clear-whey"],
  saude: ["diaria-multi", "omega-3", "base-creatina"],
};

function stackWeights(slugs: string[]): Record<string, number> {
  return Object.fromEntries(slugs.map((slug, index) => [slug, slugs.length - index]));
}

function weights(products: Record<string, number> = {}, goals: Record<string, number> = {}): Weights {
  return { products, goals };
}

async function seedOperations(client: SeedClient, replaceMockChildren: boolean): Promise<void> {
  const questions: { id: string; prompt: string; answerKey: string; options: { value: string; label: string; weights: Weights }[] }[] = [
    {
      id: EXAMPLE_QUIZ_IDS.goal,
      prompt: "Qual é o objetivo agora?",
      answerKey: "goal",
      options: GOALS.map((goal) => ({
        value: goal.id,
        label: goal.label,
        weights: weights(stackWeights(QUIZ_GOAL_STACKS[goal.id] ?? []), { [goal.id]: 1 }),
      })),
    },
    {
      id: EXAMPLE_QUIZ_IDS.days,
      prompt: "Quantos dias você treina?",
      answerKey: "days",
      options: [2, 3, 4, 5, 6].map((days) => ({ value: String(days), label: `${days} dias`, weights: weights() })),
    },
    {
      id: EXAMPLE_QUIZ_IDS.caffeine,
      prompt: "Cafeína, como é?",
      answerKey: "caffeine",
      options: [
        { value: "alta", label: "Quero o máximo", weights: weights({ "caos-pre-treino": 4 }) },
        { value: "media", label: "No meio", weights: weights() },
        { value: "zero", label: "Sem cafeína", weights: weights({ "foco-pre-sem-cafeina": 5, "caos-pre-treino": -5, "corte-termo": -5 }) },
      ],
    },
    {
      id: EXAMPLE_QUIZ_IDS.flavor,
      prompt: "Que sabor te representa?",
      answerKey: "flavor",
      options: [
        { value: "citrica", label: "Cítrico elétrico", weights: weights() },
        { value: "doce", label: "Doce", weights: weights({ "shape-whey-isolado": 1, "clear-whey": 1, "volume-hipercalorico": 1 }) },
        { value: "fruta", label: "Fruta", weights: weights() },
        { value: "neutro", label: "Sem sabor", weights: weights() },
      ],
    },
    {
      id: EXAMPLE_QUIZ_IDS.budget,
      prompt: "Orçamento do mês",
      answerKey: "budget",
      options: [
        { value: "baixo", label: "Até uns R$ 150", weights: weights({ "volume-hipercalorico": -8, "collab-luna": -8, "base-creatina": 3 }) },
        { value: "medio", label: "R$ 150 a 300", weights: weights() },
        { value: "alto", label: "Monta o stack", weights: weights() },
      ],
    },
  ];

  for (const [position, question] of questions.entries()) {
    await client.query(
      `insert into quiz_questions (id, prompt, answer_key, position)
       values ($1, $2, $3, $4)
       on conflict (id) do update set prompt = excluded.prompt, answer_key = excluded.answer_key, position = excluded.position`,
      [question.id, question.prompt, question.answerKey, position],
    );
  }
  await deleteMockChildren(client, replaceMockChildren, "delete from quiz_options where question_id = any($1::text[])", [
    questions.map((question) => question.id),
  ]);
  for (const question of questions) {
    for (const [position, option] of question.options.entries()) {
      await client.query(
        `insert into quiz_options (id, question_id, label, value, position, weights)
         values ($1, $2, $3, $4, $5, $6::jsonb)`,
        [`${question.id}__${option.value}`, question.id, option.label, option.value, position, JSON.stringify(option.weights)],
      );
    }
  }

  for (const [position, prize] of SCRATCH_PRIZES.entries()) {
    await client.query(
      `insert into scratch_prizes (id, label, detail, weight, coupon_code, points, active, position)
       values ($1, $2, $3, $4, $5, $6, true, $7)
       on conflict (id) do update set
         label = excluded.label,
         detail = excluded.detail,
         weight = excluded.weight,
         coupon_code = excluded.coupon_code,
         points = excluded.points,
         active = excluded.active,
         position = excluded.position`,
      [prize.id, prize.label, prize.detail, prize.weight, prize.couponCode ?? null, prize.points ?? null, position],
    );
  }

  const levels = LEVELS.map((level) => ({
    id: level.id,
    name: level.name,
    min_points: level.minPoints,
    multiplier: level.multiplier,
    free_shipping_cents: freeShippingThresholdCents(level.id),
    perks: level.perks,
  }));
  await client.query(
    `insert into loyalty_settings (
       id, points_per_real, pix_points_bonus, point_value_cents, max_points_redeem_ratio,
       welcome_points, free_shipping_cents, pix_discount_percent, kit_discount_percent,
       subscription_default_percent, referrer_points, referred_points, levels, updated_at
     ) values ('padrao', $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, now())
     on conflict (id) do update set
       points_per_real = excluded.points_per_real,
       pix_points_bonus = excluded.pix_points_bonus,
       point_value_cents = excluded.point_value_cents,
       max_points_redeem_ratio = excluded.max_points_redeem_ratio,
       welcome_points = excluded.welcome_points,
       free_shipping_cents = excluded.free_shipping_cents,
       pix_discount_percent = excluded.pix_discount_percent,
       kit_discount_percent = excluded.kit_discount_percent,
       subscription_default_percent = excluded.subscription_default_percent,
       referrer_points = excluded.referrer_points,
       referred_points = excluded.referred_points,
       levels = excluded.levels,
       updated_at = now()`,
    [
      POINTS_PER_REAL,
      String(PIX_POINTS_BONUS),
      POINT_VALUE_CENTS,
      String(MAX_POINTS_REDEEM_RATIO),
      WELCOME_POINTS,
      FREE_SHIPPING_CENTS,
      PIX_DISCOUNT_PERCENT,
      KIT_DISCOUNT_PERCENT,
      SUBSCRIPTION_DEFAULT_PERCENT,
      REFERRER_POINTS,
      REFERRED_POINTS,
      JSON.stringify(levels),
    ],
  );

  for (const banner of exampleBanners(PIX_DISCOUNT_PERCENT)) {
    await client.query(
      `insert into banners (id, slot, title, subtitle, href, position)
       values ($1, $2, $3, $4, $5, $6)
       on conflict (id) do update set
         slot = excluded.slot,
         title = excluded.title,
         subtitle = excluded.subtitle,
         href = excluded.href,
         position = excluded.position`,
      [banner.id, banner.slot, banner.title, banner.subtitle, banner.href, banner.position],
    );
  }

  for (const [position, post] of ugc.entries()) {
    await client.query(
      `insert into ugc_posts (id, author, handle, caption, likes, accent, product_id, position)
       values ($1, $2, $3, $4, $5, $6, $7, $8)
       on conflict (id) do update set
         author = excluded.author,
         handle = excluded.handle,
         caption = excluded.caption,
         likes = excluded.likes,
         accent = excluded.accent,
         product_id = excluded.product_id,
         position = excluded.position`,
      [post.id, post.author, post.handle, post.caption, post.likes, post.accent, post.productSlug ?? null, position],
    );
  }

  for (const [position, video] of videos.entries()) {
    await client.query(
      `insert into video_spots (id, slug, title, caption, duration, frames, transcript, position)
       values ($1, $2, $3, $4, $5, $6, $7, $8)
       on conflict (id) do update set
         slug = excluded.slug,
         title = excluded.title,
         caption = excluded.caption,
         duration = excluded.duration,
         frames = excluded.frames,
         transcript = excluded.transcript,
         position = excluded.position`,
      [video.id, video.slug, video.title, video.caption, video.duration, video.frames, video.transcript, position],
    );
  }
}

async function seedContent(client: SeedClient, replaceMockChildren: boolean): Promise<void> {
  const names = [...new Set(posts.map((post) => post.author))];
  for (const name of names) {
    await client.query(
      `insert into authors (id, name)
       values ($1, $2)
       on conflict (id) do update set name = excluded.name`,
      [exampleAuthorId(name), name],
    );
  }

  for (const post of posts) {
    const id = exampleAuthorId(post.author);
    await client.query("update posts set author_id = $2 where slug = $1", [post.slug, id]);
    await deleteMockChildren(client, replaceMockChildren, "delete from post_blocks where post_id = $1", [post.slug]);
    for (const [position, text] of post.body.entries()) {
      await client.query(
        `insert into post_blocks (id, post_id, position, type, content)
         values ($1, $2, $3, 'paragrafo', $4::jsonb)`,
        [`${post.slug}__p${position}`, post.slug, position, JSON.stringify({ text })],
      );
    }
  }
}

async function upsertDrop(
  client: SeedClient,
  drop: {
    id: string;
    edition: string;
    name: string | null;
    productId: string | null;
    flavorId: string | null;
    endsAt: string;
    unitsLeft: number | null;
    story: string | null;
    status: "em_breve" | "no_ar" | "encerrado";
  },
): Promise<void> {
  await client.query(
    `insert into drops (id, edition, name, product_id, flavor_id, ends_at, units_left, story, status, updated_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())
     on conflict (id) do update set
       edition = excluded.edition,
       name = excluded.name,
       product_id = excluded.product_id,
       flavor_id = excluded.flavor_id,
       ends_at = excluded.ends_at,
       units_left = excluded.units_left,
       story = excluded.story,
       status = excluded.status,
       updated_at = now()`,
    [drop.id, drop.edition, drop.name, drop.productId, drop.flavorId, drop.endsAt, drop.unitsLeft, drop.story, drop.status],
  );
}

async function seedDrops(client: SeedClient): Promise<void> {
  for (const product of products) {
    if (!product.drop) continue;
    const flavor = product.flavors.find((item) => product.drop?.id.endsWith(`-${item.id}`));
    await upsertDrop(client, {
      id: product.drop.id,
      edition: product.drop.edition,
      name: flavor?.name ?? null,
      productId: product.id,
      flavorId: flavor ? `${product.id}__${flavor.id}` : null,
      endsAt: product.drop.endsAt,
      unitsLeft: product.drop.unitsLeft,
      story: flavor?.tagline ?? product.tagline,
      status: product.drop.teaser ? "em_breve" : "no_ar",
    });
  }

  await upsertDrop(client, {
    id: upcomingDrop.id,
    edition: upcomingDrop.edition,
    name: upcomingDrop.name,
    productId: null,
    flavorId: null,
    endsAt: upcomingDrop.endsAt,
    unitsLeft: null,
    story: null,
    status: upcomingDrop.teaser ? "em_breve" : "no_ar",
  });
}

async function writeExampleMarker(client: SeedClient): Promise<void> {
  await client.query(
    `insert into example_seed (id, applied_at, source)
     values ('mock', now(), 'exemplo fictício do mock')
     on conflict (id) do update set applied_at = now(), source = excluded.source`,
  );
}

async function runExampleSeed(client: SeedClient, options?: ExampleSeedOptions): Promise<void> {
  const decision = await inspectExampleSeed(client, options);
  if (!decision.allow || !decision.replaceMockChildren) {
    throw new ExampleSeedRefused(decision.message || "Seed de exemplo recusado. Nada foi regravado.");
  }
  await seedCatalog(client, true);
  await seedOperations(client, true);
  await seedContent(client, true);
  await seedDrops(client);
  await writeExampleMarker(client);
}

async function withTransaction(client: SeedClient, run: () => Promise<void>): Promise<void> {
  await client.query("begin");
  try {
    await run();
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  }
}

function asSeedClient(client: pg.PoolClient): SeedClient {
  return {
    query(text, params) {
      return client.query(text, params);
    },
  };
}

export async function seed(options?: ExampleSeedOptions & { client?: SeedClient }): Promise<void> {
  if (options?.client) {
    await withTransaction(options.client, () => runExampleSeed(options.client as SeedClient, options));
    return;
  }
  loadEnv();
  const pool = getPool();
  const client = await pool.connect();
  const sql = asSeedClient(client);
  try {
    await withTransaction(sql, () => runExampleSeed(sql, options));
  } finally {
    client.release();
  }
}

export async function seedCli(options?: ExampleSeedOptions & { client?: SeedClient }): Promise<number> {
  try {
    await seed(options);
    console.log(EXAMPLE_SEED_OK);
    return 0;
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    return 1;
  }
}

if (process.argv[1] && process.argv[1].includes("seed.ts")) {
  seedCli()
    .then(async (code) => {
      await closePool();
      process.exit(code);
    })
    .catch(async (error: unknown) => {
      console.error(error instanceof Error ? error.message : error);
      await closePool();
      process.exit(1);
    });
}
