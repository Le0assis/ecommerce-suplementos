# Funcionalidades

Cada bloco diz o que a pessoa vê, onde o código mora e como estender sem duplicar regra.

## Home `/`

Hero com a Luna e o pote Caos, faixa, objetivos, mais vendidos, palco de sabor, atalhos (Pix, raspadinha, calculadora), drop, atletas, UGC, avaliações e blog.

Onde: `apps/web/src/components/home/home-view.tsx`, página `apps/web/src/app/(loja)/page.tsx`.

Estender: novo bloco é uma seção nesse componente, lendo `@pulso/data`. Não busque produto com `fetch` solto no render: no Next 16 isso exige `Suspense` ou `"use cache"`.

## Catálogo `/loja`, `/objetivos/[goal]`, `/busca`

Filtro por objetivo, categoria, família de sabor e ordenação. A busca tira acento (`normalizeSearch`).

Onde: `apps/web/src/components/catalog/catalog-view.tsx`. `filterProducts` e `sortProducts` em `packages/data`.

Estender: categoria nova entra em `CATEGORIES` no domínio e num produto. O tipo é uma união: o TypeScript aponta o que falta.

## Produto `/loja/[slug]`

`generateStaticParams` com os slugs. Buy box em `Suspense` porque lê `useSearchParams` (`?sabor=`). Preço ao vivo usa o catálogo do contexto, então o patch do admin aparece depois da hidratação. JSON-LD de produto no servidor usa o catálogo base.

Onde: `apps/web/src/app/(loja)/loja/[slug]/page.tsx`, `buy-box.tsx`, `product-card.tsx`.

Sabor esgotado desabilita comprar. Assinatura aplica o percentual da ficha. Ao lado da compra, a ficha mostra que o produto não é medicamento, que a pessoa consulte um nutricionista ou médico, e que a venda é só para maiores de 18 anos.

## Quiz `/quiz`

Quatro respostas. Cafeína `zero` troca `caos-pre-treino` e o termogênico por `foco-pre-sem-cafeina`. Orçamento baixo devolve dois itens mais creatina.

Onde: `QuizView` em `experiences.tsx`, regra `packages/domain/src/quiz.ts`. A API repete em `POST /v1/quiz`. O teste `discovery.test.ts` garante que os slugs devolvidos existem no catálogo, inclusive quando a cafeína zero troca o Caos pelo Foco.

## Calculadora `/calculadora`

Proteína e creatina. Peso inválido mostra erro, não um número inventado.

Onde: `CalculatorView`, `packages/domain/src/calculators.ts`.

## Kits `/kits`

O montador sugere três produtos e mostra 12% em cima da soma dos preços mínimos. No carrinho, o desconto só existe quando há três categorias, e perde para um cupom percentual maior. Não some os dois. Ver `quoteCart`.

Kit pronto: slug `kit-bruto`.

## Carrinho `/carrinho` e gaveta

Linha, quantidade, cupom, barra de frete. Contador do header só depois de `hydrated`, senão o servidor e o cliente divergem. A gravação no `localStorage` também espera o rehydrate: um `set` anterior (o `page_view`) sobrescrevia a sacola e a conta no refresh.

Onde: `apps/web/src/lib/store.ts`, gaveta em `chrome.tsx`.

## Checkout `/checkout`

Passos: contato, entrega, pagamento, revisão. CEP preenche num único `setForm`. Frete usa o nível de quem está logado (`levelFor`). Cartão mostra a tabela de parcelas do orçamento. Pontos: slider se houver saldo.

Validação junta todos os erros (`validateCheckout`): e-mail, CPF, CEP, telefone, endereço, UF, cartão (Luhn e validade), 18+, termos, LGPD.

Pedido Pix/boleto nasce `pagamento_pendente` e os pontos esperam o avanço de status. Cartão aprovado na simulação já credita. Cancelar pendente devolve os pontos usados.

Onde: `checkout-view.tsx`. A confirmação em `/pedido/confirmado?codigo=` mostra a mensagem do sandbox e o `externalId`. A função pura é `sandboxCharge` em `packages/domain/src/sandbox-payment.ts`. A API expõe `POST /v1/payments/sandbox`. A vitrine chama a função direto, para o pedido no navegador e a API não divergirem.

