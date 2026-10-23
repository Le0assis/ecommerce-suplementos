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

## Admin

Rotas em `/v1/admin`. Não passam pelo CORS aberto nem pelo limite de 60 `POST` por minuto. Sem cabeçalho `Origin` a chamada segue. Origem precisa ser `NEXT_PUBLIC_SITE_URL`, `ADMIN_CORS_ORIGIN` ou, fora de produção, `localhost` / `127.0.0.1`. Outra origem devolve 403.

A sessão dura 12 h. `POST /v1/admin/login` devolve `{ "token", "user": { "id", "email", "name", "role" } }` e grava o cookie `pulso_admin` (`HttpOnly`, `SameSite=Lax`, `Secure`, `Path=/`, `Max-Age=43200`). O painel manda esse token em `Authorization: Bearer`. Papéis no banco: `dono`, `editor`, `atendimento`. Sem `ADMIN_SESSION_SECRET` (mínimo 16 caracteres) o login responde 503.

Cinco senhas erradas no mesmo e-mail travam `admin_users.locked_until` por 15 minutos. Trinta falhas no mesmo IP, na memória do processo, também respondem 429 com `Retry-After`. A senha não entra no `audit_log`.

`GET /v1/admin/products` e `GET/POST/PATCH/DELETE /v1/admin/products/:id`, mais `POST /products/:id/duplicate` e filhos `flavors`, `variants`, `images`. `DELETE` arquiva (`status` `arquivado`, `active` false). O JSON usa `publicado`; a coluna guarda `ativo`. Foto: `url` pode ser `null` e `fallbackHex` guarda a cor. `GET /v1/products` com `API_DATA_SOURCE=postgres` monta o catálogo por essas tabelas, não por `products.payload`.

`GET/POST/PATCH/DELETE /v1/admin/coupons/:code`. `DELETE` apaga de verdade só se `uses` é 0. Cupom já usado fica `active: false`.

`POST /v1/admin/uploads` com `{ "contentType", "alt" }` devolve URL assinada do Blob (`pulso/<uuid>.ext`), JPG/PNG/WebP, até 5 MB. Sem `BLOB_READ_WRITE_TOKEN` responde 503 e cita a store `pulso-fotos`.

`GET /v1/admin/audit-log` é só do `dono`.

A conta dono não é semeada. Use `pnpm --filter @pulso/db create-owner`, com a senha em `ADMIN_OWNER_PASSWORD_FILE`, fora do repositório.

O editor também grava categorias, objetivos, kits, promoções, quiz, raspadinha, banners, UGC e `video_spots`. `DELETE` nessas listas arquiva (`active` false ou `hidden` true) quando a coluna existe. Categoria, objetivo e pergunta de quiz não têm essa coluna: a API recusa o `DELETE` com 409. O único apagar de verdade continua sendo o cupom com `uses = 0`.

Atendimento lista e altera pedidos (status e rastreio), avaliações e pontos do cliente. O saldo não fica negativo. Fidelidade (`GET/PATCH /v1/admin/settings/loyalty` e `GET /v1/settings/loyalty`) é só do dono. O `quoteCart` da loja ainda usa as constantes de `@pulso/domain`.
