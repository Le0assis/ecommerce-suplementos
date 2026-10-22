# Requisitos técnicos — PULSO

Dono: Gustavo. Mercado primeiro: Brasil. Idioma: pt-BR. Moeda: BRL. Público: gente jovem que treina (Gen Z), linguagem direta, visual escuro com um neon só.

Este documento descreve o produto alvo e marca, em cada requisito, o que o protótipo de código já entrega. O status detalhado está em [roadmap-e-status.md](roadmap-e-status.md).

## 1. Contexto

A PULSO vende suplemento alimentar: pré-treino, whey, creatina, intra, termogênico, vitamina, hipercalórico, barra e kit. A referência visual de mercado (Ghost, Alani Nu, RAW, Gorilla Mind, Gymshark, RYSE, PRIME, Dark Lab, Integralmedica, Transparent Labs, Optimum Nutrition, Growth, Bucked Up) orienta o tom. A loja não copia marca, embalagem nem foto de atleta real.

Premissas de negócio já codificadas:

- Pix com 10% em cima do produto, nunca do frete.
- Boleto e cartão parcelado (1–3x sem juros, 4–12x a 1,99% a.m., parcela mínima R$ 5).
- Frete PAC grátis a partir de R$ 299 (piso menor nos níveis Bruto e Lenda).
- CEP brasileiro. No protótipo a consulta é tabela local, não ViaCEP nem contrato dos Correios.
- Rótulo no estilo ANVISA, com registro fictício `NI-DEMO-` e a frase “não é medicamento”.

## 2. Requisitos funcionais

Cada item diz o comportamento esperado e onde o protótipo mora.

### RF01 — Catálogo por objetivo e categoria

A pessoa filtra por objetivo (hipertrofia, cutting, energia, recuperação, resistência, saúde) e por categoria. A busca ignora acento.

Protótipo: `/loja`, `/objetivos/[goal]`, `/busca`. Regras em `packages/data/src/query.ts`. Categorias e objetivos em `packages/domain/src/types.ts`.

### RF02 — Página de produto com sabor na frente

O sabor é o herói: seletor de sabor, tamanho, estoque, preço Pix, assinatura e quantidade. O rótulo (ingredientes, alergênicos, tabela nutricional, advertências) fica visível. Avaliações com nota entram na mesma página.

Protótipo: `/loja/[slug]`, componente `apps/web/src/components/product/buy-box.tsx`. O “pote” é CSS, não foto remota.

### RF03 — Assinatura recorrente

Compra recorrente com desconto (padrão 10%, a cada 30 dias). A pessoa pausa ou cancela na conta.

Protótipo: o desconto entra no orçamento (`quoteCart`). A assinatura criada no checkout fica no `localStorage` e aparece em `/conta/assinaturas`. Não há cobrança recorrente em gateway.

### RF04 — Kits e combos

Kit pronto no catálogo e um montador: três categorias no carrinho ganham 12%. Esse 12% não soma com cupom percentual: vale o maior desconto, com teto de 30%.

Protótipo: produto `kit-bruto` e página `/kits`. Regra em `packages/domain/src/quote.ts`.

### RF05 — Quiz de objetivo

Perguntas curtas (objetivo, cafeína, família de sabor, orçamento) devolvem uma lista de produtos. Cafeína zero troca o pré com estimulante pelo pré sem cafeína.

Protótipo: `/quiz` e `POST /v1/quiz`. Função `quizResult`.

### RF06 — Calculadora de proteína e creatina

Proteína: meta em g/kg conforme o objetivo, descontando o que a comida já cobre (padrão 1 g/kg), scoop de 25 g. Creatina: 5 g se o peso for ≥ 90 kg, senão 3 g. Peso aceito entre 35 e 220 kg. O texto não promete resultado clínico.

Protótipo: `/calculadora` e `POST /v1/calculators/protein` e `/creatine`.

### RF07 — Pontos, cashback e níveis

