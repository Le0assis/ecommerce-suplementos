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

A sessão dura 12 h. O contrato fechado, com o cookie do site e as rotas públicas novas, está em [api.md](api.md). `POST /v1/admin/login` devolve `{ "user": { "id", "email", "name", "role" } }` e grava o cookie `pulso_admin` (`HttpOnly`, `SameSite=Lax`, `Secure`, `Path=/`, `Max-Age=43200`). O token não vai no JSON. O painel Next não tem senha própria: `POST /api/admin/session` só entra se a API responder, lê o `Set-Cookie` e manda o mesmo valor em `Authorization: Bearer`, porque o cookie da API fica no host dela. Cada login grava um `jti` em `admin_sessions`. `POST /v1/admin/logout` preenche `revoked_at` e o bearer deixa de valer na hora. O painel confere `GET /v1/admin/me` a cada abertura. Papéis no banco: `dono`, `editor`, `atendimento`. Sem `ADMIN_SESSION_SECRET` (mínimo 16 caracteres), ou com o valor de exemplo em produção, o login responde 503.

Cada tentativa reserva o IP antes do scrypt. Com `REDIS_URL`, a reserva é `INCR` + `EXPIRE` de 15 minutos. Sem Redis, um `Map` atualizado na hora. A 31ª no mesmo IP responde 429 com `Retry-After: 900`. Só uma tentativa fica em andamento por conta e IP; as outras respondem 429 na hora, sem scrypt. Senha errada aumenta `failed_attempts` antes da verificação. O atraso progressivo (até 8 s, fórmula `min(8000, 100 * 2^min(falhas - 2, 7))`) não segura esta resposta: ele segura a próxima nesse par conta+IP. A conta não trava: a senha certa, depois do prazo ou de outro IP, entra e zera o contador. O IP vem do socket. Atrás de um proxy, `TRUSTED_PROXIES` é obrigatório; sem a lista, todo mundo cai no IP do proxy e o limite trava junto. `X-Forwarded-For` só vale se esse socket estiver na lista; a API usa o salto mais à direita que não é proxy. Com `VERCEL=1`, o cabeçalho lido é `x-vercel-forwarded-for`. A senha não entra no `audit_log`. O site não tem limite próprio de login: `POST /api/admin/session` acrescenta o IP do cliente em `X-Forwarded-For` e repassa status, JSON e `Retry-After` da API. O IP do processo Next entra em `TRUSTED_PROXIES` (na mesma máquina, `127.0.0.1`).

`GET /v1/admin/products` e `GET/POST/PATCH/DELETE /v1/admin/products/:id`, mais `POST /products/:id/duplicate` e filhos `flavors`, `variants`, `images`. `DELETE` arquiva (`status` `arquivado`, `active` false). O JSON usa `publicado`; a coluna guarda `ativo`. Foto: `url` pode ser `null` e `fallbackHex` guarda a cor. `GET /v1/products` com `API_DATA_SOURCE=postgres` monta o catálogo por essas tabelas, não por `products.payload`.

`GET/POST/PATCH/DELETE /v1/admin/coupons/:code`. `DELETE` apaga de verdade só se `uses` é 0. Cupom já usado fica `active: false`.

`POST /v1/admin/uploads` com `{ "contentType", "alt" }` devolve URL assinada do Blob (`pulso/<uuid>.jpg|jpeg|png|webp`), até 5 MB. O upload direto do cliente só passa se o caminho for `pulso/<arquivo>` com uma dessas extensões, sem `..`. Sem `BLOB_READ_WRITE_TOKEN` responde 503 e cita a store `pulso-fotos`.

`GET /v1/admin/audit` é só do `dono`, com `page`, `pageSize`, `actor`, `entity`, `entityId`, `from` e `to`. `GET /v1/admin/audit-log` é o mesmo handler. A tabela de todas as rotas do admin, com o identificador de cada recurso, está em [api.md](api.md).

A conta dono não é semeada. Use `pnpm --filter @pulso/db create-owner`, com a senha em `ADMIN_OWNER_PASSWORD_FILE`, fora do repositório.

