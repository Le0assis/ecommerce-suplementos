# Contrato da API de admin e das rotas públicas novas

Este arquivo é o contrato que o site e a API compartilham depois que o login de senha única saiu. O mapa geral das rotas continua em [contratos-api.md](contratos-api.md). Preço em centavos. Pix, boleto e cartão continuam simulação.

Não existe `ADMIN_PASSWORD` nem `NEXT_PUBLIC_ADMIN_PASSWORD`. A senha de exemplo `pulso-admin` não abre nada. A conta nasce em `admin_users`, com `pnpm --filter @pulso/db create-owner` (`ADMIN_OWNER_EMAIL`, `ADMIN_OWNER_NAME`, `ADMIN_OWNER_PASSWORD_FILE`). O script não imprime a senha.

## Login da API

`POST /v1/admin/login`

```json
{ "email": "dono@pulso.local", "password": "…" }
```

Resposta `200`:

```json
{ "user": { "id": "…", "email": "dono@pulso.local", "name": "Dono", "role": "dono" } }
```

O JSON não traz token. O valor da sessão sai só no cabeçalho `Set-Cookie`.

Papéis: `dono` (tudo, inclusive fidelidade e `GET /v1/admin/audit`), `editor` (catálogo, conteúdo, cupom, promoção, drop, quiz, raspadinha, banner, upload) e `atendimento` (pedido, avaliação, cliente). Outro papel ou conta inativa responde `401` com `{ "error": "E-mail ou senha não confere." }`.

O limite do IP conta só senha errada: 30 falhas em 15 minutos. A senha certa não entra nessa conta e zera as falhas daquele e-mail no mesmo IP. Com `REDIS_URL`, cada falha faz `INCR` e `EXPIRE` de 15 minutos em `pulso:login:ip:<ip>`, em `pulso:login:ipuser:<ip>:<email>` e no segundo balde `pulso:login:emailip:<email>|<ip>`. O e-mail dessa chave é `trim` + minúsculas (`loginEmailIpKey` em `@pulso/domain`); o site usa a mesma forma. Sem Redis, são `Map`s no processo. A 31ª falha no IP, ou nesse par e-mail+IP, responde `429`, `Retry-After: 900` e `{ "error": "Muitas tentativas de login. Espera alguns minutos." }`. Se as 30 falhas forem de outras contas, até a senha certa de quem não falhou espera o prazo. Se forem da própria conta, a senha certa entra e tira a parte dela.

Há no máximo uma tentativa em andamento por conta e IP (`pulso:login:slot:<email>:<ip>` no Redis, ou o mesmo `Map`). As outras, no mesmo instante, respondem `429` na hora e não calculam scrypt. Senha errada soma `failed_attempts` no banco antes de conferir o hash. O atraso não segura esta resposta: ele segura a próxima. A fórmula é `min(8000, 100 * 2^min(falhas - 2, 7))` milissegundos, a partir da segunda falha, e chega a 8 segundos. Enquanto esse prazo não passa, a próxima tentativa nesse par conta+IP responde `429` e não calcula scrypt, mesmo com a senha certa. A conta não trava: a senha certa, depois do prazo ou de outro IP, zera o contador e `locked_until`.

O IP é o do socket. Atrás de um proxy, `TRUSTED_PROXIES` é obrigatório: sem a lista, todo cliente vira o IP do proxy e o limite de login trava todo mundo junto. `X-Forwarded-For` só entra se esse socket estiver na lista; vale o salto mais à direita que não é proxy. Com `VERCEL=1`, o cabeçalho lido é `x-vercel-forwarded-for`.

O site chama `POST /v1/admin/login` de servidor para servidor. A API, então, vê o IP do Next em todo login. `POST /api/admin/session` acrescenta o IP do cliente no fim de `X-Forwarded-For` (não substitui a cadeia). Esse IP é o do socket. `x-vercel-forwarded-for` e `x-real-ip` só entram com `VERCEL=1`, porque a Vercel sobrescreve os dois. Fora da Vercel o processo do Next apaga esses dois cabeçalhos do cliente e grava o IP do socket por cima, antes da rota. O `X-Forwarded-For` do navegador não entra. O endereço do Next precisa estar em `TRUSTED_PROXIES`, senão todo mundo divide o limite do IP do Next.

