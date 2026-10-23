-- Tabelas que o admin ainda não tinha na base, e os índices.
-- Promoções nascem vazias: o preço riscado do mock já está em product_variants.compare_at_cents.
-- video_spots existe porque o mock desta branch tem spots e a tela Social e vídeos pede CRUD.

create table if not exists promotions (
  id text primary key,
  name text not null,
  kind text not null check (kind in ('percent', 'fixed_cents', 'compare_at')),
  value integer not null check (value >= 0),
  target_type text not null check (target_type in ('produto', 'categoria')),
  product_id text references products (id) on delete cascade,
  category_id text references categories (slug),
  starts_at timestamptz,
  ends_at timestamptz,
  badge text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (target_type = 'produto' and product_id is not null and category_id is null)
    or (target_type = 'categoria' and category_id is not null and product_id is null)
  ),
  check (ends_at is null or starts_at is null or ends_at >= starts_at)
);

create table if not exists quiz_questions (
  id text primary key,
  prompt text not null,
  answer_key text not null,
  position integer not null unique
);

create table if not exists quiz_options (
  id text primary key,
  question_id text not null references quiz_questions (id) on delete cascade,
  label text not null,
  value text not null,
  position integer not null,
  weights jsonb not null default '{}'::jsonb,
  unique (question_id, value)
);

create table if not exists scratch_prizes (
  id text primary key,
  label text not null,
  detail text not null,
  weight integer not null check (weight > 0),
  coupon_code text references coupons (code),
  points integer check (points is null or points >= 0),
  active boolean not null default true,
  position integer not null
);

create table if not exists loyalty_settings (
  id text primary key,
  points_per_real integer not null check (points_per_real >= 0),
  pix_points_bonus numeric not null,
  point_value_cents integer not null check (point_value_cents >= 0),
  max_points_redeem_ratio numeric not null,
  welcome_points integer not null check (welcome_points >= 0),
  free_shipping_cents integer not null check (free_shipping_cents >= 0),
  pix_discount_percent integer not null check (pix_discount_percent between 0 and 100),
  kit_discount_percent integer not null check (kit_discount_percent between 0 and 100),
  subscription_default_percent integer not null check (subscription_default_percent between 0 and 100),
  referrer_points integer not null check (referrer_points >= 0),
  referred_points integer not null check (referred_points >= 0),
  levels jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists banners (
  id text primary key,
  slot text not null check (slot in ('hero', 'marquee', 'destaque')),
  title text not null,
  subtitle text,
  href text,
  image_url text,
  accent text,
  position integer not null,
  active boolean not null default true,
  starts_at timestamptz,
  ends_at timestamptz
);

create table if not exists ugc_posts (
  id text primary key,
  author text not null,
  handle text not null,
  caption text not null,
  likes integer not null default 0 check (likes >= 0),
  accent text not null check (accent ~ '^#[0-9a-fA-F]{6}$'),
  product_id text references products (id) on delete set null,
  position integer not null,
  hidden boolean not null default false
);

create table if not exists video_spots (
  id text primary key,
  slug text not null unique,
  title text not null,
  caption text not null,
  duration text not null,
  frames text[] not null check (
    cardinality(frames) = 3
    and frames[1] ~ '^#[0-9a-fA-F]{6}$'
    and frames[2] ~ '^#[0-9a-fA-F]{6}$'
    and frames[3] ~ '^#[0-9a-fA-F]{6}$'
  ),
  transcript text[] not null,
  position integer not null,
  hidden boolean not null default false
);

create index if not exists products_category_id_idx on products (category_id);
create index if not exists products_status_idx on products (status);
create index if not exists products_influencer_idx on products (influencer_id);
create index if not exists product_flavors_product_idx on product_flavors (product_id);
create index if not exists product_variants_product_idx on product_variants (product_id);
create index if not exists product_variants_flavor_idx on product_variants (flavor_id);
create index if not exists product_images_product_idx on product_images (product_id);
create index if not exists product_goals_goal_idx on product_goals (goal_id);
create index if not exists kit_items_product_idx on kit_items (product_id);
create index if not exists influencer_products_product_idx on influencer_products (product_id);
create index if not exists coupons_influencer_idx on coupons (influencer_id);
create index if not exists coupons_active_idx on coupons (active);
create index if not exists posts_status_idx on posts (status, published_at);
create index if not exists reviews_status_idx on reviews (status);
create index if not exists orders_status_idx on orders (status);
create index if not exists orders_customer_idx on orders (customer_id);
create index if not exists audit_log_actor_idx on audit_log (actor_id, created_at);
create index if not exists audit_log_entity_idx on audit_log (entity, entity_id);
create index if not exists promotions_window_idx on promotions (starts_at, ends_at);
create index if not exists quiz_options_question_idx on quiz_options (question_id);
create index if not exists scratch_prizes_active_idx on scratch_prizes (active);
create index if not exists banners_slot_idx on banners (slot, position);
create index if not exists ugc_posts_product_idx on ugc_posts (product_id);
create index if not exists video_spots_position_idx on video_spots (position);
