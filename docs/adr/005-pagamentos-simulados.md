# ADR 005 — Pagamentos simulados

Status: aceito.

## Contexto

Pix, boleto e cartão parcelado são requisito de produto. Mercado Pago e Pagar.me pedem conta, segredo e webhook. Sem isso, um BR Code “de verdade” engana quem testa.

## Decisão

O checkout calcula de verdade e cobra de mentira. Cartão de teste `4242424242424242` passa no Luhn e é aprovado na simulação. Pix e boleto mostram payload gerado por `fakePixPayload` e `fakeBoletoLine`, com a palavra demonstração. A API `POST /v1/checkout/simulate` devolve `simulated: true`. Pontos de Pix/boleto só creditam quando o status sai de pendente, para imitar a espera do webhook.

## Consequências

Não remover o aviso da confirmação até existir gateway. Segredo de gateway não usa prefixo `NEXT_PUBLIC_`. O cookie do admin é httpOnly e não serve de modelo para o token do pagamento.
