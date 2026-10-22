-- Esquema alvo da PULSO. O protótipo lê o catálogo pelo JSON em products.payload.
-- Pedidos, pontos e clientes já nascem normalizados para a fase com Medusa ou API própria.

create table if not exists products (
  id text primary key,
  slug text not null unique,
  name text not null,
  category text not null,
  active boolean not null default true,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists coupons (
  code text primary key,
  label text not null,
  kind text not null check (kind in ('percent', 'shipping')),
  percent integer,
  influencer_slug text,
  active boolean not null default true
);

create table if not exists influencers (
  slug text primary key,
  name text not null,
  handle text not null,
  coupon_code text not null,
  payload jsonb not null
);

create table if not exists posts (
  slug text primary key,
  title text not null,
  published_at date not null,
  payload jsonb not null
);

create table if not exists reviews (
  id text primary key,
  product_slug text not null references products (slug) on delete cascade,
  author text not null,
  rating integer not null check (rating between 1 and 5),
  payload jsonb not null
);

create table if not exists customers (
  id text primary key,
  email text not null unique,
  name text not null,
  cpf text,
  phone text,
  points_balance integer not null default 0,
  points_lifetime integer not null default 0,
  marketing_opt_in boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists addresses (
  id text primary key,
  customer_id text not null references customers (id) on delete cascade,
  cep text not null,
  street text not null,
  number text not null,
  complement text,
  neighborhood text not null,
  city text not null,
  state char(2) not null,
  is_default boolean not null default false
);

create table if not exists orders (
  id text primary key,
  code text not null unique,
  customer_id text references customers (id),
  email text not null,
  status text not null check (status in ('pagamento_pendente', 'pago', 'separando', 'enviado', 'entregue', 'cancelado')),
  payment_method text not null check (payment_method in ('pix', 'boleto', 'card')),
  subtotal_cents integer not null,
  discount_cents integer not null default 0,
  pix_cents integer not null default 0,
  shipping_cents integer not null default 0,
  total_cents integer not null,
  points_earned integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists order_lines (
  id text primary key,
  order_id text not null references orders (id) on delete cascade,
  product_slug text not null,
  variant_id text not null,
  name text not null,
  quantity integer not null check (quantity > 0),
  unit_price_cents integer not null
);

create table if not exists payments (
  id text primary key,
  order_id text not null references orders (id) on delete cascade,
  provider text not null,
  method text not null,
  status text not null,
  amount_cents integer not null,
  external_id text,
  created_at timestamptz not null default now()
);

create table if not exists shipments (
  id text primary key,
  order_id text not null references orders (id) on delete cascade,
  method text not null,
  price_cents integer not null,
  tracking_code text,
  status text not null
);

create table if not exists points_ledger (
  id text primary key,
  customer_id text not null references customers (id) on delete cascade,
  delta integer not null,
  reason text not null,
  order_id text references orders (id),
  created_at timestamptz not null default now()
);

create table if not exists wishlist_items (
  customer_id text not null references customers (id) on delete cascade,
  product_slug text not null,
  created_at timestamptz not null default now(),
  primary key (customer_id, product_slug)
);

create table if not exists subscriptions (
  id text primary key,
  customer_id text not null references customers (id) on delete cascade,
  product_slug text not null,
  variant_id text not null,
  quantity integer not null,
  unit_price_cents integer not null,
  interval_days integer not null default 30,
  status text not null check (status in ('ativa', 'pausada', 'cancelada')),
  next_charge_on date not null
);

create index if not exists products_category_idx on products (category);
create index if not exists reviews_product_idx on reviews (product_slug);
create index if not exists orders_email_idx on orders (email);
create index if not exists points_customer_idx on points_ledger (customer_id);
