# Contratos da API

Base: `http://127.0.0.1:8787`. Sobe com `pnpm dev:api`. JSON. A origem da vitrine só passa se estiver em `CORS_ORIGINS`, `NEXT_PUBLIC_SITE_URL` ou `ADMIN_CORS_ORIGIN`. Em produção, lista vazia ou origem de fora recebe 403. Fora de produção, `localhost` e `127.0.0.1` também passam. Sem `Origin`, a chamada segue. `POST` acima de 60 por minuto no mesmo IP devolve `429` com `{ "error": "Calma. Muitas tentativas por minuto." }`. O IP é o do socket. `X-Forwarded-For` só vale se esse socket estiver em `TRUSTED_PROXIES`, a mesma regra do login. Em produção, `POST` público sem IP responde `503` `{ "error": "Não deu para identificar o IP." }`. Fora de produção, a ausência continua `local`. O contador é memória do processo: reiniciar zera.

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

Cada linha só tem `slug`, `variant` e `qty`. Preço, desconto, `pointsBalance`, `lifetimePoints` e `redeemPoints` no corpo respondem 400 `{ "error": "O preço é calculado no servidor." }`. O preço sai de `product_variants`. O cupom sai da tabela. Sem cookie de conta, ou com `points_balance` zero, `pointsToRedeem` maior que zero responde 422 `{ "error": "O saldo de pontos ainda não está no servidor.", "code": "pontos_indisponiveis" }`, no quote, no simulate e em `POST /v1/account/orders`. Com o cookie `pulso_customer` e saldo positivo, o orçamento lê `points_balance` e `points_lifetime` dessa conta. O e-mail do `checkout` não escolhe o saldo. Zero ou campo ausente segue 200 com `pointsRedeemed` 0. Negativo responde 400 `{ "error": "Os pontos não podem ser negativos." }`. Valor que não é inteiro responde 400 `{ "error": "Os pontos precisam ser um inteiro." }`. A vitrine ainda não envia o campo.

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

`pointsToRedeem` maior que zero, sem sessão ou com saldo zero, responde 422 `{ "code": "pontos_indisponiveis" }`. Com o cookie da conta e saldo positivo, `pointsRedeemed` sai desse saldo. Zero ou ausência segue com `pointsRedeemed` 0. A vitrine não manda o campo. `pointsEarned` não inclui o bônus do Pix, porque o meio de pagamento não veio no corpo. Campo de dinheiro a mais responde 400. Cupom inexistente responde 400. `Cache-Control: no-store`.

## Conta da loja

Contrato para o Frontend. A vitrine deixa de gravar conta, senha, CPF e pedido no `localStorage` (`pulso-store` não persiste `users`, `currentUserId` nem `guestOrders`; um blob antigo é descartado no merge). Sacola, cupom, favoritos, patches, raspadinha, newsletter e o aviso de cookies continuam no navegador. A conta demo `ana@pulso.dev` ainda existe só na memória do código, até as páginas chamarem estas rotas.

A chamada manda `credentials: "include"`. A API reflete a origem permitida e envia `Access-Control-Allow-Credentials: true`. O cookie é `pulso_customer` (`HttpOnly`, `SameSite=Lax`, `Path=/`, `Max-Age` de 30 dias, `Secure` fora de `ADMIN_COOKIE_SECURE=false`). O JavaScript não lê esse cookie. Não copie o valor para `localStorage`, `sessionStorage` nem para estado persistido. `Authorization: Bearer` com o mesmo valor também vale, para um proxy servidor-a-servidor. Sem `ADMIN_SESSION_SECRET` (mínimo 16, e não o exemplo em produção) as rotas respondem 503.

O limite de login segue o balde do admin: só senha errada, 30 falhas em 15 minutos, por IP e por `loginEmailIpKey` (e-mail com `trim` e minúsculas, `|`, IP). Chaves Redis: `pulso:account:login:ip:<ip>`, `pulso:account:login:ipuser:<ip>:<email>` e `pulso:account:login:emailip:<email>|<ip>`. Sem `REDIS_URL`, o `Map` só existe fora de produção. Em produção, sem Redis, com o Redis fora, ou com um comando que não volta em 500 ms, o login responde 503 `{ "error": "O login em produção precisa do Redis." }` e não confere a senha. A conexão corta em 800 ms. Sem IP, a rota responde 503 `{ "error": "Não deu para identificar o IP. O login não segue sem ele." }`, como o admin. Os dois baldes são lidos antes da senha. A 31ª no IP ou no par e-mail+IP responde 429, `Retry-After: 900` e `{ "error": "Muitas tentativas de login. Espera alguns minutos." }`, sem conferir a senha. Falhas de outras contas no mesmo IP também seguram a senha certa. A senha certa no mesmo IP, com o par já nas 30, espera. De outro IP, ou depois da janela, ela entra e tira a parte daquela conta. `customers` não tem `failed_attempts`: não há atraso progressivo nem vaga única em andamento. Estas rotas também passam pelo limite público de 60 `POST` por minuto no mesmo IP.