Exemplo com Next e API na mesma máquina:

```
TRUSTED_PROXIES=127.0.0.1
```

Exemplo com um proxy na frente e o Next em outra rede:

```
TRUSTED_PROXIES=203.0.113.8,10.0.0.5
```

`203.0.113.8` é o proxy que fala com a API. `10.0.0.5` é o Next. Os dois entram na lista porque cada um escreve um salto. Sem o IP do Next, o limite não separa os clientes.

Sem `ADMIN_SESSION_SECRET` de pelo menos 16 caracteres, o login responde `503`. Em produção, o valor de exemplo `pulso-dev-session-change-me` também responde `503`. Em produção a API só sobe com `API_DATA_SOURCE=postgres` e `DATABASE_URL`.

### Cookie `pulso_admin`

| Campo | Valor |
| --- | --- |
| Nome | `pulso_admin` |
| Formato | `base64url(JSON).base64url(HMAC-SHA256)` |
| Corpo | `{ "sub", "email", "name", "role", "exp", "jti" }` |
| Duração | 12 horas (`Max-Age=43200`) |
| Atributos | `HttpOnly`, `SameSite=Lax`, `Path=/`, `Secure` |

`Secure` fica desligado só quando `NODE_ENV` não é `production` e `ADMIN_COOKIE_SECURE=false`.

Cada login grava o `jti` em `admin_sessions` (`user_id`, `expires_at`, `revoked_at` nulo). A migração é `packages/db/sql/006_sessoes.sql`.

As rotas de admin aceitam o cookie ou `Authorization: Bearer <mesmo valor>`. `GET /v1/admin/me` devolve o mesmo `{ "user" }` se a assinatura vale, o `jti` não está revogado e o usuário segue ativo. Caso contrário, `401` `{ "error": "Sessão inválida ou vencida." }` ou `{ "error": "Faça login para continuar." }`.

`POST /v1/admin/logout` preenche `revoked_at`, grava auditoria e responde `204` com `Set-Cookie` de `Max-Age=0`. O bearer deixa de valer na hora, mesmo dentro das 12 horas. Logout sem sessão também limpa o cookie e responde `204`.

## Login do site

O painel em `/admin` não tem senha própria. `POST /api/admin/session` exige a mesma origem do site e este corpo:

```json
{ "email": "dono@pulso.local", "password": "…" }
```

O route handler chama `POST /v1/admin/login`. Se a API não responder, devolve `503` `{ "error": "A API de admin está fora do ar." }`. Não há fallback local.

O cookie da API fica no host da API. O site lê o `Set-Cookie` `pulso_admin`, guarda esse valor dentro do próprio cookie e, nas chamadas seguintes, manda `Authorization: Bearer`.

Resposta `200` do site:

```json
{ "user": { "id": "…", "email": "…", "name": "…", "role": "dono" }, "source": "api" }
```

Sem token no JSON.

### Cookie `pulso_admin_session`

| Campo | Valor |
| --- | --- |
| Nome | `pulso_admin_session` |
| Formato | `base64url(JSON).base64url(HMAC-SHA256)` com `ADMIN_SESSION_SECRET` |
| Corpo | `{ "v": 1, "sub", "email", "name", "role", "exp", "src": "api", "apiToken" }` |
| Duração | 12 horas |
| Atributos | `HttpOnly`, `SameSite=Lax`, `Path=/`, `Secure` em `https` |

`src` diferente de `api`, ou cookie sem `apiToken`, não autentica. Cookie antigo de senha única não entra.

`GET /api/admin/session` chama `GET /v1/admin/me` com o bearer. `200` devolve `{ "user", "source": "api", "devSecret" }`. Sessão revogada, vencida ou API fora respondem `401` `{ "error": "Sessão expirada." }`. O painel trata isso como logout.