5 pontos por real em produto. 1 ponto vale 1 centavo. Resgate máximo de 20% do produto. Pix dá +20% de pontos. Níveis: Rookie (0, 1x), Atleta (500, 1,1x), Bruto (2000, 1,25x, frete a partir de R$ 199), Lenda (6000, 1,5x, frete a partir de R$ 149). Boas-vindas: 100 pontos.

Protótipo: `packages/domain/src/loyalty.ts`. Saldo da conta demo vive no navegador. A tabela `points_ledger` existe e ainda não recebe escrita da loja.

### RF08 — Raspadinha

Uma raspadinha por dia no fuso `America/Sao_Paulo`, com prêmios ponderados (cupom ou pontos). Quem não consegue raspar no canvas tem botão de revelar.

Protótipo: `/raspadinha`, `packages/domain/src/scratch.ts`. O prêmio não vai para o banco.

### RF09 — Cupom e página de atleta

Cupom de influenciador e página com a pessoa, o esporte e os produtos. Cupom inativo é recusado com mensagem clara.

Protótipo: `/atletas`, `/atletas/[slug]`. Códigos em `packages/data/src/coupons.ts`.

### RF10 — Drops e edição limitada

Edição com data de fim, unidades e contagem regressiva. Drop futuro pode aparecer como teaser.

Protótipo: `/drops` e o bloco da home. Datas de exemplo: melancia em 2026-11-08, collab Luna em 2026-11-30, Drop 05 teaser em 2026-12-15.

### RF11 — Avaliações com foto

Nota, texto, compra verificada e foto. No protótipo a “foto” é um bloco de cor com texto alternativo, para não depender de imagem de pessoa real.

Protótipo: `packages/data/src/reviews.ts`, acordeão na PDP.

### RF12 — Barra de frete grátis

O carrinho mostra quanto falta para o PAC grátis, respeitando o nível da conta logada.

Protótipo: gaveta do carrinho e checkout. Função `freeShippingProgress`.

### RF13 — Blog de treino

Textos educativos, sem lorem e sem promessa milagrosa (termogênico não “queima gordura sozinho”).

Protótipo: `/blog`, `/blog/[slug]`. Quatro posts em `packages/data/src/content.ts`.

### RF14 — Social e UGC

Links de Instagram, TikTok e YouTube sempre visíveis. Mural de posts da comunidade.

Protótipo: `/social` e a faixa da home. Os perfis `@pulsosuplementos` são fictícios.

### RF15 — Carrinho e checkout

Carrinho com quantidade, cupom, pontos (se logado) e escolha de Pix, boleto ou cartão. Checkout em passos: contato, entrega, pagamento, revisão. Exige 18+, aceite dos termos e da LGPD. Pix e boleto exibem payload falso marcado como demonstração. Cartão de teste `4242424242424242` passa no Luhn.

Protótipo: `/carrinho`, `/checkout`, `/pedido/confirmado`. Validação em `validateCheckout`. A API tem `POST /v1/checkout/simulate`, que recalcula e devolve `simulated: true`. A vitrine grava o pedido no navegador, não chama essa rota ainda.

### RF16 — Frete por CEP

CEP com 8 dígitos. `00000000` é inválido. CEPs conhecidos preenchem rua. Os demais usam a região do primeiro dígito e deixam a rua para a pessoa completar. PAC e SEDEX com preço e prazo. O preço base nunca nasce grátis: a gratuidade é regra do carrinho.

Protótipo: `packages/domain/src/shipping.ts`. Não há chamada à ViaCEP.

### RF17 — Conta

Cadastro e login locais, pedidos, pontos, endereços, assinaturas, favoritos. Conta demo Ana.

Protótipo: `/entrar`, `/criar-conta`, `/conta` e subpáginas, `/favoritos`. Senha fica no `localStorage`. Isso não é autenticação.

### RF18 — Rastreio

Consulta por código de pedido. A conta demo tem o pedido `PLDEMOANA` com rastreio `PL123456789BR`. Dá para avançar o status na demonstração (pagamento pendente → pago → separando → enviado → entregue) e cancelar enquanto estiver pendente, devolvendo pontos usados.

