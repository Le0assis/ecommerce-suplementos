# Propostas

Anotado na revisão do `apps/web`. O que a vitrine já faz está no código. O resto depende do Backend ou de um corte maior.

## Pontos

`serverPointAccount` em `apps/api/src/checkout-quote.ts` ainda devolve `null`. `pointsToRedeem` maior que zero responde 422 `{ "code": "pontos_indisponiveis" }`.

A vitrine esconde o slider no checkout e o texto de resgate na conta quando o saldo é 0 ou não existe, e o payload não leva `pointsToRedeem`. O slider local continua só para a conta do navegador com saldo positivo. Volta a ir no corpo quando o Backend ler `customers.points_balance` dessa sessão.

## Lista de espera

A API já restringe `GET /v1/admin/drops/:id/waitlist` a quem tem `waitlist`, devolve o e-mail inteiro só ao dono e mascara o resto. O site repete o 403 do editor e a máscara, para o proxy não entregar o endereço cru se a resposta vier aberta. Anonimizar continua em `drops`: o editor ainda pode anonimizar, sem ver a lista.

## IP e checkout

Fora da Vercel o processo do Next apaga `x-real-ip` e `x-vercel-forwarded-for` do cliente e grava o IP do socket antes da rota. Girar esses cabeçalhos não abre outro limite, e repetir o IP do dono não queima o limite dele. Com `VERCEL=1` o site lê `x-vercel-forwarded-for` e, se faltar, `x-real-ip`, e manda só esse IP. A API, com o socket na lista de proxy, ainda lê `x-forwarded-for` (salto da direita) mesmo sem `VERCEL=1`. Com `VERCEL=1` ela prefere `x-vercel-forwarded-for` e não lê `x-real-ip`.

`CHECKOUT_QUOTE_SHA` continua vazio. O checkout visível segue o `quoteCart` local. Não ligar até o Backend publicar o SHA do contrato.

Upload sem `BLOB_READ_WRITE_TOKEN` responde 503. A tela não guarda a foto em data-URL.

## Vitrine

- A conta da loja ainda mora no `localStorage`.
- Capa com `next/image` está `unoptimized`. `remotePatterns` pediria `next.config.ts`.
- A inscrição pública da lista responde 200 para e-mail novo e repetido, e a página não distingue.
- Slug de categoria, objetivo, influencer e post não muda depois de criar.
- Apagar banner, kit ou produto arquiva.
