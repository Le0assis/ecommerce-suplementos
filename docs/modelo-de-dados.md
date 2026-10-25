# Modelo de dados

Dinheiro é `integer` em centavos. Slug é a identidade estável (`caos-pre-treino`). Não use o nome visível como chave: o admin pode renomear.

## Produto (TypeScript)

Definido em `packages/domain/src/types.ts`. O catálogo acrescenta `label`.

| Campo | Papel |
| --- | --- |
| `slug`, `name`, `line`, `tagline` | Identidade e texto curto |
| `category` | Uma de `CATEGORIES` |
| `goals` | Lista de `GOALS` |
| `flavors` | Cor, família, estoque, `limited` |
| `variants` | Sabor × tamanho. `priceCents`, `sku`, `servings`, `weightGrams` |
| `subscription` | `enabled`, `discountPercent`, `intervalDays` (30) |
| `caffeineMg`, `proteinPerServingGrams` | Usados na ficha e no quiz |
| `drop` | `endsAt` ISO, `unitsLeft`, `teaser` |
| `isKit`, `kitItems` | Kit aponta para slugs |
| `hidden` | Some da vitrine pública |
| `label` | Rótulo: `registration` `NI-DEMO-…`, porção, ingredientes, alergênicos, `nutrition`, advertências |

`CatalogPatch` é o que o admin antigo grava no navegador: `hidden`, `priceCents`, `name`. `applyCatalogPatches` aplica em cima do catálogo base.

A API com Postgres não lê `products.payload`. Ela junta `products`, `product_flavors`, `product_variants`, `product_labels`, `nutrition_rows`, `product_images`, `product_goals`, `product_badges` e `kit_items`. Foto sem arquivo tem `url` nula e `fallback_hex` (`#rrggbb`). O estoque do sabor na vitrine é o menor estoque das variações daquele sabor, porque a tabela de sabor não tem coluna de estoque. `status` no banco é `rascunho`, `ativo`, `oculto` ou `arquivado`. O JSON do admin chama `ativo` de `publicado`, que é o valor da tela.

Drops ficam em `drops` (`005_drops.sql`). `units_total` e `units_left` podem ser nulos. A lista de espera é `drop_waitlist`: só e-mail, consentimento explícito, data e origem. Sem CPF, telefone ou IP.

## Cupom

`code`, `label`, `kind` (`percent` ou `shipping`), `percent`, `influencerSlug`, `active`, `public`.

`GET /v1/coupons` só devolve `active` e `public`. `POST /v1/coupons/validate` acha o código mesmo sem `public`. No mock, públicos: `LUNA15`, `CAIO10`, `NANDA10`, `THEO10`, `PULSO10`. A raspadinha (`RASPA5`, `RASPA10`, `RASPAFRETE`) fica de fora da lista. `VENCIDO` está inativo.

A migração `011_consulta_cupom_cpf.sql` acrescenta `coupons.public boolean not null default false`. Cupom que já existia fica de fora da lista anunciada. O seed de exemplo marca `public = true` em `LUNA15`, `CAIO10`, `NANDA10`, `THEO10` e `PULSO10`. O padrão `false` não vaza a raspadinha. `POST` e `PATCH /v1/admin/coupons` gravam `public`. Sem o campo, fica `false`.

A busca `q` do admin (produto, cupom e drop) usa `ILIKE`. `%` e `_` entram escapados. Essas colunas não têm índice. Proposta para o DBA, sem criar agora: extensão `pg_trgm` e índice GIN em `products.name`, `products.slug`, `product_variants.sku`, `coupons.code`, `coupons.label`, `drops.edition` e `drops.name`, quando o volume justificar. Até lá a consulta segue sem esse índice.

Ordem do orçamento em `quoteCart`:

1. Soma os itens e tira o desconto de assinatura de cada linha.
2. Desconto percentual: o maior entre cupom e kit (3 categorias ou mais, 12%), teto 30%. Não soma.
3. Pontos, no máximo 20% do valor já com esse desconto, limitados ao saldo.
4. Pix, 10% sobre o que sobrou de produto. Frete fora.
5. Frete PAC/SEDEX. Grátis se o produto (antes do Pix) atinge o piso do nível, ou se o cupom é `shipping`.
6. Pontos ganhos em cima do produto depois dos descontos. Pix multiplica por 1,2. Nível multiplica de novo.

## Níveis

| Id | Nome | Pontos de vida | Multiplicador | Frete PAC |
| --- | --- | --- | --- | --- |
| `rookie` | Rookie | 0 | 1 | R$ 299 |
| `atleta` | Atleta | 500 | 1,1 | R$ 299 |
| `bruto` | Bruto | 2000 | 1,25 | R$ 199 |
| `lenda` | Lenda | 6000 | 1,5 | R$ 149 |

