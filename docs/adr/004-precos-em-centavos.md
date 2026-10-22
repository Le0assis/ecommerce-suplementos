# ADR 004 — Preços em centavos inteiros

Status: aceito.

## Contexto

Real com ponto flutuante erra parcela e Pix (10% de R$ 149,90).

## Decisão

Todo dinheiro no domínio, no SQL e no JSON é `integer` de centavos. A formatação `formatBRL` só na UI. Porcentagem é inteira (`10` = 10%). Desconto de kit e cupom: vale o maior, teto 30%. Pix incide depois dos descontos de produto e nunca no frete.

## Consequências

Variável `NEXT_PUBLIC_FREE_SHIPPING_CENTS=29900` é R$ 299,00. Quem colocar `299` acha que o frete grátis é três reais. O README explica.