`DELETE /api/admin/session` chama `POST /v1/admin/logout` com o bearer, apaga `pulso_admin_session` e responde `{ "ok": true }`. `POST` e `DELETE` de outra origem respondem `403`.

O site também conta falha de login, com a mesma chave `loginEmailIpKey` (`e-mail` com `trim` e minúsculas, `|`, IP) e o balde só do IP. Os dois são 30 falhas em 15 minutos. A 31ª responde `429`, `Retry-After: 900` e `{ "error": "Muitas tentativas de login. Espera 15 minutos." }`. A senha certa zera a parte daquela conta nos dois baldes. Quem não falhou naquele IP espera se outras contas já encheram as 30. `401` da API segue `{ "error": "E-mail ou senha não confere." }`. `429` da API passa o JSON e o `Retry-After` dela; a tela de login troca “alguns minutos” pelo tempo desse cabeçalho. Fora da Vercel, `TRUSTED_PROXY=1` faz o site ler `x-real-ip` quando um proxy confiável sobrescreve esse cabeçalho. Sem o carimbo do socket e sem essa variável, o IP vira `local` e o balde do IP é compartilhado.

O CRUD do painel não grava `apps/web/.data/admin-mock.json`. Se a API não responde, a tela mostra o erro e não diz que salvou. `/api/admin/data` é o outro proxy do admin: cada chamada acrescenta o mesmo IP (socket, ou o cabeçalho da Vercel quando `VERCEL=1`) no fim de `X-Forwarded-For` e repassa o status da API. Rota ainda inexistente vira erro (`A API não tem GET /v1/admin/...`), sem cair no mock.

O painel usa o identificador da tabela: produto e kit pelo `id` (o slug), cupom pelo `code`, categoria e objetivo pelo `slug`, influencer e post pelo `slug`, vídeo pelo `id` ou pelo `slug`, e o restante pelo `id`. `409` é duplicata, `404` é registro ou rota ausente, `403` é papel errado. A tela mostra essa mensagem.

## Rotas do admin

Todas ficam em `/v1/admin`. Sem sessão, `401`. Papel sem permissão, `403` `{ "error": "Seu papel não faz isso." }`. Registro ausente, `404`. Identificador repetido, slug que mudaria, ou apagar algo em uso, `409`. O corpo do `PATCH` é o registro inteiro, no mesmo formato do `POST`. Gravação escreve `audit_log` (antes e depois) e apaga a chave `catalog:products` no Redis.

O identificador da URL é o da coluna abaixo. Onde o painel chama o campo de `id`, a resposta manda `id` com esse valor. Categoria e objetivo também mandam `slug`.

