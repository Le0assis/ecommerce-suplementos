# Como adicionar um meio de pagamento

O checkout conhece `pix`, `boleto` e `card` (`PaymentMethod` em `packages/domain/src/types.ts`).

## Neste protótipo

1. Inclua o id na união `PaymentMethod` e nos `check` do SQL (`orders.payment_method`, `payments.method`) num arquivo `002_….sql`.
2. Ensine `quoteCart` e `earnedPoints`. Pix é o único que tira percentual e o único que ganha bônus de pontos. Um método novo precisa dizer, no teste, se mexe no total e se mexe nos pontos.
3. `validateCheckout` ganha os campos desse método. Cartão usa Luhn e validade. Pix e boleto não pedem número de cartão.
4. A UI em `checkout-view.tsx` ganha a opção e a confirmação explica que é simulação. `buildSimulatedPayment` em `store.ts` monta o código falso. Marque `simulated` na tela. Não gere um BR Code que pareça pagável sem o aviso.
5. `POST /v1/checkout/simulate` já recalcula pelo domínio. Não duplique a porcentagem na rota.
6. Parcelas são de cartão (`installmentSchedule`). Outro método parcelado precisa de teste da parcela mínima de R$ 5.

## Quando for cobrança real

Não ligue a chave secreta no `NEXT_PUBLIC_`. O browser pede a preferência; o servidor cria a cobrança no Mercado Pago ou no Pagar.me e devolve o dado de pagamento. Webhook confirma, com idempotência, e só então o pedido sai de `pagamento_pendente` e o ledger ganha os pontos.

Até esse webhook existir, a frase de simulação fica na confirmação. O [ADR 005](../adr/005-pagamentos-simulados.md) registra essa escolha.
