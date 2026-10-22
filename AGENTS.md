# Agentes de IA neste repositório

Leia isto antes de mudar código. A documentação em português está em [docs/README.md](docs/README.md). O guia de instalação para uma pessoa do zero está no [README.md](README.md).

## O que é este projeto

PULSO é um protótipo de e-commerce de suplementos (pt-BR, BRL) do Gustavo. A vitrine é completa e usa dados fictícios. A API, o SQL e o Docker existem, mas pedido, pagamento, CEP e CMS **não** estão persistidos em produção. Não descreva Pix, boleto ou cartão como cobrança real.

A entrega aprovada está em seis etapas empilhadas. O mapa e as referências de mercado (Ghost, Alani Nu, RAW, Gorilla Mind, Gymshark, RYSE, PRIME, Dark Lab, Integralmedica, Transparent Labs, Optimum Nutrition, Growth, Bucked Up) ficam em [docs/REQUISITOS-TECNICOS.md](docs/REQUISITOS-TECNICOS.md). Não copie essas marcas para a UI.

Etapa desta branch: **2 — descoberta** (quiz, calculadora, kit, drops com `dropPhase`, atletas e cupons), empilhada na etapa 1.

## Onde mexer

| Tarefa | Onde |
| --- | --- |
| Preço, Pix, frete, pontos, cupom, CPF, parcelas | `packages/domain` e o teste em `packages/domain/src/domain.test.ts` |
| Produto, sabor, texto, atleta, cupom de vitrine | `packages/data` |
| Tabela SQL, seed | `packages/db` |
| Rota HTTP | `apps/api/src/app.ts` |
| Página, layout, visual | `apps/web` |
| Trocar a vitrine de mock para API | `apps/web/src/server/catalog.ts` (`loadStorefront`). As páginas ainda importam `@pulso/data` direto |
| Variável de ambiente | `.env.example` e o README. Um `.env` só, na raiz |

## Regras que o código já assume

- Preço em centavos inteiros. R$ 10,00 é `1000`.
- Pix é 10% sobre produto, nunca sobre frete. Cupom percentual e kit de 12% não somam: vale o maior, teto 30%.
- Frete PAC grátis em R$ 299 (R$ 199 no nível Bruto, R$ 149 no Lenda).
- Não invente claim de saúde, registro ANVISA real nem CRN. Os rótulos usam `NI-DEMO-…` e dizem que não é medicamento.
- A senha de `/admin` é `NEXT_PUBLIC_ADMIN_PASSWORD`. Ela é insegura de propósito. Não “conserte” isso mandando a senha só para o servidor sem um fluxo de auth de verdade.
- Next.js 16 com Cache Components. `params` e `searchParams` são Promise. Não chame `new Date()`, `Date.now()` ou `Math.random()` durante o render de Client Component: o build de prerender quebra. Relógio de countdown usa `useSyncExternalStore` com snapshot do servidor `null`.
- shadcn/ui (estilo new-york) em `apps/web/src/components/ui`. Não recrie Button, Input, Dialog, Sheet. Instale dependência da raiz com `pnpm --filter @pulso/web add …`. O CLI do shadcn dentro de `apps/web` não enxerga o workspace.
- pnpm 10.33.4 e Node 22. Pacotes com postinstall precisam estar em `pnpm.onlyBuiltDependencies`.
- O `AGENTS.md` de `apps/web` é do Next.js. Não apague. Leia `apps/web/node_modules/next/dist/docs/` antes de mudar convenção do App Router.

## Como verificar

Na raiz: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm --filter @pulso/web build`.

O site de desenvolvimento sobe com `pnpm dev` na porta `WEB_PORT` (padrão 43123). Não use 3000.

`pnpm test:e2e` ainda não tem Playwright.

## Documentos por assunto

- Requisitos: [docs/REQUISITOS-TECNICOS.md](docs/REQUISITOS-TECNICOS.md)
- Arquitetura e stack: [docs/arquitetura.md](docs/arquitetura.md), [docs/stack.md](docs/stack.md)
- Pastas: [docs/estrutura-de-pastas.md](docs/estrutura-de-pastas.md)
- Cada fluxo: [docs/funcionalidades.md](docs/funcionalidades.md)
- Dados e API: [docs/modelo-de-dados.md](docs/modelo-de-dados.md), [docs/contratos-api.md](docs/contratos-api.md)
- Visual: [docs/design-system.md](docs/design-system.md)
- Como estender: [docs/guias](docs/guias/adicionar-produto.md)
- Decisões: [docs/adr](docs/adr/001-monorepo-typescript.md)
- O que falta: [docs/roadmap-e-status.md](docs/roadmap-e-status.md)