O hash é scrypt (`scrypt$N$r$p$…`), o mesmo de `admin_users`. A migração 012 descreve esse formato. Não é argon2 nem bcrypt.

CPF nunca volta em claro, nem em log de sucesso, nem no JSON. Cadastro e pedido gravam `cpf_enc` (AES-256-GCM), `cpf_key_id` e `cpf_hash` (HMAC-SHA256). `customers.cpf` fica nulo nessa escrita. A máscara é `***.***.***-NN`. As três variáveis `CPF_KEY_ID`, `CPF_ENC_KEY` e `CPF_HMAC_KEY` (32 bytes em base64) vêm juntas. Faltando, CPF no cadastro ou pedido responde 503. CPF inválido é 400. E-mail ou CPF já usado é 409. O admin continua listando só `cpfMasked`.

### `POST /v1/account/register`

`{ "name", "email", "password", "cpf"? }`. Senha com no mínimo 12 caracteres. E-mail gravado em minúsculas. `201` `{ "user": { "id", "email", "name", "cpfMasked" } }` e `Set-Cookie`. Sem `cpf`, `cpfMasked` é `null`. A senha não sai no JSON.

### `POST /v1/account/login`

`{ "email", "password" }`. `200` no mesmo formato do cadastro. Senha errada ou conta sem `password_hash`: `401` `{ "error": "E-mail ou senha não confere." }`. O corpo não diz se o e-mail existe.

### `POST /v1/account/logout`

`204` e cookie com `Max-Age=0`. Não há linha `customer_sessions`: o logout não revoga o bearer. Quem guardou o token fora do cookie continua autenticado até os 30 dias. A página usa só o cookie.

### `GET /v1/account/me`

`200` `{ "user": { "id", "email", "name", "cpfMasked" } }`. Sem sessão, `401`. `Cache-Control: no-store`.

### `GET /v1/account/orders`

Só pedidos em que `account_id` e `customer_id` são o id da sessão. `200`:

```json
{
  "orders": [
    {
      "id": "ord_…",
      "code": "PL…",
      "status": "pagamento_pendente",
      "totalCents": 15381,
      "createdAt": "2026-10-24T15:00:00.000Z",
      "lines": [{ "slug": "caos-conta", "variantId": "caos-conta__limao__300", "name": "Caos Teste", "quantity": 1, "unitPriceCents": 14990 }]
    }
  ]
}
```

A outra conta recebe `{ "orders": [] }`. Não há CPF nem cartão.

### `POST /v1/account/orders`

Exige sessão. O corpo é o de `POST /v1/checkout/simulate`: `lines` (`slug`, `variant`, `qty`), `couponCode?`, `pointsToRedeem?` e `checkout`. Preço, total, `unitCents` ou qualquer chave a mais responde 400 `{ "error": "O preço é calculado no servidor." }`. O servidor recalcula. Com o Caos de teste a R$ 149,90, Pix e PAC no CEP `01310100`, sem cupom: `subtotalCents` 14990, `discountCents` 0, `pixCents` 1499, `shippingCents` 1890, `totalCents` 15381.

`200`:

```json
{
  "message": "Nenhum valor foi cobrado. Pix, boleto e cartão são simulação de Mercado Pago / Pagar.me.",
  "order": {
    "id": "ord_…",
    "code": "PL…",
    "status": "pagamento_pendente",
    "email": "ana.conta@pulso.test",
    "subtotalCents": 14990,
    "discountCents": 0,
    "pixCents": 1499,
    "shippingCents": 1890,
    "totalCents": 15381,
    "lines": [{ "slug": "caos-conta", "variantId": "caos-conta__limao__300", "name": "Caos Teste", "quantity": 1, "unitPriceCents": 14990 }]
  }
}
```

`email` do pedido é o da conta, não o do corpo. `status` é um dos valores do CHECK da 001, e o primeiro é `pagamento_pendente`. `orders.account_id` = `orders.customer_id` = id da sessão. `order_lines` guarda os itens. `orders.items` repete o snapshot, sem CPF e sem cartão. `total_cents` é o do servidor e é maior ou igual a zero. A rota também grava o endereço em `addresses` e o telefone (só dígitos) em `customers.phone`. O CPF do checkout passa por `writeCustomerCpf`. Pontos debitados usam `floor(pointsCents / POINT_VALUE_CENTS)` com o valor padrão de 1 centavo por ponto. Não há cobrança.

## Admin

