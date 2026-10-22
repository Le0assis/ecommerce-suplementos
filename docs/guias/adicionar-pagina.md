# Como adicionar uma página

1. Crie `apps/web/src/app/(loja)/sua-rota/page.tsx`. O grupo `(loja)` já traz header, footer e bottom nav. Não copie o header para dentro da página.
2. Prefira Server Component. Se precisar de clique, extraia um componente `"use client"` e deixe a página exportando `metadata`.
3. Client Component não exporta `metadata`. Se a rota for só cliente, crie um `layout.tsx` ao lado com `export const metadata = { title: "..." }`, como em `drops` e `carrinho`.
4. Página dinâmica (`[slug]`): `generateStaticParams` com a lista conhecida e `await params` (é Promise no Next 16).
5. `useSearchParams` fica dentro de `<Suspense>`.
6. Texto institucional curto pode usar `InfoPage` em `apps/web/src/components/content/info-page.tsx`.
7. Inclua o link no footer (`chrome.tsx`) se a página for da casa. O sitemap em `apps/web/src/app/sitemap.ts` precisa da URL se ela for pública.
8. Estado vazio: não deixe uma lista em branco sem frase.

Rota fora da loja (sem chrome) não é o padrão. Quase tudo vive em `(loja)`.

Depois: `pnpm --filter @pulso/web lint` e `pnpm --filter @pulso/web build`. O build pega `new Date()` no render, que o lint deixa passar.