5 pontos por real. 1 ponto = 1 centavo. Boas-vindas: 100. Indicação: 150 para quem indica e 80 para quem foi indicado, uma vez, no primeiro pedido pago.

## CEP

Oito dígitos. Primeiro dígito escolhe a região (preço e prazo). CEPs com rua pronta: `01310100` Paulista, `22041080` Copacabana, `30130010` BH, `80010000` Curitiba, `40020000` Salvador, `90010000` Porto Alegre, `70040902` Brasília, `60025100` Fortaleza.

## Postgres

Arquivo `packages/db/sql/001_init.sql`.

| Tabela | Uso neste corte |
| --- | --- |
| `products` | Seed grava `payload` jsonb. A API em modo postgres lê daqui |
| `coupons`, `influencers`, `posts`, `reviews` | Seed. Reviews referenciam `products.slug` |
| `customers`, `addresses` | A API de conta grava cadastro, telefone e endereço. A vitrine demo ainda não chama |
| `orders`, `order_lines` | A API grava o pedido da sessão. Status: `pagamento_pendente`, `pago`, `separando`, `enviado`, `entregue`, `cancelado` |
| `payments`, `shipments` | Prontas para o gateway e o rastreio |
| `points_ledger` | `delta` com sinal. Motivo em texto |
| `wishlist_items` | Par (`customer_id`, `product_slug`) |
| `subscriptions` | `ativa`, `pausada`, `cancelada`, `next_charge_on` |

A raspadinha que você vê no site continua no `localStorage`. A conta demo `ana@pulso.dev` e o pedido `PLDEMOANA` ainda nascem do código (`apps/web/src/lib/demo.ts`), só na memória. A chave `pulso-store` não grava `users`, `currentUserId` nem `guestOrders`. Um blob antigo com CPF, senha ou pedido é ignorado no merge. Sacola, favoritos e patches continuam no navegador.

## Conta e pedido no servidor

`POST /v1/account/register` e `POST /v1/account/login` usam `customers`. `password_hash` é scrypt, o formato de `admin_users` e o comentário da 012. Esta rota não grava argon2 nem bcrypt. O CPF do cadastro e do pedido vai para `cpf_enc`, `cpf_key_id` e `cpf_hash`. `customers.cpf` não é preenchido. A resposta leva `cpfMasked` (`***.***.***-NN`), nunca os 11 dígitos, e não leva senha. Sem `CPF_ENC_KEY`, `CPF_HMAC_KEY` e `CPF_KEY_ID` juntos, o CPF no cadastro e o pedido respondem 503.

`POST /v1/account/orders` exige a sessão. O preço sai de `quoteCart` no servidor. `orders.customer_id` e `orders.account_id` recebem o id da conta. `order_lines` é a fonte dos itens. `orders.items` é um snapshot jsonb sem CPF e sem cartão. O status inicial é `pagamento_pendente`. `total_cents` vem do orçamento e o domínio recusa total negativo. O e-mail do corpo não escolhe a conta nem o saldo. O cookie `pulso_customer` é `HttpOnly`, dura 30 dias e carrega o `jti` só no token. `customer_sessions` ainda não tem migração: o logout apaga o cookie, e um bearer copiado vale até expirar. O contrato para o Frontend está em [contratos-api.md](contratos-api.md) e [api.md](api.md).

Sem cookie, ou com saldo zero, `pointsToRedeem` maior que zero responde 422 `pontos_indisponiveis` no quote, no simulate e no pedido. Com sessão e `points_balance` positivo, o orçamento usa esse saldo. A vitrine ainda não chama essas rotas e o checkout continua escondendo o resgate. `payments` e `shipments` seguem sem escrita desta rota. Pix, boleto e cartão não cobram.

### Mapeamento (pedido do Backend → banco)

Não há tabela `accounts` nem um segundo `orders`. `customers` é a conta. `orders` é o pedido. A 012 não apaga linha e não copia `customer_id` para `account_id`.

