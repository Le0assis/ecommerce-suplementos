import { coupons, influencers, posts, products, reviews } from "@pulso/data";
import { loadEnv } from "./env";
import { closePool, getPool } from "./pool";

export async function seed(): Promise<void> {
  loadEnv();
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("begin");
    for (const product of products) {
      await client.query(
        `insert into products (id, slug, name, category, active, payload, updated_at)
         values ($1, $2, $3, $4, true, $5::jsonb, now())
         on conflict (id) do update set name = excluded.name, category = excluded.category, payload = excluded.payload, updated_at = now()`,
        [product.id, product.slug, product.name, product.category, JSON.stringify(product)],
      );
    }
    for (const coupon of coupons) {
      await client.query(
        `insert into coupons (code, label, kind, percent, influencer_slug, active)
         values ($1, $2, $3, $4, $5, $6)
         on conflict (code) do update set label = excluded.label, kind = excluded.kind, percent = excluded.percent, active = excluded.active`,
        [coupon.code, coupon.label, coupon.kind, coupon.percent ?? null, coupon.influencerSlug ?? null, coupon.active],
      );
    }
    for (const influencer of influencers) {
      await client.query(
        `insert into influencers (slug, name, handle, coupon_code, payload)
         values ($1, $2, $3, $4, $5::jsonb)
         on conflict (slug) do update set name = excluded.name, payload = excluded.payload`,
        [influencer.slug, influencer.name, influencer.handle, influencer.coupon, JSON.stringify(influencer)],
      );
    }
    for (const post of posts) {
      await client.query(
        `insert into posts (slug, title, published_at, payload)
         values ($1, $2, $3, $4::jsonb)
         on conflict (slug) do update set title = excluded.title, payload = excluded.payload`,
        [post.slug, post.title, post.publishedAt, JSON.stringify(post)],
      );
    }
    for (const review of reviews) {
      await client.query(
        `insert into reviews (id, product_slug, author, rating, payload)
         values ($1, $2, $3, $4, $5::jsonb)
         on conflict (id) do update set rating = excluded.rating, payload = excluded.payload`,
        [review.id, review.productSlug, review.author, review.rating, JSON.stringify(review)],
      );
    }
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
