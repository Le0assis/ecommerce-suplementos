# Convenções

## Idioma

Interface, erro, commit e documentação em pt-BR. Identificador de código em inglês (`quoteCart`, `freeShippingCents`). Slug de URL sem acento (`/objetivos/hipertrofia`).

## Dinheiro e data

Centavos inteiros. Formate com `formatBRL` na borda da UI. Não use `number` com vírgula no meio da conta.

Data de drop é ISO. Dia civil da raspadinha é `America/Sao_Paulo`, não UTC. `2026-10-22T02:30:00Z` ainda é 21/10 em São Paulo.

## Onde nasce uma regra

Se a conta muda o total, ela nasce em `packages/domain` com um teste em `domain.test.ts`. A UI só exibe. A API só chama a função.

Se é texto ou SKU fictício, nasce em `packages/data`.

Se é tabela, nasce em `packages/db/sql` num arquivo novo (`002_….sql`) quando o `001` já tiver rodado em algum ambiente compartilhado. No protótipo local, editar o `001` ainda é barato porque `db:reset` apaga o volume — mesmo assim prefira arquivo novo se alguém já semeou.

## React e Next 16

- Server Component por padrão. `"use client"` só com estado, efeito ou evento.
- Não chame `new Date()`, `Date.now()` ou `Math.random()` no corpo do render. Evento (`onSubmit`) pode.
- `useMemo` manual brigou com o React Compiler do ESLint. Calcule no render. Memória só se a medida pedir.
- Patch que muda texto visível espera `hydrated` para não divergir do HTML.
- Dependência nova da web: na raiz, `pnpm --filter @pulso/web add pacote`.

## Visual

Use o token e o componente shadcn. Não crie outro botão. Rosa é drop e destrutivo de campanha, não a cor de “comprar”.

## Honestidade de produto

Registro de produto novo continua `NI-DEMO-` até existir número real. Copie as advertências padrão de `catalog.ts`. Sem claim de saúde. Sem foto de celebridade.

## Git

O `.env` não sobe. O lockfile sobe. Script de pacote que precise de postinstall entra em `pnpm.onlyBuiltDependencies`.

## Teste

`pnpm test` antes de considerar a regra pronta. Um caso de Pix que também mexa em frete, e um caso do caminho feliz. Nome do teste em português, como os atuais, descrevendo o comportamento.