Protótipo: `/rastreio` e `/conta/pedidos`.

### RF19 — Lista de desejos

Coração no card. Visitante e conta logada têm listas separadas. No login, a lista de visitante se junta à da conta.

Protótipo: store Zustand, chave por id de usuário ou `guest`.

### RF20 — Admin / CMS leve

Com a senha do protótipo, a pessoa esconde produto, muda nome e preço. A alteração é um patch no navegador, aplicado depois da hidratação para o HTML do servidor continuar igual ao catálogo base.

Protótipo: `/admin`. Não é Sanity nem Payload. Não altera o Postgres.

## 3. Requisitos não funcionais

### RNF01 — Mobile primeiro e desempenho

Layout usable no celular, navegação inferior, pote em CSS (sem imagem remota no LCP). Meta: LCP baixo em 4G. O protótipo não tem orçamento de Core Web Vitals medido em laboratório.

### RNF02 — SEO

`metadata` em pt-BR, `sitemap.ts`, `robots.ts`, JSON-LD na PDP, URL canônica via `NEXT_PUBLIC_SITE_URL`. Páginas de cliente (carrinho, checkout, conta) não precisam ranquear.

### RNF03 — Acessibilidade

Alvo WCAG 2.2 AA: foco visível lima, link de pular para o conteúdo, raspadinha com alternativa sem canvas, contraste do texto `#b4b4be` sobre fundo `#070708`. Não houve auditoria formal com leitor de tela.

### RNF04 — LGPD

Banner de cookie, página `/privacidade`, checkbox no checkout. O protótipo explica que o estado fica no navegador. Não há DPO, registro de consentimento em servidor nem fluxo de exclusão de dados pessoais além de apagar o `localStorage`.

### RNF05 — ANVISA e rotulagem

Todo produto tem porção, tabela, ingredientes, alergênicos e advertências. Registro exibido como fictício. Sem claim terapêutico. Responsável técnico marcado como “a definir” — não inventar CRN.

### RNF06 — Segurança

Cabeçalhos `nosniff`, `SAMEORIGIN`, `Referrer-Policy`, `Permissions-Policy`. API com CORS aberto (protótipo) e limite de 60 POST por minuto em memória. Segredos reais não entram no repositório. A senha de admin pública é dívida consciente, documentada, não um controle de acesso.

### RNF07 — Observabilidade

Alvo: logs estruturados, tracing e métrica de checkout. Hoje existe `GET /health` (postgres e redis: ok, skipped ou down) e o CI. Não há OpenTelemetry ligado.

### RNF08 — Testes

Regras de dinheiro têm teste unitário. Contrato da API tem teste sem banco. E2E de navegador (Playwright) está no alvo e ainda não está instalado.

## 4. Arquitetura

```
navegador
  └─ Next.js (apps/web) ──hoje──► @pulso/data (memória)
                     └─ previsto ► API Hono (apps/api)
                                      ├─ mock
                                      ├─ Redis (cache 60s)
                                      └─ Postgres (products.payload e tabelas futuras)
regras puras: @pulso/domain (sem IO)
```

O alvo de produção, quando o volume justificar, é um commerce headless (Medusa ou Saleor) no lugar do carrinho em `localStorage`, um CMS (Payload ou Sanity) no lugar do admin local, e busca (Meilisearch ou Algolia) no lugar do filtro em memória. A justificativa e a comparação estão em [stack.md](stack.md). A decisão de não embutir esses sistemas neste corte está no [ADR 003](adr/003-mock-antes-do-medusa.md).

## 5. Stack deste repositório

