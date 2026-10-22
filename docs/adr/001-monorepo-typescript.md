# ADR 001 — Monorepo TypeScript

Status: aceito.

## Contexto

A vitrine, a API e a regra de Pix precisam concordar no centavo. Dois repositórios iam duplicar o orçamento.

## Decisão

Um repositório pnpm. Pacotes `@pulso/domain`, `@pulso/data`, `@pulso/db`, apps `web` e `api`. Turborepo ordena lint, teste e build.

## Consequências

Quem adiciona dependência na web usa `pnpm --filter` na raiz. O CLI do shadcn, sozinho dentro do app, não vê o workspace. Node 22 e pnpm 10.33.4 são a linha do CI.
