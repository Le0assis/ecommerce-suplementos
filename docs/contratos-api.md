# Contratos da API

Base: `http://127.0.0.1:8787`. Sobe com `pnpm dev:api`. JSON. CORS aberto. `POST` acima de 60 por minuto no mesmo IP devolve `429` com `{ "error": "Calma. Muitas tentativas por minuto." }`. O contador é memória do processo: reiniciar zera.

Erros de negócio usam `{ "error": "mensagem em pt-BR" }` e status 400 ou 404.

## Leitura

### `GET /health`

```json
{ "ok": true, "service": "pulso-api", "dataSource": "mock", "postgres": "skipped", "redis": "skipped" }
```

`postgres` e `redis` podem ser `ok`, `skipped` ou `down`. `ok` do serviço é falso se algum dos dois estiver `down`.

### `GET /v1/products`

`{ "source": "mock" | "postgres" | "mock-fallback", "products": [ CatalogProduct ] }`

### `GET /v1/products/:slug`

`{ "source", "product", "reviews" }` ou 404.

### `GET /v1/search?q=`

Filtro simples por nome, linha e sabor no servidor. A busca da vitrine, hoje, usa `searchProducts` no pacote de dados (sem acento) e não esta rota.

### `GET /v1/influencers` e `GET /v1/influencers/:slug`

### `GET /v1/posts` e `GET /v1/posts/:slug`

### `GET /v1/ugc`

### `GET /v1/coupons`

Só cupons ativos, e só `code`, `label`, `kind`, `percent`. Sem slug interno além do que o cupom já carrega no objeto filtrado.

## Escrita simulada

### `POST /v1/quotes/shipping`

Body: `{ "cep": "01310100" }`. Resposta: taxas PAC e SEDEX, ou 400.

### `POST /v1/coupons/validate`

Body: `{ "code": "LUNA15" }`. 404 se não existe ou está inativo.

### `POST /v1/calculators/protein`

Body: `{ "weightKg": 70, "goal": "hipertrofia", "foodGramsPerKg": 1 }`. 400 se o peso está fora de 35–220.

### `POST /v1/calculators/creatine`

Body: `{ "weightKg": 92 }`.

### `POST /v1/quiz`

Body: `{ "goal", "caffeine", "flavor", "budget" }`. Os quatro campos são obrigatórios. A resposta lista slugs.

### `POST /v1/payments/sandbox`

Body: `{ "method": "pix" | "boleto" | "card", "amountCents": 15990, "orderCode": "PLSAND" }`.

Resposta com `sandbox: true`, `gateway` (`mercadopago` ou `pagarme`), `externalId` (`mp_sandbox_…` ou `pm_sandbox_…`), `status` (`pending` no Pix e no boleto, `approved` no cartão) e a mensagem de que nada foi cobrado. Valor zero ou código vazio devolve 400.

`PAYMENT_GATEWAY=mercadopago` ou `pagarme` força o gateway. Qualquer outro valor, inclusive `auto`, usa o padrão: Pix e boleto no Mercado Pago, cartão na Pagar.me. Não existe access token neste protótipo.

### `POST /v1/checkout/simulate`

Body:

```json
{
  "checkout": { "cep": "01310100", "paymentMethod": "pix", "shippingMethod": "pac" },
  "lines": [{ "unitPriceCents": 14990, "quantity": 1, "subscription": false, "subscriptionDiscountPercent": 0, "category": "pre-treino" }],
  "couponCode": "LUNA15",
  "redeemPoints": 0,
  "pointsBalance": 0,
  "lifetimePoints": 0
}
```

O servidor **recalcula**. Não confia em total mandado pelo cliente. A resposta traz `simulated: true`, uma frase dizendo que Mercado Pago e Pagar.me não cobraram, e o `quote`.

`checkout` passa por `validateCheckout`. No teste da API o body mínimo que passa é o usado em `apps/api/src/app.test.ts`.

A vitrine não chama esta rota. Ela usa `quoteCart` localmente. Os dois compartilham o domínio.
