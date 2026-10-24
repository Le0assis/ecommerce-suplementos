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

A coluna ainda não está na migração. O DBA acrescenta:

```sql
alter table coupons
  add column public boolean not null default false;
```

Enquanto ela não existir, a API devolve lista vazia. O seed pode marcar `public = true` nos cinco códigos anunciados. O padrão `false` não vaza a raspadinha.

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
| `customers`, `addresses` | Criadas, sem escrita da loja |
| `orders`, `order_lines` | Status: `pagamento_pendente`, `pago`, `separando`, `enviado`, `entregue`, `cancelado` |
| `payments`, `shipments` | Prontas para o gateway e o rastreio |
| `points_ledger` | `delta` com sinal. Motivo em texto |
| `wishlist_items` | Par (`customer_id`, `product_slug`) |
| `subscriptions` | `ativa`, `pausada`, `cancelada`, `next_charge_on` |

A conta, o pedido e a raspadinha que você vê no site estão no `localStorage`, não nessas tabelas. O pedido demo `PLDEMOANA` também é código (`apps/web/src/lib/demo.ts`).

## Conta e pedido no servidor (proposta para o DBA)

A loja ainda não grava cliente nem pedido. Esta etapa não cria a rota: o preço do checkout já sai do catálogo, e o saldo de pontos no orçamento fica 0 até a sessão existir. A migração é do DBA. As tabelas `customers`, `addresses`, `orders`, `order_lines`, `payments`, `shipments` e `points_ledger` continuam. Falta o que autentica e o que o orçamento precisa ler sem confiar no navegador.

`customers`, além do que já existe (`id`, `email` único, `name`, `cpf`, `cpf_enc`, `cpf_key_id`, `cpf_hash`, `phone`, `points_balance`, `points_lifetime`, `marketing_opt_in`, `created_at`):

| Coluna | Tipo | Papel |
| --- | --- | --- |
| `password_hash` | `text` nulo | scrypt, o mesmo formato de `admin_users`. Nulo até a pessoa definir senha. Não sai no JSON |

`customer_sessions`, no mesmo desenho de `admin_sessions`:

| Coluna | Tipo | Papel |
| --- | --- | --- |
| `jti` | `text` primary key | id da sessão dentro do cookie assinado |
| `customer_id` | `text not null` | `references customers (id) on delete cascade` |
| `expires_at` | `timestamptz not null` | fim da sessão |
| `revoked_at` | `timestamptz` nulo | logout preenche e o cookie deixa de valer |
| `created_at` | `timestamptz not null default now()` | |

Índice em `customer_sessions (customer_id)`.

`orders`, além das colunas atuais:

| Coluna | Tipo | Papel |
| --- | --- | --- |
| `coupon_code` | `text` nulo | código aceito no servidor, não o percentual mandado pelo browser |
| `points_redeemed` | `integer not null default 0` | pontos debitados, nunca acima de `customers.points_balance` |
| `shipping_method` | `text` nulo | `pac` ou `sedex` |

`order_lines.unit_price_cents` e os totais de `orders` são gravados pela API a partir de `product_variants` e de `quoteCart`. O cliente manda `slug`, `variant` e `qty`.

A API, quando essas colunas existirem: `POST /v1/account/register`, `POST /v1/account/login` (cookie `HttpOnly`, `jti` em `customer_sessions`), `POST /v1/account/logout`, `GET /v1/account/orders`. O orçamento passa a ler `points_balance` e `points_lifetime` dessa sessão. E-mail no corpo do checkout não escolhe o saldo.

Índices: categoria de produto, review por produto, pedido por e-mail, ledger por cliente.