| Recurso | Identificador | Lista | Um | Cria | Atualiza | Apaga | Papel |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Sessão | — | — | `GET /me` | `POST /login` | — | `POST /logout` | público no login |
| Auditoria | query | `GET /audit` e `GET /audit-log` | — | — | — | — | dono |
| Produtos | `id` (o slug) | `GET /products` | `GET /products/:id` | `POST /products` | `PATCH /products/:id` | `DELETE /products/:id` arquiva | editor |
| Sabores, variações, fotos | `id` do filho | — | — | `POST /products/:id/flavors\|variants\|images` | `PATCH` sabor e variação | `DELETE` os três | editor |
| Cópia | `id` | — | — | `POST /products/:id/duplicate` | — | — | editor |
| Kits | `id` do produto | `GET /kits` | `GET /kits/:id` | `POST /kits` | `PATCH /kits/:id` | `DELETE /kits/:id` arquiva | editor |
| Cupons | `code` (a resposta usa esse valor em `id`) | `GET /coupons` | `GET /coupons/:code` | `POST /coupons` | `PATCH /coupons/:code` | `DELETE /coupons/:code` | editor |
| Categorias | `slug` | `GET /categories` | `GET /categories/:slug` | `POST /categories` | `PATCH /categories/:slug` | `DELETE /categories/:slug` | editor |
| Objetivos | `slug` | `GET /goals` e `GET /categories?kind=objetivo` | `GET /goals/:slug` ou `GET /categories/:slug` | `POST /goals` ou `POST /categories` com `kind: "objetivo"` | `PATCH` nos dois caminhos | `DELETE` nos dois caminhos | editor |
| Influencers | `slug` (igual a `id`) | `GET /influencers` | `GET /influencers/:slug` | `POST /influencers` | `PATCH /influencers/:slug` | `DELETE /influencers/:slug` desativa | editor |
| Autores | `id` | `GET /authors` | `GET /authors/:id` | `POST /authors` | `PATCH /authors/:id` | `DELETE /authors/:id` | editor |
| Posts | `slug` (igual a `id`) | `GET /posts` | `GET /posts/:slug` | `POST /posts` | `PATCH /posts/:slug` | `DELETE /posts/:slug` arquiva | editor |
| Promoções | `id` | `GET /promotions` | `GET /promotions/:id` | `POST /promotions` | `PATCH /promotions/:id` | `DELETE /promotions/:id` desativa | editor |
| Drops | `id` | `GET /drops` | `GET /drops/:id` | `POST /drops` | `PATCH /drops/:id` | `DELETE /drops/:id` encerra | editor |
| Lista de espera | `id` da inscrição, ou e-mail | `GET /drops/:id/waitlist` | — | — | — | `DELETE /drops/waitlist/:id` apaga uma inscrição. `POST /drops/waitlist/erase` apaga o e-mail em todos os drops. `POST /drops/waitlist/anonymize` | lista: dono vê o e-mail inteiro; atendimento vê `j***@d***.com` e apaga pelo id. Editor recebe 403. Anonimização: editor |
| Quiz | `id` | `GET /quiz` | `GET /quiz/:id` | `POST /quiz` | `PATCH /quiz/:id` | `DELETE /quiz/:id` | editor |
| Avaliações | `id` | `GET /reviews` | `GET /reviews/:id` | — | `PATCH /reviews/:id` | `DELETE /reviews/:id` oculta | atendimento |
| UGC | `id` | `GET /ugc` | `GET /ugc/:id` | `POST /ugc` | `PATCH /ugc/:id` | `DELETE /ugc/:id` oculta | editor |
| Vídeos | `id` ou `slug` | `GET /videos` | `GET /videos/:id` | `POST /videos` | `PATCH /videos/:id` | `DELETE /videos/:id` oculta | editor |
| Raspadinha | `id` | `GET /scratch-prizes` | `GET /scratch-prizes/:id` | `POST /scratch-prizes` | `PATCH /scratch-prizes/:id` | `DELETE /scratch-prizes/:id` desativa | editor |
| Banners | `id` | `GET /banners` | `GET /banners/:id` | `POST /banners` | `PATCH /banners/:id` | `DELETE /banners/:id` desativa | editor |
| Pedidos | `id` | `GET /orders` | `GET /orders/:id` | — | `PATCH /orders/:id` | — | atendimento |
| Clientes | `id` | `GET /customers` | `GET /customers/:id` | — | `PATCH /customers/:id` e `PATCH /customers/:id/points` | — | atendimento |
| Assinaturas | `id` | `GET /subscriptions` | — | — | `PATCH /subscriptions/:id` | `DELETE /subscriptions/:id` cancela | atendimento |
| Fidelidade | fixo `settings/loyalty` | — | `GET /settings/loyalty` | — | `PATCH /settings/loyalty` | — | dono |
| Upload | — | — | — | `POST /uploads` | — | — | editor |

`GET /categories` devolve categorias e objetivos juntos. Cada item traz `id`, `slug` e `kind` (`categoria` ou `objetivo`). `?kind=categoria` ou `?kind=objetivo` filtra. O `POST` aceita `slug` ou `id` no JSON; os dois são o slug. `PATCH` e `DELETE /categories/:slug` acham a linha na tabela `categories` ou em `goals`. O slug não muda: outro valor responde `409` `{ "error": "O slug não muda." }`. Apagar uma categoria em uso responde `409`.

