-- Drops e lista de espera.
-- LGPD: e-mail é o único dado pessoal. Consentimento é explícito (sem default),
-- com data e origem. A origem identifica o formulário e a versão do texto,
-- por exemplo pagina_drops:v1. Não há nome, telefone, CPF, IP nem user agent.
-- Um e-mail ativo por drop. anonymized_at marca a anonimização.
-- erase_drop_waitlist apaga. anonymize_drop_waitlist troca o e-mail por um
-- túmulo que não entrega mensagem (domínio .invalid).

create table if not exists drops (
  id text primary key,
  edition text not null,
  name text,
  product_id text references products (id) on delete set null,
  flavor_id text references product_flavors (id) on delete set null,
  starts_at timestamptz,
  ends_at timestamptz,
  units_total integer check (units_total is null or units_total >= 0),
  units_left integer check (units_left is null or units_left >= 0),
  teaser text,
  hero_image_url text,
  story text,
  status text not null default 'em_breve' check (status in ('em_breve', 'no_ar', 'encerrado')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or starts_at is null or ends_at >= starts_at),
  check (units_total is null or units_left is null or units_left <= units_total)
);

comment on table drops is 'Edição limitada. units_total fica nulo quando o mock só conhece o que ainda resta.';
comment on column drops.product_id is 'Nulo no teaser que ainda não tem produto.';
comment on column drops.flavor_id is 'Nulo quando a edição cobre mais de um sabor.';

create table if not exists drop_waitlist (
  id text primary key default gen_random_uuid()::text,
  drop_id text not null references drops (id) on delete cascade,
  email text not null,
  consent boolean not null check (consent),
  consent_at timestamptz not null,
  consent_origin text not null check (char_length(btrim(consent_origin)) between 1 and 80),
  anonymized_at timestamptz,
  created_at timestamptz not null default now(),
  check (email = lower(email)),
  check (char_length(email) between 3 and 320),
  check (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  check (anonymized_at is null or email like 'anon+%@apagado.invalid')
);

comment on table drop_waitlist is 'Lista de espera. Só e-mail, drop e o registro do consentimento.';
comment on column drop_waitlist.consent is 'Precisa ser true no insert. Não tem default.';
comment on column drop_waitlist.consent_origin is 'Formulário e versão do texto aceito, ex.: pagina_drops:v1.';
comment on column drop_waitlist.anonymized_at is 'Preenchido pela rotina de anonimização. A exclusão apaga a linha.';

create unique index if not exists drop_waitlist_email_ativo_idx
  on drop_waitlist (drop_id, email)
  where anonymized_at is null;

create index if not exists drop_waitlist_email_idx on drop_waitlist (email);
create index if not exists drops_status_idx on drops (status, ends_at);
create index if not exists drops_product_idx on drops (product_id);

create or replace function drop_waitlist_normalize()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.anonymized_at is null then
    new.email := lower(btrim(new.email));
  end if;
  new.consent_origin := btrim(new.consent_origin);
  return new;
end;
$$;

drop trigger if exists drop_waitlist_normalize_trg on drop_waitlist;
create trigger drop_waitlist_normalize_trg
  before insert or update on drop_waitlist
  for each row
  execute function drop_waitlist_normalize();

create or replace function erase_drop_waitlist(p_email text)
returns integer
language plpgsql
set search_path = public
as $$
declare
  removed integer;
begin
  if p_email is null or btrim(p_email) = '' then
    raise exception 'informe o e-mail para exclusão';
  end if;
  delete from drop_waitlist
  where anonymized_at is null
    and email = lower(btrim(p_email));
  get diagnostics removed = row_count;
  return removed;
end;
$$;

comment on function erase_drop_waitlist(text) is 'Apaga toda inscrição ativa desse e-mail. Linha já anonimizada não dá para achar pelo e-mail.';

create or replace function erase_drop_waitlist_entry(p_id text)
returns integer
language plpgsql
set search_path = public
as $$
declare
  removed integer;
begin
  delete from drop_waitlist where id = p_id;
  get diagnostics removed = row_count;
  return removed;
end;
$$;

comment on function erase_drop_waitlist_entry(text) is 'Apaga uma inscrição pelo id, inclusive se já foi anonimizada.';

create or replace function anonymize_drop_waitlist(p_email text)
returns integer
language plpgsql
set search_path = public
as $$
declare
  updated integer;
begin
  if p_email is null or btrim(p_email) = '' then
    raise exception 'informe o e-mail para anonimização';
  end if;
  update drop_waitlist
  set
    email = 'anon+' || id || '@apagado.invalid',
    anonymized_at = now()
  where anonymized_at is null
    and email = lower(btrim(p_email));
  get diagnostics updated = row_count;
  return updated;
end;
$$;

comment on function anonymize_drop_waitlist(text) is 'Troca o e-mail por um identificador opaco e marca anonymized_at. A contagem da lista continua.';
