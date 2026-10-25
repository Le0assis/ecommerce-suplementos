-- Sessão revogável do admin e rascunho de post sem data.
-- O cookie continua assinado. O jti aponta para esta linha.
-- Logout preenche revoked_at e o bearer deixa de valer na hora.

create table if not exists admin_sessions (
  jti text primary key,
  user_id text not null references admin_users (id) on delete cascade,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists admin_sessions_user_idx on admin_sessions (user_id);

comment on table admin_sessions is 'Cookie assinado com jti. Logout preenche revoked_at.';

alter table posts alter column published_at drop not null;
