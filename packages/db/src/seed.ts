import { CATEGORIES, GOALS } from "@pulso/domain";
import { coupons, influencers, posts, products, reviews } from "@pulso/data";
import type pg from "pg";
import { loadEnv } from "./env";
import { closePool, getPool } from "./pool";

// O seed espelha o mock. Rodar de novo atualiza esses campos e não duplica.
// Não zera uses do cupom, resposta de avaliação, nem a senha do admin.

function instagramUrl(handle: string): string {
  return `https://instagram.com/${handle.replace(/^@/, "")}`;
}

async function seedCatalog(client: pg.PoolClient): Promise<void> {
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

    await client.query("delete from nutrition_rows where product_id = $1", [product.id]);
    for (const [position, row] of product.label.nutrition.entries()) {
      await client.query(
        `insert into nutrition_rows (id, product_id, position, nutrient, amount, daily_value)
         values ($1, $2, $3, $4, $5, $6)`,
        [`${product.id}__nut__${position}`, product.id, position, row.nutrient, row.amount, row.dailyValue ?? null],
      );
    }

    await client.query("delete from product_images where product_id = $1", [product.id]);
    for (const [position, flavor] of product.flavors.entries()) {
      await client.query(
        `insert into product_images (id, product_id, flavor_id, url, alt, position, is_cover, fallback_hex)
         values ($1, $2, $3, null, $4, $5, $6, $7)`,
        [`${product.id}__img__${flavor.id}`, product.id, `${product.id}__${flavor.id}`, flavor.name, position, position === 0, flavor.hex],
      );
    }

    await client.query("delete from product_goals where product_id = $1", [product.id]);
    for (const goal of product.goals) {
      await client.query("insert into product_goals (product_id, goal_id) values ($1, $2)", [product.id, goal]);
    }

    await client.query("delete from product_badges where product_id = $1", [product.id]);
    for (const badge of product.badges) {
      await client.query("insert into product_badges (product_id, badge) values ($1, $2)", [product.id, badge]);
    }
  }

  const productIds = products.map((product) => product.id);
  await client.query("delete from kit_items where kit_id = any($1::text[])", [productIds]);
  for (const product of products) {
    for (const [position, item] of (product.kitItems ?? []).entries()) {
      await client.query(
        `insert into kit_items (kit_id, product_id, quantity, position) values ($1, $2, $3, $4)`,
        [product.id, item.productSlug, item.quantity, position],
      );
    }
  }

  const influencerIds = influencers.map((influencer) => influencer.slug);
  await client.query("delete from influencer_products where influencer_id = any($1::text[])", [influencerIds]);
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
      `insert into coupons (code, label, kind, percent, value, influencer_slug, influencer_id, active, updated_at)
       values ($1, $2, $3, $4, $5, $6, $6, $7, now())
       on conflict (code) do update set
         label = excluded.label,
         kind = excluded.kind,
         percent = excluded.percent,
         value = excluded.value,
         influencer_slug = excluded.influencer_slug,
         influencer_id = excluded.influencer_id,
         active = excluded.active,
         updated_at = now()`,
      [coupon.code, coupon.label, coupon.kind, coupon.percent ?? null, coupon.percent ?? null, coupon.influencerSlug ?? null, coupon.active],
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

export async function seed(): Promise<void> {
  loadEnv();
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("begin");
    await seedCatalog(client);
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

if (process.argv[1] && process.argv[1].includes("seed")) {
  seed()
    .then(async () => {
      console.log("Catálogo gravado no Postgres.");
      await closePool();
    })
    .catch(async (error: unknown) => {
      console.error(error instanceof Error ? error.message : error);
      await closePool();
      process.exit(1);
    });
}
