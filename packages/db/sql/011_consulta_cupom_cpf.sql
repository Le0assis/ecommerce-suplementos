-- Fecha buracos de consulta sem apagar linha e sem reescrever dado antigo.
-- coupons.public nasce false: cupom que já existia não entra na lista anunciada.
-- O seed de exemplo marca os códigos públicos do mock. O admin ainda não grava essa coluna.
-- Índices: lista pública de cupom, troca de slug da assinatura, variante da assinatura,
-- e o backfill do CPF em claro (cpf preenchido).

alter table coupons
  add column if not exists public boolean not null default false;

comment on column coupons.public is 'true entra na lista anunciada. O padrão false esconde raspadinha e cupom interno.';

create index if not exists coupons_public_code_idx
  on coupons (code)
  where active = true and public = true;

create index if not exists subscriptions_product_slug_idx on subscriptions (product_slug);
create index if not exists subscriptions_variant_idx on subscriptions (variant_id);

create index if not exists customers_cpf_plain_idx
  on customers (id)
  where cpf is not null and btrim(cpf) <> '';
