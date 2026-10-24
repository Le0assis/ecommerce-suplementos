# Contratos da API

Base: `http://127.0.0.1:8787`. Sobe com `pnpm dev:api`. JSON. A origem da vitrine só passa se estiver em `CORS_ORIGINS`, `NEXT_PUBLIC_SITE_URL` ou `ADMIN_CORS_ORIGIN`. Em produção, lista vazia ou origem de fora recebe 403. Fora de produção, `localhost` e `127.0.0.1` também passam. Sem `Origin`, a chamada segue. `POST` acima de 60 por minuto no mesmo IP devolve `429` com `{ "error": "Calma. Muitas tentativas por minuto." }`. O IP é o do socket. `X-Forwarded-For` só vale se esse socket estiver em `TRUSTED_PROXIES`, a mesma regra do login. O contador é memória do processo: reiniciar zera.

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

Só entra post `publicado`, ou `agendado` com `publishedAt` até a data UTC de hoje. Rascunho, arquivo e agendado futuro não entram na lista; o detalhe é 404. `coverUrl`, `authorAvatar` e a `url` do bloco `imagem` saem só como `https://` ou caminho com uma barra. `javascript:`, `data:`, `http:` e `//` viram `null`. O JSON não traz `status`, `seoTitle`, `seoDescription` nem `shareImageUrl`.

### `GET /v1/ugc`

### `GET /v1/coupons`

Só cupom com `active` e `public`. A resposta traz `code`, `label`, `kind` e `percent`. Raspadinha (`RASPA5`, `RASPA10`, `RASPAFRETE`) não entra. Sem a coluna `coupons.public`, a lista volta vazia. O admin grava `public` em `POST` e `PATCH /v1/admin/coupons`. Sem o campo, o cupom não é anunciado.

## Escrita simulada

### `POST /v1/quotes/shipping`

Body: `{ "cep": "01310100" }`. Resposta: taxas PAC e SEDEX, ou 400.

### `POST /v1/coupons/validate`

