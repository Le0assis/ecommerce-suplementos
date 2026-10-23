-- A chave do bloco deixa de ser só o id (004).
-- O uuid que o painel manda continua sendo o id, e pode repetir em outro post.
-- No mesmo post o id continua único. Rodar de novo não troca a chave composta.

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conrelid = 'post_blocks'::regclass
      and conname = 'post_blocks_pkey'
      and array_length(conkey, 1) = 1
  ) then
    alter table post_blocks drop constraint post_blocks_pkey;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'post_blocks'::regclass
      and contype = 'p'
  ) then
    alter table post_blocks alter column id set not null;
    alter table post_blocks add constraint post_blocks_pkey primary key (post_id, id);
  end if;
end $$;