`POST /kits` e `PATCH /kits/:id` aceitam o corpo completo de produto, com `isKit: true`, ou o formulário curto do painel: `{ "name", "discountPercent", "kitItems": [{ "productId", "quantity" }] }`. No `PATCH` curto o slug não muda. O desconto do kit fica entre 0% e 12%. `DELETE /kits/:id` arquiva.

Pedido, cliente e avaliação não nascem no admin. A avaliação se aprova, responde ou oculta. O cliente ajusta pontos e o status da assinatura. O pedido muda status e rastreio. `GET /orders/:id` inclui `lines`. `GET /customers` inclui `subscriptions` e `cpfMasked` (`***.***.***-25`). O JSON não traz o CPF inteiro. A listagem lê `cpf_enc` (AES-256-GCM), confere `cpf_key_id` e mostra a máscara. `PATCH /customers/:id` pode mandar `cpf`; a API grava `cpf_enc`, `cpf_key_id` e `cpf_hash` (HMAC-SHA256) e não reescreve `customers.cpf`. A coluna antiga permanece até o DBA apagar. A auditoria também sai mascarada. Sem `CPF_ENC_KEY`, `CPF_HMAC_KEY` e `CPF_KEY_ID`, esse PATCH responde 503.

`POST` e `PATCH /v1/admin/coupons` gravam `public`. Omitido, fica `false`. `GET /v1/coupons` só lista cupom `active` e `public`. A busca `q` do admin usa `ILIKE` sem índice trigram. Proposta, sem implementar: `pg_trgm` com GIN em nome, slug, SKU, código e rótulo de cupom, e nome do drop.

`POST` de um slug ou id que já existe responde `409`, não grava por cima. A atualização é o `PATCH`.

## Vitrine (`GET /v1/products`)

É a lista da loja. A resposta é `{ "source", "products" }`. `GET /v1/products/:slug` devolve `{ "source", "product", "reviews" }` ou `404` `{ "error": "Produto não encontrado." }`. Os dois mandam `Cache-Control: no-store`.

Entra produto com `status = 'ativo'` e `active = true`. No JSON do admin isso é `publicado`. O painel também manda `ativo`, e a API grava os dois como `ativo`. `rascunho`, `oculto` e `arquivado` ficam de fora, e o `GET` por slug desses responde `404`. Cada item da lista sai com `hidden: false`. O nome, o sabor e o estoque vêm das tabelas, não de `products.payload`.

`POST` e `PATCH /v1/admin/products` devolvem o `item` com o id que ficou no banco. Id que já é deste produto atualiza a linha e volta igual. Id que não existe em variação nem em foto nenhuma é gravado como o cliente mandou. Sem `id`, o servidor gera `<produto>__<sabor>__<posição>` na variação e `<produto>__img__<posição>` na foto (posição 0 no primeiro item; se esse texto já existir, `__1`, `__2`). Id de outro produto não grava nada: a transação desfaz o envio inteiro e responde `409`.

```json
{ "error": "Essa variação pertence a outro produto.", "code": "variacao_de_outro_produto" }
```

```json
{ "error": "Essa foto pertence a outro produto.", "code": "imagem_de_outro_produto" }
```

O mesmo `code` vale se o id vier repetido no corpo. Aí o `error` é `Essa variação está repetida no envio.` ou `Essa foto está repetida no envio.`

Com `API_DATA_SOURCE=postgres` e `REDIS_URL`, a lista fica 60 segundos na chave `catalog:products`. Criar, atualizar ou arquivar produto ou kit apaga essa chave, então o próximo `GET` lê o banco de novo. Cache que não é uma lista é ignorado. Produto com `hidden: true` não volta nem do cache. Sem Redis, cada `GET` lê o banco. Sem `API_DATA_SOURCE=postgres`, `source` é `mock` e a lista é `@pulso/data`. Banco no ar sem nenhum produto `ativo` responde `source: mock-fallback` com esse mesmo catálogo. Falha de banco também cai nesse fallback.