Body: `{ "code": "LUNA15" }`. Este é o jeito de conferir um código, inclusive cupom que não é público. 404 se não existe ou está inativo. A resposta é um cupom, não a lista.

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
  "lines": [{ "slug": "caos-pre-treino", "variant": "caos-pre-treino__limao__300", "qty": 1 }],
  "couponCode": "PULSO10",
  "pointsToRedeem": 0,
  "checkout": {
    "name": "Ana Luz",
    "email": "ana@pulso.dev",
    "cpf": "52998224725",
    "phone": "11987654321",
    "cep": "01310100",
    "street": "Avenida Paulista",
    "number": "1000",
    "neighborhood": "Bela Vista",
    "city": "São Paulo",
    "state": "SP",
    "shippingMethod": "pac",
    "paymentMethod": "pix",
    "acceptLgpd": true,
    "acceptAge": true,
    "acceptTerms": true
  }
}
```

Cada linha só tem `slug`, `variant` e `qty`. Preço, desconto, `pointsBalance`, `lifetimePoints` e `redeemPoints` no corpo respondem 400 `{ "error": "O preço é calculado no servidor." }`. O preço sai de `product_variants`. O cupom sai da tabela. O saldo de pontos no servidor ainda não existe (`serverPointAccount` devolve `null`). `pointsToRedeem` maior que zero responde 422 `{ "error": "O saldo de pontos ainda não está no servidor.", "code": "pontos_indisponiveis" }`, no quote e no simulate. Zero ou campo ausente segue 200 com `pointsRedeemed` 0. A vitrine não envia o campo. Isso volta quando o Backend ler o saldo da sessão.

Com o Caos limão, `PULSO10` e Pix/PAC no CEP `01310100`, o `quote` traz `discountCents` 1499, `pixCents` 1349, `shippingCents` 1890 e `totalCents` 14032. A resposta também traz `simulated: true` e a frase de que Mercado Pago e Pagar.me não cobraram. `checkout` passa por `validateCheckout`. Erro de formulário: 400 `{ "error": "Pedido incompleto.", "errors": { ... } }`.

A vitrine não chama esta rota. Ela usa `quoteCart` localmente. Os dois compartilham o domínio.

### `POST /v1/checkout/quote`

O checkout novo manda só isto. Preço e nome do cliente são ignorados.

```json
{
  "lines": [{ "slug": "caos-pre-treino", "variant": "caos-pre-treino__limao__300", "qty": 1 }],
  "couponCode": "PULSO10"
}
```

`variant` é o `id` gravado em `product_variants`. No catálogo isso é `slug__sabor__tamanho`, e `tamanho` é o id do tamanho (`300`, `900`, `60`, `1k`, `mes`), não o número de doses. O Caos limão é `caos-pre-treino__limao__300`. Uma variação criada no admin sem id explícito usa `idDoProduto__sabor__indice`. A rota exige o id que está naquele slug. Outro produto responde 404.

O corpo não traz CEP nem meio de pagamento, então a resposta não tem Pix nem frete. `shippingCents` só entra quando o frete for calculado. Os centavos são inteiros.

```json
{
  "summary": {
    "lines": [{ "name": "Caos", "unitCents": 14990, "qty": 1, "totalCents": 14990 }],
    "subtotalCents": 14990,
    "discountCents": 1499,
    "pointsRedeemed": 0,
    "pointsEarned": 675,
    "totalCents": 13491
  }
}
```

`pointsToRedeem` maior que zero, enquanto o saldo não vier do servidor, responde 422 `{ "code": "pontos_indisponiveis" }`. Zero ou ausência segue com `pointsRedeemed` 0. A vitrine não manda o campo. `pointsEarned` não inclui o bônus do Pix, porque o meio de pagamento não veio no corpo. Campo de dinheiro a mais responde 400. Cupom inexistente responde 400. `Cache-Control: no-store`. O slider e o texto de resgate na conta dependem do Backend passar a devolver `points_balance` de verdade.

## Admin

Rotas em `/v1/admin`. Não passam pelo CORS da vitrine nem pelo limite de 60 `POST` por minuto. Sem cabeçalho `Origin` a chamada segue. Origem precisa ser `NEXT_PUBLIC_SITE_URL`, `ADMIN_CORS_ORIGIN` ou, fora de produção, `localhost` / `127.0.0.1`. Outra origem devolve 403.

A sessão dura 12 h. O contrato fechado, com o cookie do site e as rotas públicas novas, está em [api.md](api.md). `POST /v1/admin/login` devolve `{ "user": { "id", "email", "name", "role" } }` e grava o cookie `pulso_admin` (`HttpOnly`, `SameSite=Lax`, `Secure`, `Path=/`, `Max-Age=43200`). O token não vai no JSON. O painel Next não tem senha própria: `POST /api/admin/session` só entra se a API responder, lê o `Set-Cookie` e manda o mesmo valor em `Authorization: Bearer`, porque o cookie da API fica no host dela. Cada login grava um `jti` em `admin_sessions`. `POST /v1/admin/logout` preenche `revoked_at` e o bearer deixa de valer na hora. O painel confere `GET /v1/admin/me` a cada abertura. Papéis no banco: `dono`, `editor`, `atendimento`. Sem `ADMIN_SESSION_SECRET` (mínimo 16 caracteres), ou com o valor de exemplo em produção, o login responde 503.

O limite do IP conta só senha errada, 30 falhas em 15 minutos. A senha certa não conta e zera as falhas daquele e-mail nesse IP. Com `REDIS_URL`, o cliente conecta e espera ficar pronto antes do comando. A falha faz `INCR` + `EXPIRE` de 15 minutos em `pulso:login:ip:<ip>`, `pulso:login:ipuser:<ip>:<email>` e no segundo balde `pulso:login:emailip:<email>|<ip>` (`loginEmailIpKey`: e-mail com `trim` e minúsculas, a mesma chave do site). Sem Redis, um `Map` atualizado na hora. A 31ª falha no mesmo IP responde 429 com `Retry-After: 900`. Quem não falhou nesse IP também espera, se outras contas já encheram as 30. Só uma tentativa fica em andamento por conta e IP; as outras respondem 429 na hora, sem scrypt. Senha errada aumenta `failed_attempts` antes da verificação. O atraso progressivo (até 8 s, fórmula `min(8000, 100 * 2^min(falhas - 2, 7))`) não segura esta resposta: ele segura a próxima nesse par conta+IP. A conta não trava: a senha certa, depois do prazo ou de outro IP, entra e zera o contador. O IP vem do socket. Atrás de um proxy, `TRUSTED_PROXIES` é obrigatório; sem a lista, todo mundo cai no IP do proxy e o limite trava junto. `X-Forwarded-For` só vale se esse socket estiver na lista; a API usa o salto mais à direita que não é proxy. Com `VERCEL=1`, o cabeçalho lido é `x-vercel-forwarded-for`. A senha não entra no `audit_log`. O site conta o mesmo limite: `loginEmailIpKey` e o balde do IP, 30 falhas em 15 minutos. A 31ª em `POST /api/admin/session` responde 429 com `Retry-After: 900`, e a tela mostra o tempo de espera. A senha certa zera os dois baldes dessa conta. O 429 da API continua sendo repassado com o `Retry-After` dela. `POST /api/admin/session` acrescenta o IP do cliente em `X-Forwarded-For`. No Next, `x-vercel-forwarded-for` e `x-real-ip` só valem com `VERCEL=1` e, junto, `VERCEL_ENV` ou `VERCEL_URL`. `VERCEL=1` sozinho não confia no cabeçalho. Fora isso o processo apaga `x-vercel-forwarded-for` e vale o IP do socket. `x-real-ip` também entra com `TRUSTED_PROXY=1`, se o proxy sobrescrever o cabeçalho. O `X-Forwarded-For` do navegador não segue. O IP do processo Next entra em `TRUSTED_PROXIES` (na mesma máquina, `127.0.0.1`).

`GET /v1/admin/products` e `GET/POST/PATCH/DELETE /v1/admin/products/:id`, mais `POST /products/:id/duplicate` e filhos `flavors`, `variants`, `images`. `DELETE` arquiva (`status` `arquivado`, `active` false). O JSON usa `publicado`; a coluna guarda `ativo`. Foto: `url` pode ser `null` e `fallbackHex` guarda a cor. Id já deste produto atualiza a linha. Id que não existe fica o do cliente. Sem id, o servidor gera `<produto>__<sabor>__<posição>` ou `<produto>__img__<posição>`. Id de outro produto responde 409 e a transação não altera nada: `{ "error": "Essa variação pertence a outro produto.", "code": "variacao_de_outro_produto" }` ou `{ "error": "Essa foto pertence a outro produto.", "code": "imagem_de_outro_produto" }`. Id repetido no mesmo corpo usa o mesmo `code`, com `error` `Essa variação está repetida no envio.` ou `Essa foto está repetida no envio.` `GET /v1/products` com `API_DATA_SOURCE=postgres` monta o catálogo por essas tabelas, não por `products.payload`.

`GET/POST/PATCH/DELETE /v1/admin/coupons/:code`. `DELETE` apaga de verdade só se `uses` é 0. Cupom já usado fica `active: false`.

`POST /v1/admin/uploads` com `{ "contentType", "alt" }` devolve URL assinada do Blob (`pulso/<uuid>.jpg|jpeg|png|webp`), até 5 MB. O upload direto do cliente só passa se o caminho for `pulso/<arquivo>` com uma dessas extensões, sem `..`. Sem `BLOB_READ_WRITE_TOKEN` responde 503 e cita a store `pulso-fotos`.

`GET /v1/admin/audit` é só do `dono`, com `page`, `pageSize`, `actor`, `entity`, `entityId`, `from` e `to`. `GET /v1/admin/audit-log` é o mesmo handler. A tabela de todas as rotas do admin, com o identificador de cada recurso, está em [api.md](api.md).

A conta dono não é semeada. Use `pnpm --filter @pulso/db create-owner`, com a senha em `ADMIN_OWNER_PASSWORD_FILE`, fora do repositório.

O editor também grava categorias, objetivos, kits, promoções, quiz, raspadinha, banners, UGC e `video_spots`. `DELETE` arquiva quando a tabela tem coluna de arquivo (`active` false ou `hidden` true). Categoria, objetivo, pergunta de quiz e autor não têm essa coluna: a API apaga a linha se nada apontar para ela e responde 409 se uma chave estrangeira impedir. O cupom com `uses = 0` continua saindo de verdade; o cupom usado só desliga. O `href` do banner é `https://…` ou um caminho que começa com uma única `/`. `javascript:`, `data:`, `http:` e `//` respondem 400.

