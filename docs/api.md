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

Papéis: `dono` (tudo, inclusive fidelidade e `GET /v1/admin/audit-log`), `editor` (catálogo, conteúdo, cupom, promoção, drop, quiz, raspadinha, banner, upload) e `atendimento` (pedido, avaliação, cliente). Outro papel ou conta inativa responde `401` com `{ "error": "E-mail ou senha não confere." }`.

Senha errada soma `failed_attempts` no banco antes de conferir o hash e espera um atraso que cresce até 8 segundos. A conta não trava: a senha certa zera o contador e `locked_until`. Trinta falhas no mesmo IP, na memória do processo, respondem `429` com `Retry-After: 900`. O IP é o do socket. `X-Forwarded-For` só entra se esse socket estiver em `TRUSTED_PROXIES`; vale o salto mais à direita que não é proxy. Com `VERCEL=1`, o cabeçalho lido é `x-vercel-forwarded-for`.

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

O site ainda conta 8 falhas em 15 minutos por IP do primeiro salto de `X-Forwarded-For` e responde `429`. Isso trava só o route handler daquele IP. Não trava a conta no banco.

O arquivo `apps/web/.data/admin-mock.json` continua existindo para o CRUD de teste quando a API está fora. Sem a API não dá para obter sessão, então o painel não abre por esse arquivo.

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
      "publishedAt": "2026-10-01",
      "coverHex": "#d6ff3c",
      "body": ["Suplemento alimentar não é medicamento."],
      "blocks": [{ "id": "…", "type": "paragrafo", "text": "…" }],
      "authorId": "redacao",
      "influencerSlug": "luna-teste",
      "path": "/blog/collab-luna-teste"
    }
  ]
}
```

`body` continua sendo só os parágrafos. `blocks` traz `paragrafo`, `titulo`, `imagem`, `citacao_lateral` e `produto`. `GET /v1/posts/:slug` devolve `{ "source", "post" }` ou `404` `{ "error": "Texto não encontrado." }`.

A vitrine ainda lê o adaptador (`apps/web/.data/admin-mock.json`) e, se ele não tiver o slug, o catálogo. Quando `source` da API é `postgres`, `/atletas`, `/atletas/:slug` e `/blog/:slug` preferem essa resposta. Influencer ativo que só existe no adaptador também ganha `/atletas/<slug>`. `generateStaticParams` lista o catálogo; o slug novo abre no pedido, dentro do `Suspense`.

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

`POST /v1/drops/:id/waitlist` com `{ "email", "consent": true, "consentOrigin"? }` grava a lista. Sem `consent: true`, `400`. O mesmo e-mail no mesmo drop responde `200` `{ "already": true }`. Sem banco, `503`.

`POST /v1/drops/waitlist/erase` responde sempre `200` `{ "ok": true }` e não apaga, não anonimiza e não diz se o e-mail estava na lista. A saída por link de e-mail ainda não existe. Apagar e anonimizar seguem em `POST /v1/admin/drops/waitlist/erase` e `POST /v1/admin/drops/waitlist/anonymize`.

## Variação sem porção

`servings` menor que 1 é recusado também em rascunho. A API responde `400` (`A variação precisa de pelo menos uma porção.`). O adaptador do site responde `400` (`A variação precisa de pelo menos uma porção, mesmo em rascunho.`). A coluna no banco já exige `servings > 0`.
