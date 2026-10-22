# Design system

Tema escuro, uma cor de ação, uma cor de urgência. Público jovem, letra condensada em caixa alta nos títulos, frase curta.

## Tokens

Arquivo: `apps/web/src/app/globals.css`.

| Token | Valor | Uso |
| --- | --- | --- |
| `--background` / `bg` | `#070708` | Fundo |
| `--foreground` / `ink` | `#f6f6f4` | Texto |
| `--primary` / `lime` | `#d6ff3c` | Botão, link de ação, foco, seleção |
| `--primary-foreground` | `#101402` | Texto em cima da lima |
| `pink` | `#ff3d8a` | Drop, encerrado, alerta de edição |
| `--card` / `surface` | `#141418` | Card |
| `--secondary` / `surface-2` | `#1c1c22` | Faixa |
| `--muted-foreground` | `#b4b4be` | Texto secundário (contraste no preto) |
| `--destructive` | `#ff4d6d` | Erro |
| `--radius` | `0.9rem` | Cantos |

O shadcn lê essas variáveis. `bg-primary` é lima, não azul. Não pinte botão primário de rosa.

Fontes, carregadas no `layout.tsx`:

- **Bebas Neue** (`font-display`, `--font-bebas`): título. Já é caixa alta.
- **Outfit** (`font-sans`): texto, UI.

## Componentes

Primitivos em `apps/web/src/components/ui`. São os arquivos do registro shadcn new-york. Importe `@/components/ui/button` (e input, dialog, sheet, tabs, accordion, progress, checkbox, badge, label, separator).

Peças da marca:

- `Logo` — wordmark.
- `Pack` — pote em CSS. Passe `hex` do sabor. Não troque por foto de banco de imagem sem direitos.
- `Athlete` — pôster SVG `luna`, `caio`, `nanda`, `theo`.
- `ProductCard`, `BuyBox`, `Countdown`, `EmptyState`.

Estado vazio, carregando e erro:

- `loading.tsx` do grupo `(loja)`.
- `error.tsx` com botão de tentar de novo.
- `not-found.tsx`.
- Carrinho e busca sem resultado usam `EmptyState`.

## Movimento

Faixa da home: keyframes `marquee` no CSS. `prefers-reduced-motion: reduce` desliga o deslocamento.

Countdown não usa `setState` em efeito. `useSyncExternalStore` devolve `null` no servidor (`--d --h --m`) e o relógio no cliente. Isso evita hydration mismatch e o erro de prerender do Next 16 com `Date.now()`.

Framer Motion está instalado. Não adicionar animação de biblioteca num componente que já funciona em CSS. GSAP não está instalado.

## Tom de voz

Frase curta. Pode misturar “pix”, “drop”, “shape”. Não promete emagrecimento, cura ou desempenho esportivo garantido. Termogênico explica que não queima gordura sozinho. Rótulo e rodapé dizem que suplemento não é medicamento.

## Layout

- Conteúdo em `max-w-6xl`, padding lateral.
- Header fixo no desktop. Bottom nav no celular, escondida em `/checkout`.
- `pb-24` no `main` para a bottom nav não cobrir o fim da página.
- Foco: outline lima 2px.

Toasts não somem sozinhos: a pessoa dispensa no clique. Isso evita sumir com erro de formulário.
