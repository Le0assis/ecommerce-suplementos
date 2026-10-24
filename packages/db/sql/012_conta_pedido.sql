-- Conta e pedido no servidor, em cima das tabelas que já existem.
-- accounts do Backend é customers. Não cria tabela accounts.
-- orders já existe: account_id e items entram nulos. customer_id e order_lines ficam.
-- CPF cifrado já está em customers (010): cpf_enc, cpf_key_id, cpf_hash
-- e o índice único parcial customers_cpf_hash_key. Esta migração não os repete.
-- customers.cpf em claro continua. Tirar essa coluna segue pendente do OK do Léo.
-- Não apaga linha, não copia customer_id para account_id e não reescreve total antigo.
-- O status já tem CHECK na 001 (pagamento_pendente, pago, separando, enviado, entregue, cancelado).

alter table customers
  add column if not exists password_hash text;

comment on column customers.password_hash is 'scrypt, o mesmo formato de admin_users. Nulo até a pessoa definir senha.';

-- lower(email) único só sem repetição. Com duplicata, avisa a contagem e não cria o índice.
do $$
declare
  grupos bigint;
  linhas bigint;
begin
  select count(*), coalesce(sum(qtd), 0)
    into grupos, linhas
  from (
    select count(*) as qtd
    from customers
    group by lower(email)
    having count(*) > 1
  ) repetidos;

  if grupos > 0 then
    raise notice 'customers lower(email): % grupos e % linhas repetidas. Índice único não criado.', grupos, linhas;
  elsif to_regclass('customers_email_lower_key') is null then
    execute 'create unique index customers_email_lower_key on customers (lower(email))';
  end if;
end $$;

alter table orders
  add column if not exists account_id text,
  add column if not exists items jsonb;

comment on column orders.account_id is 'Conta da loja. FK para customers.id. Pedido antigo permanece nulo.';
comment on column orders.items is 'Snapshot jsonb. As linhas normalizadas continuam em order_lines. Nulo até o aplicativo gravar.';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'orders'::regclass
      and conname = 'orders_account_id_fkey'
  ) then
    alter table orders
      add constraint orders_account_id_fkey
      foreign key (account_id) references customers (id)
      not valid;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'orders'::regclass
      and conname = 'orders_total_cents_nonneg'
  ) then
    alter table orders
      add constraint orders_total_cents_nonneg
      check (total_cents >= 0)
      not valid;
  end if;
end $$;

create index if not exists orders_account_created_idx
  on orders (account_id, created_at desc);