| Pedido do Backend | Coluna real |
| --- | --- |
| `accounts` | `customers` |
| `accounts.id` | `customers.id` `text` primary key |
| `accounts.email` único em `lower(email)` | `customers.email` já é `unique`. O índice `customers_email_lower_key` em `lower(email)` só entra se não houver e-mail repetido ignorando a caixa. Havendo repetição, a migração emite `NOTICE` com a quantidade de grupos e de linhas e não cria o índice |
| `accounts.password_hash` | `customers.password_hash` `text` nulo (scrypt, o formato de `admin_users`) |
| `accounts.created_at` | `customers.created_at` |
| `cpf_enc` `bytea` | `customers.cpf_enc` (migração 010). A 012 não cria de novo |
| `cpf_hash` com índice | `customers.cpf_hash` e `customers_cpf_hash_key` (010, único onde não é nulo). `customers.cpf_key_id` também é da 010. `customers.cpf` em claro permanece |
| `orders` | `orders` |
| `orders.id` | `orders.id` |
| `orders.account_id` FK → conta | `orders.account_id` `text` nulo, FK `orders_account_id_fkey` → `customers(id)` `NOT VALID`. `orders.customer_id` segue como a FK já usada pelo admin |
| `orders.status` | `orders.status`. CHECK da 001: `pagamento_pendente`, `pago`, `separando`, `enviado`, `entregue`, `cancelado`. A 012 não acrescenta outro CHECK |
| `orders.total_cents` | `orders.total_cents` `integer` (centavos), mais CHECK `orders_total_cents_nonneg` (`total_cents >= 0`) `NOT VALID` |
| `orders.items` `jsonb` | `orders.items` `jsonb` nulo. As linhas normalizadas continuam em `order_lines` |
| `orders.created_at` | `orders.created_at` |
| índice `(account_id, created_at desc)` | `orders_account_created_idx` |

`customer_sessions` não existe. `orders.coupon_code`, `orders.points_redeemed` e `orders.shipping_method` também ficam fora da 012.

`customers.cpf` (`001_init.sql`) continua `text` em claro. A migração `010` já acrescentou, sem apagar essa coluna:

| Coluna | Tipo | Papel |
| --- | --- | --- |
| `cpf_enc` | `bytea` | AES-256-GCM. Os 12 bytes do nonce vêm na frente, depois a tag de 16 e o texto cifrado. Nonce novo a cada gravação |
| `cpf_key_id` | `text` | Id da chave (`CPF_KEY_ID`), para trocar a chave sem misturar o material |
| `cpf_hash` | `text` | HMAC-SHA256, em hex, do CPF com 11 dígitos. Chave separada (`CPF_HMAC_KEY`) |

Índice único parcial `customers_cpf_hash_key` em `cpf_hash` onde ele não é nulo. Busca e unicidade usam o hash, sem decifrar. `CPF_ENC_KEY` e `CPF_HMAC_KEY` são 32 bytes em base64 e não entram no repositório.

A aplicação lê e grava essas colunas. `pnpm db:backfill-cpf` copia o que ainda está em claro e não altera `customers.cpf`. Escrita nova (`PATCH /v1/admin/customers/:id` com `cpf`) preenche só `cpf_enc`, `cpf_key_id` e `cpf_hash`. A resposta do admin e o `audit_log` levam `cpfMasked` (`***.***.***-25`), nunca os 11 dígitos. Tirar a coluna `cpf` fica para o DBA, depois do backfill e com o OK do Léo.

`customers.password_hash` já entrou na 012, nulo até a pessoa definir senha, e não sai no JSON.

`customer_sessions` ainda não tem migração. O desenho, no mesmo formato de `admin_sessions`:

| Coluna | Tipo | Papel |
| --- | --- | --- |
| `jti` | `text` primary key | id da sessão dentro do cookie assinado |
| `customer_id` | `text not null` | `references customers (id) on delete cascade` |
| `expires_at` | `timestamptz not null` | fim da sessão |
| `revoked_at` | `timestamptz` nulo | logout preenche e o cookie deixa de valer |
| `created_at` | `timestamptz not null default now()` | |

Índice em `customer_sessions (customer_id)`.

Ainda sem migração, em `orders`:

| Coluna | Tipo | Papel |
| --- | --- | --- |
| `coupon_code` | `text` nulo | código aceito no servidor, não o percentual mandado pelo browser |
| `points_redeemed` | `integer not null default 0` | pontos debitados, nunca acima de `customers.points_balance` |
| `shipping_method` | `text` nulo | `pac` ou `sedex` |

`order_lines.unit_price_cents` e os totais de `orders` são gravados pela API a partir de `product_variants` e de `quoteCart`. O cliente manda `slug`, `variant` e `qty`.

Rotas já no ar, sem a tabela `customer_sessions`: `POST /v1/account/register`, `POST /v1/account/login` (cookie `HttpOnly`; o `jti` vai no token, não numa linha), `POST /v1/account/logout` (apaga o cookie), `GET /v1/account/me`, `GET /v1/account/orders` e `POST /v1/account/orders`. O orçamento com sessão lê `points_balance` e `points_lifetime` dessa conta. E-mail no corpo do checkout não escolhe o saldo. Quando o DBA criar `customer_sessions`, o logout passa a preencher `revoked_at`.

Índices: categoria de produto, review por produto, pedido por e-mail, ledger por cliente.
