# Como rodar, testar e publicar

O passo a passo para quem está instalando a primeira vez, com Windows, Linux e macOS, está no [README da raiz](../README.md). Aqui é o cartão de comandos.

## Todo dia

```bash
pnpm install          # só quando o lockfile mudar
pnpm dev              # site em http://127.0.0.1:43123
pnpm dev:api          # API em http://127.0.0.1:8787
pnpm dev:all          # os dois
```

Sem Docker a loja abre. Com banco:

```bash
pnpm db:up
pnpm db:migrate
pnpm db:seed
```

No `.env`, `API_DATA_SOURCE=postgres` faz a API ler `products.payload`. A vitrine continua no mock até as páginas usarem `loadStorefront`.

## Qualidade

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm --filter @pulso/web build
```

CI: `.github/workflows/ci.yml` em push e pull request. Node 22, pnpm 10.33.4, lockfile congelado, `DATA_SOURCE=mock`. Não sobe Postgres.

`pnpm test:e2e` usa Playwright. Instale o Chromium com `pnpm --filter @pulso/web exec playwright install chromium`. Publicar a demo: [deploy.md](deploy.md).

## Produção local

```bash
pnpm build
pnpm start            # next start na WEB_PORT
pnpm start:api        # tsx, sem pasta dist
```

## Deploy (alvo, não automatizado)

Ainda não há Dockerfile de app nem projeto na Vercel. Quando for publicar:

1. Site: Next.js com as `NEXT_PUBLIC_*` do ambiente e `WEB_PORT` definido pelo host. Build command `pnpm --filter @pulso/web build`.
2. API: processo Node `pnpm --filter @pulso/api start`, `API_PORT` atrás do proxy.
3. Postgres gerenciado. Rode `pnpm db:migrate` e `pnpm db:seed` uma vez. Não use a senha `pulso` fora da máquina local.
4. Redis gerenciado, ou apague `REDIS_URL` para seguir sem cache.
5. Não publique `NEXT_PUBLIC_ADMIN_PASSWORD` como se fosse senha de operação. Troque o admin por sessão de servidor antes do domínio real.
6. Domínio e `NEXT_PUBLIC_SITE_URL` iguais, senão o sitemap aponta para o localhost.

Até a fase 3 do roadmap, o deploy continua sendo uma vitrine de demonstração: Pix não liquida.
