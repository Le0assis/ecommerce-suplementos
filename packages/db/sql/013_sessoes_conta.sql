-- Sessão revogável da conta do cliente, igual à do admin.
-- O token continua assinado. O jti aponta para esta linha.
-- Logout preenche revoked_at e o bearer deixa de valer na hora.

create table if not exists customer_sessions (
  jti text primary key,
  customer_id text not null references customers (id) on delete cascade,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists customer_sessions_customer_idx on customer_sessions (customer_id);

comment on table customer_sessions is 'Token da conta assinado com jti. Logout preenche revoked_at.';
