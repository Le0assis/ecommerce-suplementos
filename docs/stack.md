# Stack e por quê

## O que está instalado

**TypeScript em todo o monorepo.** A mesma forma de produto, cupom e orçamento serve a vitrine, a API e o teste. Alternativa descartada neste corte: Python/FastAPI na API. Entraria outro modelo e outro CI para um time de uma pessoa.

**pnpm 10.33.4 + Turborepo.** Workspaces `apps/*` e `packages/*`. O pnpm 10 não roda script de dependência fora de `pnpm.onlyBuiltDependencies` (`esbuild`, `unrs-resolver`, `sharp`). Sem isso o Vitest quebra.

**Next.js 16 (App Router) + React 19.** Cache Components e Partial Prefetching estão ligados. Páginas de catálogo pré-renderizam. `params` é Promise. Alternativa: Remix ou Vite SPA. SPA perderia SEO da PDP, que é página de dinheiro.

**Tailwind CSS 4.** Tokens em `apps/web/src/app/globals.css` com `@theme inline`. Sem arquivo `tailwind.config`.

**shadcn/ui, estilo new-york, Radix.** Button, Input, Label, Badge, Dialog, Sheet, Tabs, Accordion, Progress, Checkbox, Separator. São os primitivos oficiais, com tema lima. Não há segunda biblioteca de componente.

**Zustand 5.** Carrinho e conta cabem num store persistido. Alternativa: React Query quando a vitrine passar a ler a API; o Zustand pode ficar só com o carrinho.

**Framer Motion** está no `package.json` e quase não é usado. O movimento atual é CSS (`marquee`) com `prefers-reduced-motion`. GSAP foi citado na pesquisa visual e **não está instalado**. Use CSS primeiro. Se uma cena pedir timeline, aí sim uma das duas libs, não as duas.

**Hono.** Rotas curtas, teste com `app.request` sem abrir porta. Alternativa: Route Handlers do Next. A API ficou separada para poder apontar `API_DATA_SOURCE` para o Postgres sem misturar com o build do site.

**Postgres 16 + Redis 7** via Docker Compose. SQL na mão, sem ORM. O volume ainda não paga Prisma. Quando a escrita de pedido crescer, um migrador com histórico (drizzle, prisma ou dbmate) entra no lugar do `tsx` que executa um arquivo.

**Vitest.** Teste de domínio, catálogo, SQL (o arquivo existe e tem as tabelas) e rotas. Playwright está no alvo e não no `package.json`.

## Alternativas de produto (não instaladas)

**Medusa.js e Saleor.** Os dois são commerce headless. Medusa é TypeScript e encaixa neste monorepo. Saleor é GraphQL/Python e pede outro serviço. Nenhum dos dois está no `docker-compose`. O protótipo não precisa de painel de pedido multi-estoque ainda. Quando precisar, a preferência registrada é Medusa, com Saleor se o time já operar GraphQL. Ver [ADR 003](adr/003-mock-antes-do-medusa.md).

**Payload e Sanity.** Payload mora no Postgres que já temos e serve para o blog e as páginas institucionais. Sanity é hospedado e melhor se o marketing quiser editar sem deploy. O admin atual é um patch local e não substitui os dois.

**Meilisearch e Algolia.** A busca de hoje normaliza acento e filtra em memória. Meilisearch sobe do lado do Postgres e basta para catálogo de dezenas de SKUs. Algolia entra se a busca for produto (typo, analytics, destaque pago).

**Mercado Pago e Pagar.me.** Os dois cobrem Pix, boleto e cartão parcelado no Brasil. O checkout já tem os três métodos. A integração real escolhe um primeiro (webhook, estorno, parcela) e deixa o outro atrás da mesma função. Até lá a UI diz que é simulação.

**ViaCEP + cotação de frete.** Substitui `lookupCep` e a tabela `REGIONS` sem mudar o formato que o checkout já consome (`street`, `city`, `state`, preço PAC, preço SEDEX).
