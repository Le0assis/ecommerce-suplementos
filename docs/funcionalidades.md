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

Countdown e lista. A fase sai de `dropPhase` (`no-ar`, `encerrado`, `data-invalida`) em `packages/domain/src/drops.ts`. O relógio só lê a hora no cliente. Newsletter desta página fica no estado local (não dispara e-mail). O Drop 05 é teaser (`upcomingDrop.teaser`).

## Atletas `/atletas` e `/atletas/[slug]`

Página de atleta é Server Component com `generateStaticParams`. Cupom da pessoa pode ser aplicado dali.

## Indicação `/conta/indicar`

O código sai de `referralCodeFrom` (nome + fim do id). No cadastro, o campo opcional chama `matchReferral`. O bônus só cai quando o primeiro pedido dessa pessoa é pago (`pointsCredited`), via `applyReferralReward`. A Ana usa `ANALUZRANA`.

## Raspadinha `/raspadinha`

Uma por dia, chave de data em `America/Sao_Paulo` (`saoPauloDateKey`). Prêmio estável por hash. Canvas `destination-out` e botão “Revelar sem raspar”.

## Vídeo e CMS

Spots em `packages/data/src/videos.ts`. O player troca de quadro e mostra a transcrição. Não há arquivo de vídeo de outra marca. `/conteudo` lista posts, UGC e spots via `cmsCatalog`. `applyContentPatches` esconde ou renomeia sem alterar o original.

## Blog e institucionais

`/blog`, `/blog/[slug]`, `/social`, `/sobre`, `/privacidade`, `/entrega`, `/trocas`, `/rotulos`, `/ajuda`. Textos em `info-page.tsx` e `content.ts`.

## Admin `/admin`

Login no servidor. A senha é `ADMIN_PASSWORD` (sem prefixo `NEXT_PUBLIC_`). `POST /api/admin/session` compara essa senha, ou `POST /v1/admin/login` quando a API responder, e grava o cookie httpOnly `pulso_admin_session` por 12 horas, assinado com `ADMIN_SESSION_SECRET`. Papéis: dono, editor e atendimento. Nesta fase o painel edita produtos (incluindo sabores, variantes, rótulo e fotos) e cupons. Enquanto a API não tem essas rotas, um adaptador grava em `apps/web/.data/admin-mock.json`, fora do Git. Produto se arquiva. Cupom só se apaga se o uso for zero.

## Privacidade na conta

“Baixar meus dados” usa `accountExport` e tira a senha do JSON. “Apagar conta neste aparelho” remove o usuário da store. A conta demo volta no próximo carregamento, porque o código a semeia de novo. Eventos de página só entram na fila depois do “Pode salvar” do banner (`enqueueEvent`).

## SEO e erro

`sitemap.ts`, `robots.ts`, `icon.tsx` (a letra P). `not-found` e `error` globais.
