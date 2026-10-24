-- Marcador do seed de exemplo. Não guarda cliente, pedido nem senha.
-- applied_at é a hora da última gravação liberada pelo portão.
-- Edição posterior fica com updated_at na frente, e o seed seguinte recusa.

create table if not exists example_seed (
  id text primary key,
  applied_at timestamptz not null,
  source text not null
);

comment on table example_seed is 'Marcador do seed fictício do mock. Não é cadastro de produção.';
comment on column example_seed.applied_at is 'Instante da última gravação do exemplo. Edição do admin fica com updated_at maior.';
comment on column example_seed.source is 'Origem do exemplo. Hoje é o mock da vitrine.';