O payload novo está em `serverCheckoutPayload`: `{ "lines": [{ "slug", "variant", "qty" }], "couponCode"?, "pointsToRedeem"? }`. `variant` é o id da variação. No catálogo o id é `slug__sabor__tamanho`, com o id do tamanho (`caos-pre-treino__limao__300`, não `__30`). Preço e nome não entram. `POST /v1/checkout/quote` responde `{ "summary": { "lines": [{ "name", "unitCents", "qty", "totalCents" }], "subtotalCents", "discountCents", "pointsRedeemed", "pointsEarned", "totalCents" } }`. Sem CEP no corpo, `shippingCents` fica de fora. Sem sessão de cliente o saldo no servidor é 0, então `pointsRedeemed` volta 0. `POST /v1/checkout/simulate` aceita a mesma linha e recusa preço, desconto e saldo vindos do navegador. `CHECKOUT_QUOTE_SHA` está vazio, então a tela segue o `quoteCart` local e `POST /api/checkout/quote` responde 409 sem chamar a API. Quando o SHA deste contrato entrar nessa constante, o resumo visível passa a ser o `summary`. A revisão também lembra os 18 anos.

## Conta

`/entrar`, `/criar-conta`, `/conta`, `/conta/pedidos`, `/conta/pontos`, `/conta/enderecos`, `/conta/assinaturas`, `/favoritos`.

O login abre com e-mail e senha vazios. A conta demo `ana@pulso.dev` / `pulso123` continua no navegador, sem vir preenchida. Senha comparada no browser. Wishlist de visitante funde no login.

Onde: `account-views.tsx`, `lib/demo.ts`, `lib/store.ts`.

## Rastreio `/rastreio`

Código do pedido. Demo: `PLDEMOANA`, objeto `PL123456789BR`.

## Drops `/drops`

O hero usa a cor do sabor, o nome da edição e o relógio em dias, horas, minutos e segundos. O relógio só lê a hora no cliente e não corre se a pessoa pedir menos movimento. O que resta sai do `unitsLeft` de `GET /v1/drops` (o estoque do próprio drop, ou o mínimo do sabor quando a API calcula assim). Sem a API, a página usa o estoque do sabor no catálogo. A barra “de Y” só aparece quando o lote total existe e não é menor que o estoque. Sem lote, a página diz “Restam X” e não inventa o total. Esgotado é estoque zero. Em breve borra o teaser e pede e-mail com consentimento. No ar tem o botão de compra. Encerrado vai para o arquivo. A lista passa por `POST /api/drops/:id/waitlist`, que chama `POST /v1/drops/:id/waitlist`. Se a API responder 503 ou não estiver no ar, a página mostra erro e não grava e-mail em arquivo. E-mail novo e e-mail repetido recebem a mesma resposta `200` `{ "ok": true }`, sem dizer se já estava na lista. `POST /api/drops/waitlist/erase` e `POST /v1/drops/waitlist/erase` respondem `410` e não apagam. Quem quer sair pede ao suporte; o dono ou o atendimento apaga pelo admin em `/admin/lista-espera`. A confirmação por link no e-mail fica para o Léo decidir. O número “pessoas na lista” é o `waitlistCount` de `GET /v1/drops`. A página não tem botão de saída: mostra que a saída é só pelo atendimento e aponta para a Ajuda. Avaliações de edições anteriores só entram quando o drop está encerrado.

## Atletas `/atletas` e `/atletas/[slug]`

A lista e a ficha vêm de `GET /v1/influencers` e `GET /v1/influencers/:slug`. Influencer criado no admin aparece quando a API o devolve. Sem resposta da API, a página usa `@pulso/data` e não inventa frase nem foto. A página da collab é um retrato de 280 px ao lado do nome, @, esporte e seguidores. A história substitui a bio quando existe. Até quatro frases giram devagar (param se a pessoa pedir menos movimento). O carrossel usa a foto ou a cor reserva, e cada foto abre o post do Instagram só se o link for `https://` ou um caminho com uma única `/`. O botão “Seguir no Instagram” fica fixo no celular. O cupom fica abaixo das fotos e os posts ligados ao influencer fecham a página. Influencer inativo não entra na resposta da API.