## Rotas públicas de collab e post

Com `API_DATA_SOURCE=postgres` e banco, a leitura é a tabela. Sem banco, a resposta usa `@pulso/data` e `source` é `mock`. Influencer inativo e post rascunho, arquivado ou agendado para o futuro não entram. Post `publicado`, ou `agendado` com `publishedAt` até hoje, entra.

`GET /v1/influencers`

```json
{
  "source": "postgres",
  "influencers": [
    {
      "slug": "luna-teste",
      "name": "Luna Teste",
      "handle": "@lunateste",
      "coupon": "LUNA15",
      "discountPercent": 15,
      "city": "São Paulo",
      "sport": "Hyrox",
      "bio": "Treina cedo.",
      "followers": "10 mil",
      "accent": "#ff5cae",
      "productSlugs": [],
      "story": "…",
      "instagramUrl": null,
      "quotes": [{ "id": "…", "body": "Sabor antes do shape.", "position": 0 }],
      "images": [{ "id": "…", "url": null, "alt": "Retrato", "caption": "", "instagramPostUrl": null, "fallbackHex": "#ff5cae", "position": 0 }],
      "path": "/atletas/luna-teste"
    }
  ]
}
```

`GET /v1/influencers/:slug` devolve `{ "source", "influencer" }` no mesmo formato, ou `404` `{ "error": "Atleta não encontrado." }`. `path` é sempre `/atletas/<slug>`.

`GET /v1/posts` e `GET /v1/posts?influencer=<slug>`:

```json
{
  "source": "postgres",
  "posts": [
    {
      "slug": "collab-luna-teste",
      "title": "Collab em teste",
      "excerpt": "Um texto curto.",
      "category": "Collab",
      "readMinutes": 3,
      "author": "Redação PULSO",
      "authorSlug": "redacao",
      "authorAvatar": null,
      "authorBio": "Textos da casa.",
      "publishedAt": "2026-10-01",
      "coverHex": "#d6ff3c",
      "coverUrl": "https://cdn.pulso.test/capa.jpg",
      "body": ["Suplemento alimentar não é medicamento."],
      "blocks": [{ "id": "…", "type": "paragrafo", "text": "…" }],
      "authorId": "redacao",
      "influencerSlug": "luna-teste",
      "path": "/blog/collab-luna-teste"
    }
  ]
}
```

`author` é o nome. `authorSlug`, `authorAvatar` e `authorBio` vêm do autor (`authors.id`, `photo_url`, `bio`) e saem `null` quando não há autor ou o campo está vazio. O mock usa o mesmo formato, com esses três em `null`. `body` continua sendo só os parágrafos. `blocks` traz `paragrafo`, `titulo`, `imagem`, `citacao_lateral` e `produto`. `GET /v1/posts/:slug` devolve `{ "source", "post" }` ou `404` `{ "error": "Texto não encontrado." }`.

A lista e o detalhe só trazem post `publicado`, ou `agendado` com `publishedAt` até a data UTC de hoje. Rascunho, arquivo e agendado futuro ficam de fora (o detalhe responde 404). `coverUrl`, `authorAvatar` e a `url` de um bloco `imagem` só saem se forem `https://` ou um caminho com uma barra; `javascript:`, `data:`, `http:` e `//` viram `null`. O JSON público não traz `status`, `seoTitle`, `seoDescription` nem `shareImageUrl`. O admin continua vendo esses campos.

## Auditoria

`GET /v1/admin/audit` é só do `dono`. Editor e atendimento recebem `403`. Sem sessão, `401`. `GET /v1/admin/audit-log` é o mesmo handler.

Filtros na query: `actor` (id em `admin_users`), `entity`, `entityId`, `from` e `to`. Data `YYYY-MM-DD` vale o dia UTC inteiro. Data com hora compara o instante. Data inválida responde `400` `{ "error": "Data inválida." }`.

`page` começa em 1. `pageSize` vai de 1 a 100, padrão 50.

