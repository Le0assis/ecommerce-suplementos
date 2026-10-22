# Como adicionar um kit

Há dois mecanismos. Não misture a conta na UI.

## Kit do catálogo

Um produto com `category: "kit"`, `isKit: true` e `kitItems: [{ productSlug, quantity }]`. O preço é o do próprio kit (`sizes`), não a soma ao vivo. Se quiser “de/por”, use `compareAtCents` com a soma cheia dos itens.

Exemplo existente: `kit-bruto`.

Mostre os itens na PDP. A página de produto já lista `kitItems` quando o campo existe. Confira se cada `productSlug` existe.

## Desconto de montar kit

`/kits` adiciona três linhas. O domínio dá 12% (`KIT_DISCOUNT_PERCENT`) quando o carrinho tem **três categorias diferentes**. Um cupom percentual maior substitui esses 12%. Eles não se somam. Teto 30%.

Se o novo kit pronto já é um produto só, ele conta como uma categoria (`kit`). Não ganha os 12% de novo em cima do preço que já é de combo.

Teste em `packages/domain/src/domain.test.ts` se mudar a regra. Um caso com cupom de 15% e outro com três categorias sem cupom.