Atendimento lista e altera pedidos (status e rastreio), avaliações e pontos do cliente. O saldo não fica negativo. Fidelidade (`GET/PATCH /v1/admin/settings/loyalty` e `GET /v1/settings/loyalty`) é só do dono. O `POST /v1/checkout/simulate` manda `minCents` do cupom e os campos de `loyalty_settings` para o `quoteCart`. Sem linha de fidelidade, valem as constantes de `@pulso/domain`.

`POST /v1/admin/influencers` grava história, frases e fotos. A foto pode vir com `url` nula e `fallbackHex`. `DELETE` desliga `active`. Autor externo entra em `POST /v1/admin/authors`. `DELETE` do autor apaga se nenhum post apontar para ele. O post leva blocos (`paragrafo`, `titulo`, `imagem`, `citacao_lateral`, `produto`). `DELETE` do post arquiva. Rascunho sem data grava `published_at` nulo. Variação com `servings` 0 responde 400, também em rascunho. Com banco na API, `GET /v1/influencers`, `GET /v1/influencers/:slug`, `GET /v1/posts`, `GET /v1/posts/:slug` e as avaliações do produto leem essas tabelas. Cada influencer público traz `path` `/atletas/<slug>`. Cada post público traz `path` `/blog/<slug>`. O envelope é `{ "source": "postgres" | "mock", ... }`. Em produção a API exige `API_DATA_SOURCE=postgres` e `DATABASE_URL` e recusa subir sem isso. O `body` público continua sendo a lista dos parágrafos. `/atletas` e `/blog` usam essa resposta da API, com `source` `postgres` ou `mock`. Sem resposta, caem no catálogo. Não leem o arquivo do adaptador.