O editor também grava categorias, objetivos, kits, promoções, quiz, raspadinha, banners, UGC e `video_spots`. `DELETE` arquiva quando a tabela tem coluna de arquivo (`active` false ou `hidden` true). Categoria, objetivo, pergunta de quiz e autor não têm essa coluna: a API apaga a linha se nada apontar para ela e responde 409 se uma chave estrangeira impedir. O cupom com `uses = 0` continua saindo de verdade; o cupom usado só desliga. O `href` do banner é `https://…` ou um caminho que começa com uma única `/`. `javascript:`, `data:`, `http:` e `//` respondem 400.

Atendimento lista e altera pedidos (status e rastreio), avaliações e pontos do cliente. O saldo não fica negativo. Fidelidade (`GET/PATCH /v1/admin/settings/loyalty` e `GET /v1/settings/loyalty`) é só do dono. O `POST /v1/checkout/simulate` manda `minCents` do cupom e os campos de `loyalty_settings` para o `quoteCart`. Sem linha de fidelidade, valem as constantes de `@pulso/domain`.

`POST /v1/admin/influencers` grava história, frases e fotos. A foto pode vir com `url` nula e `fallbackHex`. `DELETE` desliga `active`. Autor externo entra em `POST /v1/admin/authors`. `DELETE` do autor apaga se nenhum post apontar para ele. O post leva blocos (`paragrafo`, `titulo`, `imagem`, `citacao_lateral`, `produto`). `DELETE` do post arquiva. Rascunho sem data grava `published_at` nulo. Variação com `servings` 0 responde 400, também em rascunho. Com banco na API, `GET /v1/influencers`, `GET /v1/influencers/:slug`, `GET /v1/posts`, `GET /v1/posts/:slug` e as avaliações do produto leem essas tabelas. Cada influencer público traz `path` `/atletas/<slug>`. Cada post público traz `path` `/blog/<slug>`. O envelope é `{ "source": "postgres" | "mock", ... }`. Em produção a API exige `API_DATA_SOURCE=postgres` e `DATABASE_URL` e recusa subir sem isso. O `body` público continua sendo a lista dos parágrafos. `/atletas` e `/blog` usam essa resposta da API, com `source` `postgres` ou `mock`. Sem resposta, caem no catálogo. Não leem o arquivo do adaptador.

`GET/POST/PATCH/DELETE /v1/admin/drops`. O JSON do admin usa o id curto do sabor (`limao`). A coluna `flavor_id` guarda `produto__limao`. Se o drop tem sabor, `unitsLeft` sai do menor estoque das variações desse sabor. `unitsTotal` e `unitsLeft` ficam `null` quando o dado não existe: a API não inventa lote nem escassez. `DELETE` só muda `status` para `encerrado`.

`GET /v1/drops` devolve `state` (`no_ar`, `em_breve`, `encerrado` ou `esgotado`, este só quando `unitsLeft` é 0) e `waitlistCount`. A contagem é o número de linhas da lista com `anonymized_at` nulo. O JSON público não traz e-mail. Com sabor, `unitsLeft` é o menor estoque das variações; sem sabor, é a coluna `units_left`. O card da home usa esse número. `POST /v1/drops/:id/waitlist` exige `{ "email", "consent": true }` e grava `consentOrigin` (`pagina_drops:v1` se vier vazio). E-mail novo e e-mail repetido respondem os dois `200` `{ "ok": true }`, sem dizer se já estava na lista. `POST /v1/drops/waitlist/erase` responde `{ "ok": true }` e não apaga ninguém. Quem quer sair pede ao suporte; o atendimento usa `POST /v1/admin/drops/waitlist/erase` ou `POST /v1/admin/drops/waitlist/anonymize`. A confirmação por link no e-mail fica para o Léo decidir. A lista (`GET /v1/admin/drops/:id/waitlist`) não sai na rota pública. Sem banco, a inscrição responde 503. A página `/drops` da loja ainda guarda o e-mail no navegador.