```json
{
  "page": 1,
  "pageSize": 50,
  "total": 1,
  "items": [
    {
      "id": "…",
      "actorId": "dono",
      "action": "login",
      "entity": "admin_user",
      "entityId": "dono",
      "before": null,
      "after": { "email": "dono@pulso.local", "role": "dono" },
      "createdAt": "2026-10-23T12:00:00.000Z"
    }
  ]
}
```

`/atletas`, `/atletas/:slug`, `/blog` e `/blog/:slug` leem `GET /v1/influencers` e `GET /v1/posts` quando a API responde, seja `source` `postgres` ou `mock`. O arquivo do adaptador não alimenta essas páginas. Se a API não responder, a página volta ao catálogo `@pulso/data`. Um `404` da API não abre a ficha do arquivo. `generateStaticParams` lista o catálogo; o slug novo abre no pedido, dentro do `Suspense`. Influencer criado no admin só ganha página pública quando a API o devolve.

## Drops públicos

`GET /v1/drops` e `GET /v1/drops/:id`

```json
{
  "source": "postgres",
  "drops": [
    {
      "id": "drop-04-melancia",
      "edition": "Drop 04",
      "name": "Melancia Ácida",
      "productId": "caos-pre-treino",
      "flavorId": "melancia",
      "startsAt": null,
      "endsAt": "2026-11-08T23:59:00-03:00",
      "unitsTotal": null,
      "unitsLeft": 14,
      "teaser": "",
      "heroImageUrl": null,
      "story": "",
      "status": "no_ar",
      "state": "no_ar",
      "waitlistCount": 0
    }
  ]
}
```

`waitlistCount` é `count(*)` de `drop_waitlist` com `anonymized_at` nulo naquele drop. A resposta não inclui e-mail. Linha anonimizada não entra na conta.

`unitsLeft` com sabor é o menor `stock` das variações daquele sabor. Sem sabor, é a coluna `units_left`, e `null` continua `null`. `state` é `esgotado` só quando `unitsLeft` é `0`. Sem banco, o mock usa o estoque do sabor quando o id do drop termina com o id do sabor; senão usa o `unitsLeft` do próprio drop. O teaser fica com `unitsLeft` nulo e `waitlistCount` 0.

O card da home lê esse `unitsLeft` (o do drop, ou o mínimo do sabor). Não usa o `unitsLeft` embutido no produto do catálogo quando o drop tem sabor.

`POST /v1/drops/:id/waitlist` com `{ "email", "consent": true, "consentOrigin"? }` grava a lista. Sem `consent: true`, `400`. E-mail novo e e-mail que já estava respondem a mesma coisa: `200` `{ "ok": true }`. Sem banco, `503`.

`POST /v1/drops/waitlist/erase` responde `410` `{ "error": "A saída da lista é só pelo atendimento." }`. Não apaga, não anonimiza e não diz se o e-mail estava na lista. Quem quer sair pede ao suporte. O dono ou o atendimento apaga uma inscrição com `DELETE /v1/admin/drops/waitlist/:id` (o `id` da linha) ou todas as inscrições ativas daquele e-mail com `POST /v1/admin/drops/waitlist/erase`. Os dois gravam `audit_log` com a ação `waitlist.erase`, sem o e-mail. A lista (`GET /v1/admin/drops/:id/waitlist`) abre para dono e atendimento. O dono recebe o e-mail inteiro. O atendimento recebe a máscara `j***@d***.com` (`julia@dominio.com`) e apaga com `DELETE` pelo `id` da linha. O editor recebe `403` e o corpo não traz e-mail. Sem sessão, `401`. Inscrição ausente, `404`. Anonimizar continua `POST /v1/admin/drops/waitlist/anonymize`, papel de editor. A confirmação por link no e-mail fica para o Léo decidir.

## Variação sem porção

`servings` menor que 1 é recusado também em rascunho. A API responde `400` (`A variação precisa de pelo menos uma porção.`). O painel mostra esse erro e não grava por fora. A coluna no banco já exige `servings > 0`.