`GET/POST/PATCH/DELETE /v1/admin/drops`. O JSON do admin usa o id curto do sabor (`limao`). A coluna `flavor_id` guarda `produto__limao`. Se o drop tem sabor, `unitsLeft` sai do menor estoque das variações desse sabor. `unitsTotal` e `unitsLeft` ficam `null` quando o dado não existe: a API não inventa lote nem escassez. `DELETE` só muda `status` para `encerrado`.

`GET /v1/drops` devolve `state` (`no_ar`, `em_breve`, `encerrado` ou `esgotado`, este só quando `unitsLeft` é 0) e `waitlistCount`. A contagem é o número de linhas da lista com `anonymized_at` nulo. O JSON público não traz e-mail. Com sabor, `unitsLeft` é o menor estoque das variações; sem sabor, é a coluna `units_left`. O card da home usa esse número. `POST /v1/drops/:id/waitlist` exige `{ "email", "consent": true }` e grava `consentOrigin` (`pagina_drops:v1` se vier vazio). E-mail novo e e-mail repetido respondem os dois `200` `{ "ok": true }`, sem dizer se já estava na lista. `POST /v1/drops/waitlist/erase` responde `410` e não apaga ninguém. Quem quer sair pede ao suporte. O dono ou o atendimento apaga com `DELETE /v1/admin/drops/waitlist/:id` ou `POST /v1/admin/drops/waitlist/erase`, com auditoria. O editor não apaga. Anonimizar continua `POST /v1/admin/drops/waitlist/anonymize`. A confirmação por link no e-mail fica para o Léo decidir. A lista (`GET /v1/admin/drops/:id/waitlist`) é do dono ou do atendimento. O dono vê o e-mail inteiro. O atendimento vê `j***@d***.com` e apaga pelo id. Editor recebe 403, porque o e-mail é dado pessoal. Essa rota não é pública. Sem banco, a inscrição responde 503. A página `/drops` da loja ainda guarda o e-mail no navegador.