Rotas em `/v1/admin`. Não passam pelo CORS da vitrine nem pelo limite de 60 `POST` por minuto. Sem cabeçalho `Origin` a chamada segue. Origem precisa ser `NEXT_PUBLIC_SITE_URL`, `ADMIN_CORS_ORIGIN` ou, fora de produção, `localhost` / `127.0.0.1`. Outra origem devolve 403.

A sessão dura 12 h. O contrato fechado, com o cookie do site e as rotas públicas novas, está em [api.md](api.md). `POST /v1/admin/login` devolve `{ "user": { "id", "email", "name", "role" } }` e grava o cookie `pulso_admin` (`HttpOnly`, `SameSite=Lax`, `Secure`, `Path=/`, `Max-Age=43200`). O token não vai no JSON. O painel Next não tem senha própria: `POST /api/admin/session` só entra se a API responder, lê o `Set-Cookie` e manda o mesmo valor em `Authorization: Bearer`, porque o cookie da API fica no host dela. Cada login grava um `jti` em `admin_sessions`. `POST /v1/admin/logout` preenche `revoked_at` e o bearer deixa de valer na hora. O painel confere `GET /v1/admin/me` a cada abertura. Papéis no banco: `dono`, `editor`, `atendimento`. Sem `ADMIN_SESSION_SECRET` (mínimo 16 caracteres), ou com o valor de exemplo em produção, o login responde 503.

Antes da senha, o login olha os dois baldes: falhas de outras contas no IP, e o par e-mail+IP. Qualquer um já nas 30 falhas em 15 minutos responde 429 com `Retry-After: 900`, sem scrypt e sem linha nova em `audit_log`. A senha certa no mesmo IP, com o par já nas 30, também espera. De outro IP, ou depois da janela, ela entra e zera a parte daquela conta. Com `REDIS_URL`, o cliente conecta e espera ficar pronto antes do comando. A falha que passou da senha faz `INCR` + `EXPIRE` de 15 minutos em `pulso:login:ip:<ip>`, `pulso:login:ipuser:<ip>:<email>` e no segundo balde `pulso:login:emailip:<email>|<ip>` (`loginEmailIpKey`: e-mail com `trim` e minúsculas, a mesma chave do site). Sem Redis, o `Map` só existe fora de produção. Em produção, sem Redis, com o Redis fora, ou com um comando que não volta em 500 ms, o login responde 503 `{ "error": "O login em produção precisa do Redis." }` e não confere a senha. A conexão corta em 800 ms. Quem não falhou nesse IP também espera, se outras contas já encheram as 30. Só uma tentativa fica em andamento por conta e IP; as outras respondem 429 na hora, sem scrypt. Senha errada aumenta `failed_attempts` antes da verificação. O atraso progressivo (até 8 s, fórmula `min(8000, 100 * 2^min(falhas - 2, 7))`) não segura esta resposta: ele segura a próxima nesse par conta+IP. A conta não trava: a senha certa, depois do prazo ou de outro IP, entra e zera o contador. O IP vem do socket. Em produção, sem IP, o login responde 503 e não usa `local`. Atrás de um proxy, `TRUSTED_PROXIES` é obrigatório; sem a lista, todo mundo cai no IP do proxy e o limite trava junto. `X-Forwarded-For` só vale se esse socket estiver na lista; a API usa o salto mais à direita que não é proxy. Com `VERCEL=1`, o cabeçalho lido é `x-vercel-forwarded-for`. A senha não entra no `audit_log`. O site lê o mesmo limite antes de chamar a API: `loginEmailIpKey` e o balde do IP, 30 falhas em 15 minutos. Já bloqueado, `POST /api/admin/session` responde 429 com `Retry-After: 900` e a tela mostra o tempo de espera, sem mandar a senha. A senha certa, quando passa, zera os dois baldes dessa conta na API. Com `REDIS_URL` o site só lê `pulso:login:*`. Sem Redis, o `Map` existe só fora de produção; em produção a rota responde 503. O 429 da API continua sendo repassado com o `Retry-After` dela. `POST /api/admin/session` acrescenta o IP do cliente em `X-Forwarded-For`. No Next, `x-vercel-forwarded-for` e `x-real-ip` só valem com `VERCEL=1` e, junto, `VERCEL_ENV` ou `VERCEL_URL`. `VERCEL=1` sozinho não confia no cabeçalho. Fora isso o processo apaga `x-vercel-forwarded-for` e vale o IP do socket. `TRUSTED_PROXY=1` libera só `x-real-ip`, nunca `X-Forwarded-For`, e só se o proxy sobrescrever o cabeçalho. Sem a Vercel, sem `TRUSTED_PROXY` e sem o carimbo do socket, o boot em produção falha. O `X-Forwarded-For` do navegador não segue. O IP do processo Next entra em `TRUSTED_PROXIES` (na mesma máquina, `127.0.0.1`).

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
