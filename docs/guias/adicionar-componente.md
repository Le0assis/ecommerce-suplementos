# Como adicionar um componente

1. Se for botão, campo, diálogo, aba, acordeão, checkbox ou barra de progresso, use o que está em `apps/web/src/components/ui`. Não desenhe outro.
2. Peça de produto ou página vai em `apps/web/src/components/<área>/`. Nome de arquivo em kebab-case.
3. `"use client"` só se houver estado ou evento. Um card estático fica no servidor.
4. Estilo com classes Tailwind e os tokens (`bg-primary`, `text-muted-foreground`, `text-pink`, `font-display`). Evite cor hexadecimal nova. Se a cor for da marca, ela entra no `globals.css` primeiro.
5. `cn()` de `@/lib/utils` junta classes.
6. Não chame `quoteCart` com uma fórmula paralela. Passe as linhas e exiba o retorno.
7. Não leia `localStorage` no render. Use a store e o flag `hydrated`.
8. Texto de imagem: o pote e o atleta já têm alternativa. Componente novo com figura precisa de texto que faça sentido sem a figura.

Dependência de npm: na raiz,

```bash
pnpm --filter @pulso/web add nome
```

O `pnpm add` dentro de `apps/web` falha com `ERR_PNPM_WORKSPACE_PKG_NOT_FOUND`.
