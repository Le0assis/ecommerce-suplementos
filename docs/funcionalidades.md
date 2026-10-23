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

Sabor esgotado desabilita comprar. Assinatura aplica o percentual da ficha.

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

## Conta

`/entrar`, `/criar-conta`, `/conta`, `/conta/pedidos`, `/conta/pontos`, `/conta/enderecos`, `/conta/assinaturas`, `/favoritos`.

Login demo pré-preenchido. Senha comparada no browser. Wishlist de visitante funde no login.

Onde: `account-views.tsx`, `lib/demo.ts`, `lib/store.ts`.

## Rastreio `/rastreio`

Código do pedido. Demo: `PLDEMOANA`, objeto `PL123456789BR`.

## Drops `/drops`

O hero usa a cor do sabor, o nome da edição e o relógio em dias, horas, minutos e segundos. O relógio só lê a hora no cliente e não corre se a pessoa pedir menos movimento. O que resta sai do estoque do sabor (ou da soma dos sabores, quando a edição não tem um sabor só). A barra “de Y” só aparece quando o lote total existe e não é menor que o estoque. Sem lote, a página diz “Restam X” e não inventa o total. Esgotado é estoque zero. Em breve borra o teaser e pede e-mail com consentimento. No ar tem o botão de compra. Encerrado vai para o arquivo. A lista passa por `POST /api/drops/:id/waitlist`, que chama `POST /v1/drops/:id/waitlist` e, se a API responder 503 ou não estiver no ar, grava só e-mail, consentimento e origem em `apps/web/.data/drop-waitlist.json`. `POST /api/drops/waitlist/erase` tira o e-mail. O número “pessoas na lista” é a contagem desse arquivo, porque a rota pública não devolve a lista. Avaliações de edições anteriores só entram quando o drop está encerrado.

## Atletas `/atletas` e `/atletas/[slug]`

A lista segue o catálogo. A página da collab é um retrato de 280 px ao lado do nome, @, esporte e seguidores. A história substitui a bio quando existe. Até quatro frases giram devagar (param se a pessoa pedir menos movimento). O carrossel usa a foto ou a cor reserva, e cada foto abre o post do Instagram. O botão “Seguir no Instagram” fica fixo no celular. O cupom fica abaixo das fotos e os posts ligados ao influencer fecham a página. Sem arquivo do adaptador, a página usa `@pulso/data` e não inventa frase nem foto. Com o arquivo, lê a ficha salva no admin. Influencer inativo não abre. A vitrine ainda não lê a API.

## Indicação `/conta/indicar`

O código sai de `referralCodeFrom` (nome + fim do id). No cadastro, o campo opcional chama `matchReferral`. O bônus só cai quando o primeiro pedido dessa pessoa é pago (`pointsCredited`), via `applyReferralReward`. A Ana usa `ANALUZRANA`.

## Raspadinha `/raspadinha`

Uma por dia, chave de data em `America/Sao_Paulo` (`saoPauloDateKey`). Prêmio estável por hash. Canvas `destination-out` e botão “Revelar sem raspar”.

## Vídeo e CMS

Spots em `packages/data/src/videos.ts`. O player troca de quadro e mostra a transcrição. Não há arquivo de vídeo de outra marca. `/conteudo` lista posts, UGC e spots via `cmsCatalog`. `applyContentPatches` esconde ou renomeia sem alterar o original.

## Blog e institucionais

`/blog`, `/blog/[slug]`, `/social`, `/sobre`, `/privacidade`, `/entrega`, `/trocas`, `/rotulos`, `/ajuda`. Textos em `info-page.tsx` e `content.ts`. O post publicado mostra o card do autor. Se o adaptador tiver o post como `publicado`, os blocos (parágrafo, subtítulo, imagem, citação, produto) substituem a lista de parágrafos e o autor pode levar à collab. Post arquivado deixa de abrir. Sem o arquivo, o blog continua no catálogo.

## Admin `/admin`

Login no servidor. A senha é `ADMIN_PASSWORD` (sem prefixo `NEXT_PUBLIC_`). `POST /api/admin/session` compara essa senha, ou `POST /v1/admin/login` quando a API responder, e grava o cookie httpOnly `pulso_admin_session` por 12 horas, assinado com `ADMIN_SESSION_SECRET`. Papéis: dono (tudo), editor (catálogo, conteúdo, quiz, raspadinha e vitrine) e atendimento (pedidos, avaliações e clientes). O painel cobre produtos, kits, categorias, influencers, blog, cupons, promoções, drops, quiz, avaliações, social, raspadinha, fidelidade, pedidos, clientes e vitrine. Enquanto a API não tem essas rotas, um adaptador grava em `apps/web/.data/admin-mock.json`, fora do Git. Produto e post se arquivam. Cupom só se apaga se o uso for zero. A collab e o post publicado leem esse arquivo quando ele existe. O resto da vitrine segue `@pulso/data`. O editor de blocos avisa que não há promessa de saúde.

## Privacidade na conta

“Baixar meus dados” usa `accountExport` e tira a senha do JSON. “Apagar conta neste aparelho” remove o usuário da store. A conta demo volta no próximo carregamento, porque o código a semeia de novo. Eventos de página só entram na fila depois do “Pode salvar” do banner (`enqueueEvent`).

## SEO e erro

`sitemap.ts`, `robots.ts`, `icon.tsx` (a letra P). `not-found` e `error` globais.
