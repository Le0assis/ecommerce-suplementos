# Arquitetura

## Corte atual

Quatro pacotes, uma direção de dependência.

```
apps/web  →  @pulso/data  →  @pulso/domain
apps/api  →  @pulso/data, @pulso/domain, @pulso/db
@pulso/db →  @pulso/data  (só o seed)
```

`@pulso/domain` não importa banco, React nem `fetch`. Preço, frete, CPF, quiz e raspadinha são funções puras. O teste unitário cobre essa caixa sem subir servidor.

`@pulso/data` é o catálogo fictício: produtos, avaliações, atletas, posts, UGC e cupons. Também filtra, ordena e aplica patch (esconder, renomear, trocar preço).

`apps/web` renderiza. Quase toda página importa `@pulso/data` no servidor ou recebe o catálogo por um provider no cliente. O estado de sessão (carrinho, conta, pedido, raspadinha, consentimento) é Zustand com `persist` e `skipHydration`. O provider reidrata no `useEffect` e só então aplica patch de admin, para o HTML do servidor e o primeiro paint coincidirem.

`apps/api` é Hono na porta 8787. Lê o mesmo catálogo. Se `API_DATA_SOURCE=postgres`, lê `products.payload`. Se `REDIS_URL` existir, cacheia a lista por 60 segundos na chave `catalog:products`. Falha de banco ou Redis cai para o mock e o `/health` conta a história (`ok`, `skipped`, `down`).

`@pulso/db` aplica `sql/001_init.sql` e faz upsert do catálogo. O pool do `pg` só abre quando alguém pede conexão.

## Ponto de troca da vitrine

`apps/web/src/server/catalog.ts` exporta `loadStorefront()`. Com `DATA_SOURCE=api` ele faz `GET {API_URL}/v1/products` e, se a rede falhar, devolve o mock. Nenhuma página chama essa função ainda. Ligar a vitrine é trocar os imports diretos por esse snapshot, com `Suspense` em volta porque o fetch deixa de ser estático no Next 16.

## O que não atravessa a rede hoje

Checkout da vitrine chama `quoteCart` no browser e grava o pedido na store. A rota `POST /v1/checkout/simulate` existe para o mesmo cálculo no servidor e devolve `simulated: true`. Os dois precisam continuar usando `@pulso/domain`, senão Pix e frete divergem.

## Alvo

Quando houver pedido de verdade, a escrita deixa o browser:

1. Next continua a vitrine e o BFF.
2. A API (ou o Medusa/Saleor) vira a dona de estoque, pedido e pagamento.
3. Postgres guarda cliente, pedido, pagamento e ledger.
4. Redis continua cache e passa a guardar sessão e idempotência de webhook.
5. CMS fica com texto de blog e página institucional.
6. Busca dedicada fica com typo e sinônimo.

O domínio de regra comercial pode continuar neste pacote e ser chamado pelos dois lados. Essa é a razão de ele não conhecer HTTP.
