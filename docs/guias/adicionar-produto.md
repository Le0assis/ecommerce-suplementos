# Como adicionar um produto

1. Abra `packages/data/src/catalog.ts`.
2. Copie um `product({ ... })` vizinho da mesma categoria. O helper `product` cria sabores, variantes e o rótulo.
3. Troque `slug` (minúsculo, hífen, estável), `name`, `line`, `tagline`, `description`, `howToUse`.
4. `category` e `goals` só aceitam os ids de `packages/domain/src/types.ts`. Categoria nova nasce lá primeiro.
5. Preço em centavos dentro de `sizes`. R$ 149,90 é `14990`.
6. Rótulo: `registration` no formato `NI-DEMO-00xx`, ingredientes, alergênicos, porção e tabela. Reuse `WARNINGS`. Não invente CRN.
7. Se houver avaliação, acrescente itens em `packages/data/src/reviews.ts` com o mesmo `productSlug`. A nota da vitrine é calculada em `withReviewStats`.
8. A página `/loja/[slug]` entra sozinha via `generateStaticParams` porque lê a lista de produtos. Confira o sitemap: ele também lista os slugs.
9. Rode `pnpm --filter @pulso/data test` e `pnpm --filter @pulso/web build`.

Com Postgres no modo API, rode `pnpm db:seed` de novo. O seed faz upsert pelo slug.

Não coloque o produto só no JSX da home. A home deve ler o catálogo, senão busca e PDP divergem.
