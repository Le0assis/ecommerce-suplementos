# Estrutura de pastas

```
.
├── AGENTS.md                 mapa para agentes
├── README.md                 instalação do zero
├── package.json              scripts da raiz (dev, test, db)
├── pnpm-workspace.yaml
├── pnpm-lock.yaml
├── turbo.json
├── docker-compose.yml        postgres:16 e redis:7
├── .env.example              todas as variáveis comentadas
├── .nvmrc                    22
├── .github/workflows/ci.yml
├── scripts/
│   ├── ensure-env.mjs        copia .env.example se faltar .env
│   ├── next.mjs              next dev/start na WEB_PORT
│   └── wait-for-postgres.mjs
├── apps/
│   ├── web/                  Next.js, a loja
│   └── api/                  Hono
├── packages/
│   ├── domain/               regras puras
│   ├── data/                 catálogo fictício
│   └── db/                   SQL, migrate, seed, pool
└── docs/                     esta pasta
```

## `apps/web/src`

```
app/
  layout.tsx                  fontes, provider, gaveta, banner, toast
  globals.css                 tokens
  (loja)/                     header, footer, bottom nav
    page.tsx                  home
    loja/  objetivos/  busca/  quiz/  calculadora/  kits/
    carrinho/  checkout/  pedido/confirmado/  rastreio/
    conta/  favoritos/  entrar/  criar-conta/
    drops/  atletas/  raspadinha/  blog/  social/
    sobre/  privacidade/  entrega/  trocas/  rotulos/  ajuda/  admin/
  sitemap.ts  robots.ts  icon.tsx
components/
  ui/                         shadcn
  layout/chrome.tsx           header, footer, carrinho, cookie
  product/                    card e buy box
  home/  catalog/  checkout/  account/  experiences/  gamification/  brand/
server/catalog.ts             loadStorefront (ainda não usado pelas páginas)
lib/
  store.ts                    Zustand
  demo.ts                     Ana e o pedido demo
  config.ts                   lê NEXT_PUBLIC_*
```

Rotas de cliente que precisam de `<title>` e não exportam metadata no page (`drops`, `carrinho`) têm um `layout.tsx` mínimo ao lado.

## `packages/domain/src`

`money.ts`, `validators.ts`, `loyalty.ts`, `shipping.ts`, `installments.ts`, `quote.ts`, `calculators.ts`, `quiz.ts`, `scratch.ts`, `types.ts`, `domain.test.ts`.

## `packages/data/src`

`catalog.ts` (os 14 produtos), `reviews.ts`, `content.ts`, `coupons.ts`, `query.ts`, `index.ts`.

## `packages/db`

`sql/001_init.sql`, `src/migrate.ts`, `src/seed.ts`, `src/read.ts`, `src/pool.ts`, `src/env.ts`.

## `apps/api/src`

`app.ts` (rotas), `catalog-source.ts` (mock, redis, postgres), `index.ts` (sobe a porta), `app.test.ts`.
