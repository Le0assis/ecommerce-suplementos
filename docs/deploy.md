# Deploy

Este guia publica a **demonstração**. Pix, boleto e cartão continuam sandbox. Não aponte um domínio de venda real para este build enquanto o registro ANVISA, a nota e o gateway forem fictícios.

## O que sobe

| Peça | Como | Variáveis |
| --- | --- | --- |
| Site | `pnpm --filter @pulso/web build` e `pnpm --filter @pulso/web start` | `WEB_PORT`, `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_PIX_DISCOUNT`, `NEXT_PUBLIC_FREE_SHIPPING_CENTS`, `API_URL` |
| API | `pnpm --filter @pulso/api start` | `API_PORT`, `API_DATA_SOURCE`, `PAYMENT_GATEWAY`, `DATABASE_URL`, `REDIS_URL`, `ADMIN_SESSION_SECRET` |
| Postgres | serviço gerenciado, Postgres 16 | usuário e senha **novos**, não `pulso`/`pulso` |
| Redis | opcional | se não houver, apague `REDIS_URL` |

`ADMIN_SESSION_SECRET` fica só na API e assina o cookie httpOnly `pulso_admin` por 12 horas. O site repassa esse cookie e não tem senha própria. Não publique de novo uma variável `NEXT_PUBLIC_ADMIN_PASSWORD`. Troque o segredo antes de um domínio público: o exemplo não assina em produção, e a API recusa subir sem `API_DATA_SOURCE=postgres` e `DATABASE_URL`. A conta dono nasce com `pnpm --filter @pulso/db create-owner`.

## Passos

1. No servidor, Node 22 e pnpm 10.33.4 (`corepack prepare pnpm@10.33.4 --activate`).
2. `pnpm install --frozen-lockfile` na raiz.
3. Copie `.env.example` para `.env` e troque `NEXT_PUBLIC_SITE_URL` para o `https` do site. Ajuste `WEB_PORT` se o proxy usar outra porta.
4. `pnpm build`.
5. Suba o Postgres, aponte `DATABASE_URL`, rode `pnpm db:migrate` e `pnpm db:seed` uma vez, e ponha `API_DATA_SOURCE=postgres`. Em produção a API não sobe em modo mock.
6. Suba dois processos: `pnpm start` e `pnpm start:api`. O proxy manda o domínio do site para `WEB_PORT` e, se quiser, `/api` ou um subdomínio para `API_PORT`.
7. Confira `GET /health` da API e a home do site. O teste de ponta a ponta, na máquina de quem desenvolve, é `pnpm --filter @pulso/web exec playwright install chromium` e `pnpm test:e2e`.

O CI (`.github/workflows/ci.yml`) roda lint, typecheck, Vitest e build com `DATA_SOURCE=mock`. Ele não abre browser.

## O que ainda não é produção

- Cobrança sandbox (`mp_sandbox_` / `pm_sandbox_`).
- CEP em tabela local.
- Pedido, conta e analytics no `localStorage`.
- O admin exige a API e uma conta em `admin_users`. Sem banco, o login não abre.
- Registro `NI-DEMO`.