## Indicação `/conta/indicar`

O código sai de `referralCodeFrom` (nome + fim do id). No cadastro, o campo opcional chama `matchReferral`. O bônus só cai quando o primeiro pedido dessa pessoa é pago (`pointsCredited`), via `applyReferralReward`. A Ana usa `ANALUZRANA`.

## Raspadinha `/raspadinha`

Uma por dia, chave de data em `America/Sao_Paulo` (`saoPauloDateKey`). Prêmio estável por hash. Canvas `destination-out` e botão “Revelar sem raspar”.

## Vídeo e CMS

Spots em `packages/data/src/videos.ts`. O player troca de quadro e mostra a transcrição. Não há arquivo de vídeo de outra marca. `/conteudo` lista posts, UGC e spots via `cmsCatalog`. `applyContentPatches` esconde ou renomeia sem alterar o original.

## Blog e institucionais

`/blog`, `/blog/[slug]`, `/social`, `/sobre`, `/privacidade`, `/entrega`, `/trocas`, `/rotulos`, `/ajuda`. Textos em `info-page.tsx` e `content.ts`. O índice e o texto vêm de `GET /v1/posts` e `GET /v1/posts/:slug`, não do arquivo do adaptador. O post publicado mostra o card do autor. Os blocos (parágrafo, subtítulo, imagem, citação, produto) são texto do React. O autor pode levar à collab. Post ausente, rascunho ou arquivado responde 404. Sem resposta da API, o blog continua no catálogo.

## Admin `/admin`

Login no servidor, só pela API. Não há `ADMIN_PASSWORD`. `POST /api/admin/session` chama `POST /v1/admin/login` e, se a API estiver fora, responde 503. O cookie httpOnly `pulso_admin_session` dura 12 horas, leva o token da API e é assinado com `ADMIN_SESSION_SECRET`. O JSON de login não devolve token. Cada abertura do painel confere `GET /v1/admin/me`; logout revoga o `jti` em `admin_sessions`. Papéis: dono (tudo), editor (catálogo, conteúdo, quiz, raspadinha e vitrine) e atendimento (pedidos, avaliações, clientes e a saída da lista de espera). A conta dono nasce com `pnpm --filter @pulso/db create-owner`. O painel cobre produtos, kits, categorias, influencers, blog, cupons, promoções, drops, quiz, avaliações, social, raspadinha, fidelidade, pedidos, clientes, vitrine e a lista de espera (dono e atendimento listam e removem; o editor recebe 403, porque o e-mail é dado pessoal). O CRUD não cai em `apps/web/.data/admin-mock.json`: erro da API aparece como erro. `/loja/[slug]` e a faixa da home leem `GET /v1/products/:slug` e `GET /v1/banners`. Produto e post se arquivam. Cupom só se apaga se o uso for zero. Variação com zero porções não grava, nem em rascunho. `/atletas` e `/blog` leem a API com `source` `postgres` ou `mock`. Sem a API, voltam ao catálogo e não ao arquivo. Influencer ativo que a API devolve abre em `/atletas/<slug>`. O card de drop da home usa o `unitsLeft` e a página de drops usa o `waitlistCount` de `GET /v1/drops`. O menu esconde o que o papel não faz, e a URL direta também. “Sessão inválida ou vencida” volta para o login. O login mostra o `error` da API e, no 429, o `Retry-After`. O editor de blocos avisa que não há promessa de saúde. O contrato está em [api.md](api.md).

## Privacidade na conta

“Baixar meus dados” usa `accountExport` e tira a senha do JSON. “Apagar conta neste aparelho” remove o usuário da store. A conta demo volta no próximo carregamento, porque o código a semeia de novo. Eventos de página só entram na fila depois do “Pode salvar” do banner (`enqueueEvent`).

## SEO e erro

`sitemap.ts`, `robots.ts`, `icon.tsx` (a letra P). `not-found` e `error` globais.
