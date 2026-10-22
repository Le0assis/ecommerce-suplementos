# ADR 002 — Next.js App Router

Status: aceito.

## Contexto

A PDP e o blog precisam de HTML indexável, e o checkout precisa de estado no browser.

## Decisão

Next.js 16 com App Router, Cache Components e Partial Prefetching. Catálogo pré-renderizado. Carrinho, checkout, conta, drops e raspadinha são ilhas cliente. Tailwind 4 e shadcn/ui no visual.

## Consequências

`params` e `searchParams` são Promise. Relógio e `Math.random` não podem rodar no render do cliente durante o prerender. O grupo de rotas `(loja)` concentra o chrome. A porta de desenvolvimento é 43123, não 3000.