| Camada | Escolha | Versão de referência |
| --- | --- | --- |
| Linguagem | TypeScript ponta a ponta | 5.9 |
| Runtime | Node.js | 22 (testado 22.23.4) |
| Pacotes | pnpm workspaces | 10.33.4 |
| Tarefas | Turborepo | 2.11 |
| Site | Next.js App Router, React | 16.4.2 / 19.3 |
| Estilo | Tailwind CSS | 4 |
| Primitivos | shadcn/ui new-york sobre Radix | ver `apps/web/package.json` |
| Estado do cliente | Zustand persist | 5 |
| Movimento | CSS (marquee, reduced-motion). Framer Motion está instalado e pouco usado. GSAP fica como alternativa futura, não instalado | — |
| API | Hono + `@hono/node-server` | 4.x |
| Banco | PostgreSQL | 16 |
| Cache | Redis | 7 |
| Teste | Vitest | 3.2 |
| CI | GitHub Actions | Node 22, pnpm frozen |

## 6. Modelo de dados (visão)

Preço sempre em centavos. Identidade de produto é o `slug`.

No TypeScript, `Product` tem sabores, variantes (sabor × tamanho), rótulo, metas, drop e itens de kit. O catálogo concreto é `CatalogProduct` (produto + rótulo).

No Postgres (`packages/db/sql/001_init.sql`): `products.payload` jsonb guarda o produto inteiro neste corte. Já existem tabelas normalizadas vazias de escrita da loja: `customers`, `addresses`, `orders`, `order_lines`, `payments`, `shipments`, `points_ledger`, `wishlist_items`, `subscriptions`, além de `coupons`, `influencers`, `posts` e `reviews` preenchidas pelo seed.

Detalhe coluna a coluna: [modelo-de-dados.md](modelo-de-dados.md).

## 7. Divisão de time

Papéis para quando o time crescer. Uma pessoa pode acumular no protótipo.

**Frontend.** App Router, design system, PDP, checkout, movimento, SEO e acessibilidade da vitrine. Não reimplementa regra de preço no componente: chama `@pulso/domain`.

**Backend.** API, integração de pagamento (Mercado Pago e/ou Pagar.me), CEP/frete real, sessão, pedido e assinatura. Mantém o contrato em [contratos-api.md](contratos-api.md). A simulação atual precisa continuar marcada até o gateway existir.

**DBA.** Schema, migração, índice, backup e a decisão de quando o `payload` jsonb vira colunas. Pedido e ledger não podem perder histórico. Migração nova é outro arquivo SQL, não edição destrutiva do `001` em ambiente que já rodou.

**QA.** Casos de domínio (Pix não incide em frete, kit versus cupom, teto de pontos, CPF, Luhn, CEP inválido) e, na fase seguinte, Playwright nos fluxos de compra, conta e admin. Conferência de rótulo: todo produto novo tem alergênico, porção e advertência.

## 8. Roadmap em fases

**Fase 0 — este repositório.** Vitrine completa, regras testadas, API de leitura e simulação, SQL e Docker, documentação.

**Fase 1 — vitrine na API.** As páginas passam a usar `loadStorefront`. Pedido e cliente gravam no Postgres. Admin escreve no banco, não no `localStorage`.

**Fase 2 — commerce e busca.** Medusa (ou Saleor) assume carrinho, estoque e pedido. Meilisearch (ou Algolia) assume a busca. O domínio de preço continua a fonte da regra de Pix e nível, ou vira plugin explícito.

**Fase 3 — dinheiro e frete de verdade.** Mercado Pago e/ou Pagar.me, ViaCEP, cotação de transportadora, webhook com idempotência. some a palavra “simulado” da UI só quando isso existir.

**Fase 4 — conteúdo e recorrência.** CMS (Payload no próprio Postgres, ou Sanity), assinatura com cobrança real, e-mail transacional.

**Fase 5 — operação.** LGPD operacional (exportar e apagar conta), observabilidade, auditoria de acessibilidade, registro ANVISA real antes de qualquer venda.

## 9. Fora deste corte

- Cobrança real, antifraude e nota fiscal.
- Estoque multi-depósito e ERP.
- App nativo.
- Indicação terapêutica ou público infantil. O checkout exige 18+.
