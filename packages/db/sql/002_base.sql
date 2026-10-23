-- Base do admin. Estende o que 001_init.sql já criou.
-- O payload jsonb continua: a API atual ainda lê products.payload.
-- Colunas novas guardam o mesmo mock em forma de tabela.
-- Senha de admin não entra aqui. A conta dono nasce em src/create-owner.ts.

create table if not exists categories (
  slug text primary key,
  name text not null,
  blurb text,
  image_url text,
  position integer not null
);

create table if not exists goals (
  slug text primary key,
  name text not null,
  blurb text,
  image_url text,
  position integer not null
);

alter table products
  add column if not exists line text,
  add column if not exists tagline text,
  add column if not exists description text,
  add column if not exists how_to_use text,
  add column if not exists category_id text references categories (slug),
  add column if not exists status text not null default 'ativo' check (status in ('rascunho', 'ativo', 'oculto', 'arquivado')),
  add column if not exists caffeine_mg integer not null default 0 check (caffeine_mg >= 0),
  add column if not exists protein_g integer not null default 0 check (protein_g >= 0),
  add column if not exists influencer_id text references influencers (slug) on delete set null,
  add column if not exists subscription_enabled boolean not null default true,
  add column if not exists subscription_discount_percent integer not null default 10 check (subscription_discount_percent between 0 and 100),
  add column if not exists subscription_interval_days integer not null default 30 check (subscription_interval_days > 0),
  add column if not exists is_kit boolean not null default false;

-- active (001) segue sendo o filtro de read.ts. status é o estado do admin:
-- rascunho, ativo, oculto ou arquivado. Apagar produto vira arquivado.

create table if not exists product_flavors (
  id text primary key,
  product_id text not null references products (id) on delete cascade,
  slug text not null,
  name text not null,
  tagline text not null,
  hex text not null check (hex ~ '^#[0-9a-fA-F]{6}$'),
  family text not null check (family in ('citrica', 'doce', 'fruta', 'neutro', 'chocolate')),
  limited boolean not null default false,
  position integer not null,
  unique (product_id, slug)
);

create table if not exists product_variants (
  id text primary key,
  product_id text not null references products (id) on delete cascade,
  flavor_id text not null references product_flavors (id) on delete cascade,
  sku text not null unique,
  size text not null,
  price_cents integer not null check (price_cents >= 0),
  compare_at_cents integer check (compare_at_cents is null or compare_at_cents >= 0),
  stock integer not null check (stock >= 0),
  weight_g integer not null check (weight_g >= 0),
  servings integer not null check (servings > 0),
  position integer not null
);

create table if not exists product_labels (
  product_id text primary key references products (id) on delete cascade,
  registration text not null,
  category text not null,
  serving text not null,
  servings_per_container integer not null check (servings_per_container > 0),
  ingredients text not null,
  allergens text not null,
  warnings text[] not null,
  manufacturer text not null
);

create table if not exists nutrition_rows (
  id text primary key,
  product_id text not null references product_labels (product_id) on delete cascade,
  position integer not null,
  nutrient text not null,
  amount text not null,
  daily_value text,
  unique (product_id, position)
);

-- url fica nula enquanto a foto for só a cor do mock. alt é obrigatório.
create table if not exists product_images (
  id text primary key,
  product_id text not null references products (id) on delete cascade,
  flavor_id text references product_flavors (id) on delete cascade,
  url text,
  alt text not null,
  position integer not null,
  is_cover boolean not null default false,
  fallback_hex text check (fallback_hex is null or fallback_hex ~ '^#[0-9a-fA-F]{6}$'),
  unique (product_id, position)
);

create table if not exists product_goals (
  product_id text not null references products (id) on delete cascade,
  goal_id text not null references goals (slug),
  primary key (product_id, goal_id)
);

create table if not exists product_badges (
  product_id text not null references products (id) on delete cascade,
  badge text not null check (badge in ('drop', 'limited', 'bestseller', 'novo', 'collab')),
  primary key (product_id, badge)
);

