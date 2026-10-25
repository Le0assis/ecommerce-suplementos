-- Colunas para o CPF cifrado. customers.cpf, em claro, permanece como está.
-- O Backend grava o AES-256-GCM em cpf_enc, o id da chave em cpf_key_id
-- e o HMAC-SHA256 do CPF normalizado em cpf_hash. O backfill é no aplicativo.
-- Esta migração não lê, não copia e não reescreve linha existente.
-- Tirar a coluna cpf em claro é etapa futura, só com o OK do Léo.

alter table customers
  add column if not exists cpf_enc bytea,
  add column if not exists cpf_key_id text,
  add column if not exists cpf_hash text;

create unique index if not exists customers_cpf_hash_key
  on customers (cpf_hash)
  where cpf_hash is not null;

comment on column customers.cpf_enc is 'CPF cifrado com AES-256-GCM. O backfill é do aplicativo.';
comment on column customers.cpf_key_id is 'Identificador da chave usada em cpf_enc.';
comment on column customers.cpf_hash is 'HMAC-SHA256 do CPF normalizado, para busca sem decifrar.';
