# Como adicionar um sabor

O sabor não é um produto. Ele é uma entrada em `flavorSeeds` e vira uma variante por tamanho.

1. No produto, em `packages/data/src/catalog.ts`, acrescente um item:

```ts
{ id: "melancia", name: "Melancia", tagline: "Doce, gelado, sem dó", hex: "#ff4d6a", family: "fruta", stock: 40, limited: true }
```

2. `id` é estável e entra no SKU (`PL-SLUG-MELANCIA-POTE`). Não reaproveite um id antigo com outro nome.
3. `hex` pinta o pote (`Pack`) e a bolinha do card. Texto em cima dessa cor usa `inkForHex` quando precisar.
4. `family` é `citrica`, `doce`, `fruta`, `neutro` ou `chocolate`. O filtro da loja usa isso.
5. `stock: 0` esgota o sabor na buy box.
6. Edição limitada: `limited: true` e, se for drop, preencha `drop.endsAt` e `unitsLeft`.
7. A query `?sabor=melancia` na PDP seleciona esse id. O nome do parâmetro na buy box é o id, não o nome visível.

Não precisa de migração se a API estiver em mock. No modo postgres, `pnpm db:seed`.
