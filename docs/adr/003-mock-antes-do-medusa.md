# ADR 003 — Mock antes de Medusa ou Saleor

Status: aceito.

## Contexto

O pedido pedia commerce headless (Medusa ou Saleor), CMS e busca. Também pedia a vitrine completa neste corte. Embutir Medusa, Payload e Meilisearch agora atrasaria as páginas e ainda deixaria pagamento fictício.

## Decisão

A vitrine lê `@pulso/data`. A API e o SQL existem para o próximo passo. `loadStorefront` é o lugar da troca. Medusa é a preferência quando o pedido for de verdade (TypeScript, mesmo monorepo). Saleor fica como alternativa se o time quiser GraphQL. CMS: Payload no Postgres, ou Sanity se o marketing editar fora do deploy. Busca: Meilisearch primeiro, Algolia se a busca virar produto.

## Consequências

`DATA_SOURCE=api` ainda não muda a loja. A documentação não pode dizer que a vitrine já é headless. O schema de pedido já nasce normalizado para não reescrever a tabela na fase 1.
