-- Autores, blocos do blog e a mídia da collab.
-- O mock só tem parágrafos e a bio do atleta. Frases e fotos ficam vazias
-- até o admin preencher: não inventamos fala nem imagem de pessoa.
--
-- content do bloco:
--   paragrafo        {"text"}
--   titulo           {"text"}
--   imagem           {"url","alt","caption"}
--   citacao_lateral  {"text","side":"esquerda"|"direita"}
--   produto          {"product_id"}

create table if not exists authors (
  id text primary key,
  name text not null,
  photo_url text,
  bio text,
  influencer_id text references influencers (slug) on delete set null,
  created_at timestamptz not null default now()
);

alter table posts
  add column if not exists author_id text references authors (id),
  add column if not exists seo_title text,
  add column if not exists seo_description text,
  add column if not exists share_image_url text;

create table if not exists post_blocks (
  id text primary key,
  post_id text not null references posts (slug) on delete cascade,
  position integer not null,
  type text not null check (type in ('paragrafo', 'titulo', 'imagem', 'citacao_lateral', 'produto')),
  content jsonb not null,
  unique (post_id, position)
);

create table if not exists influencer_quotes (
  id text primary key,
  influencer_id text not null references influencers (slug) on delete cascade,
  body text not null check (char_length(btrim(body)) > 0),
  position integer not null,
  unique (influencer_id, position)
);

create table if not exists influencer_images (
  id text primary key,
  influencer_id text not null references influencers (slug) on delete cascade,
  url text,
  alt text not null check (char_length(btrim(alt)) > 0),
  caption text,
  instagram_post_url text,
  fallback_hex text check (fallback_hex is null or fallback_hex ~ '^#[0-9a-fA-F]{6}$'),
  position integer not null,
  unique (influencer_id, position)
);

create index if not exists authors_influencer_idx on authors (influencer_id);
create index if not exists posts_author_idx on posts (author_id);
create index if not exists post_blocks_post_idx on post_blocks (post_id, position);
create index if not exists influencer_quotes_influencer_idx on influencer_quotes (influencer_id, position);
create index if not exists influencer_images_influencer_idx on influencer_images (influencer_id, position);
