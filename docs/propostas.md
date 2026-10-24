# Propostas

Anotado na revisão do `apps/web`. O que a vitrine já faz está no código. O resto depende do Backend ou de um corte maior.

## Pontos

`serverPointAccount` em `apps/api/src/checkout-quote.ts` ainda devolve `null`. `pointsToRedeem` maior que zero responde 422 `{ "error": "O saldo de pontos ainda não está no servidor.", "code": "pontos_indisponiveis" }` no quote e no simulate. O site devolve o mesmo 422 em `/api/checkout/quote` e `/api/checkout/simulate`, e o checkout mostra essa frase.

A vitrine não mostra resgate no checkout, nem para a Ana com 860 pontos no navegador, e o total local não aplica desconto de pontos. O payload não leva `pointsToRedeem`. A conta ainda mostra o saldo local quando ele é positivo. O campo volta quando o Backend ler `customers.points_balance` dessa sessão.

## Lista de espera

A API já restringe `GET /v1/admin/drops/:id/waitlist` a quem tem `waitlist`, devolve o e-mail inteiro só ao dono e mascara o resto. O site repete o 403 do editor e a máscara, para o proxy não entregar o endereço cru se a resposta vier aberta. Anonimizar continua em `drops`: o editor ainda pode anonimizar, sem ver a lista.

## IP e checkout

Fora da Vercel o processo do Next apaga `x-vercel-forwarded-for` do cliente e grava o IP do socket antes da rota. `x-real-ip` também sai, a menos que `TRUSTED_PROXY=1` e o proxy sobrescreva esse cabeçalho. Girar os cabeçalhos não abre outro limite, e repetir o IP do dono não queima o limite dele. O site só lê `x-vercel-forwarded-for` e, se faltar, `x-real-ip`, quando `VERCEL=1` e existe `VERCEL_ENV` ou `VERCEL_URL`. `VERCEL=1` sozinho continua no IP do socket. O login do site usa `loginEmailIpKey` de `@pulso/domain` (`e-mail` com `trim` e minúsculas, `|`, IP) e mantém o balde só do IP, os dois com 30 falhas em 15 minutos. A 31ª responde 429 com `Retry-After: 900` e a tela mostra os 15 minutos. A senha certa zera a parte daquela conta. Sem o carimbo do socket e sem `TRUSTED_PROXY=1`, o IP fica `local` e esse balde de 30 é de todo mundo. A API, com o socket na lista de proxy, ainda lê `x-forwarded-for` (salto da direita) mesmo sem `VERCEL=1`. Com `VERCEL=1` ela prefere `x-vercel-forwarded-for` e não lê `x-real-ip`.

`CHECKOUT_QUOTE_SHA` continua vazio. O checkout visível segue o `quoteCart` local. Não ligar até o Backend publicar o SHA do contrato.

Upload sem `BLOB_READ_WRITE_TOKEN` responde 503. A tela não guarda a foto em data-URL.

## Vitrine

- A conta da loja ainda mora no `localStorage`.
- Capa com `next/image` está `unoptimized`. `remotePatterns` pediria `next.config.ts`.
- A inscrição pública da lista responde 200 para e-mail novo e repetido, e a página não distingue.
- Slug de categoria, objetivo, influencer e post não muda depois de criar.
- Apagar banner, kit ou produto arquiva.