create table if not exists kit_items (
  kit_id text not null references products (id) on delete cascade,
  product_id text not null references products (id) on delete restrict,
  quantity integer not null check (quantity > 0),
  position integer not null,
  primary key (kit_id, product_id)
);

alter table influencers
  add column if not exists instagram_url text,
  add column if not exists city text,
  add column if not exists sport text,
  add column if not exists bio text,
  add column if not exists story text,
  add column if not exists followers text,
  add column if not exists accent text check (accent is null or accent ~ '^#[0-9a-fA-F]{6}$'),
  add column if not exists discount_percent integer check (discount_percent is null or discount_percent between 0 and 100),
  add column if not exists active boolean not null default true,
  add column if not exists updated_at timestamptz not null default now();

create table if not exists influencer_products (
  influencer_id text not null references influencers (slug) on delete cascade,
  product_id text not null references products (id) on delete cascade,
  position integer not null,
  primary key (influencer_id, product_id)
);

alter table coupons
  add column if not exists value integer check (value is null or value >= 0),
  add column if not exists min_cents integer check (min_cents is null or min_cents >= 0),
  add column if not exists starts_at timestamptz,
  add column if not exists ends_at timestamptz,
  add column if not exists max_uses integer check (max_uses is null or max_uses > 0),
  add column if not exists uses integer not null default 0 check (uses >= 0),
  add column if not exists influencer_id text references influencers (slug) on delete set null,
  add column if not exists updated_at timestamptz not null default now();

-- Cupom usado não sai. Quem nunca foi usado pode ser apagado de verdade.
create or replace function prevent_delete_used_coupon()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.uses > 0 then
    raise exception 'cupom % já foi usado e não pode ser apagado', old.code;
  end if;
  return old;
end;
$$;

drop trigger if exists coupons_prevent_used_delete on coupons;
create trigger coupons_prevent_used_delete
  before delete on coupons
  for each row
  execute function prevent_delete_used_coupon();

alter table posts
  add column if not exists excerpt text,
  add column if not exists category text,
  add column if not exists cover_url text,
  add column if not exists cover_hex text check (cover_hex is null or cover_hex ~ '^#[0-9a-fA-F]{6}$'),
  add column if not exists author_name text,
  add column if not exists influencer_id text references influencers (slug) on delete set null,
  add column if not exists status text not null default 'publicado' check (status in ('rascunho', 'agendado', 'publicado', 'arquivado')),
  add column if not exists read_minutes integer check (read_minutes is null or read_minutes > 0),
  add column if not exists updated_at timestamptz not null default now();

alter table reviews
  add column if not exists handle text,
  add column if not exists title text,
  add column if not exists body text,
  add column if not exists verified boolean not null default false,
  add column if not exists helpful integer not null default 0 check (helpful >= 0),
  add column if not exists created_at timestamptz,
  add column if not exists status text not null default 'aprovada' check (status in ('pendente', 'aprovada', 'oculta')),
  add column if not exists reply text,
  add column if not exists replied_at timestamptz;

create table if not exists admin_users (
  id text primary key,
  email text not null unique check (email = lower(email) and position('@' in email) > 1),
  name text not null,
  password_hash text not null,
  role text not null check (role in ('dono', 'editor', 'atendimento')),
  active boolean not null default true,
  failed_attempts integer not null default 0 check (failed_attempts >= 0),
  locked_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table admin_users is 'Login do admin. Hash scrypt. A sessão é cookie assinado, sem tabela. A conta dono não é semeada.';
comment on column admin_users.failed_attempts is 'Tentativas de senha errada. O aplicativo trava locked_until.';
comment on column admin_users.password_hash is 'Formato scrypt$N$r$p$salt$hash. Nunca grave senha pura.';

create table if not exists audit_log (
  id text primary key default gen_random_uuid()::text,
  actor_id text references admin_users (id) on delete set null,
  action text not null,
  entity text not null,
  entity_id text,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now()
);

comment on table audit_log is 'Quem mudou o quê e quando. Sem IP.';
