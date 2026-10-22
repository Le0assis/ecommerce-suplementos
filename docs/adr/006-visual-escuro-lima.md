# ADR 006 — Visual escuro com lima

Status: aceito.

## Contexto

O público jovem das marcas de referência usa fundo escuro e uma cor só de destaque, título condensado e o sabor como herói. Copiar logotipo, foto de atleta ou embalagem de Ghost, Dark Lab, Integralmedica e das outras referências não é opção.

## Decisão

Marca PULSO. Fundo `#070708`, ação `#d6ff3c`, urgência `#ff3d8a`. Bebas Neue + Outfit. Pote em CSS e atleta em SVG (Luna, Caio, Nanda, Theo), com mulheres e homens no elenco. Rosa não é a cor do botão de comprar.

## Consequências

Foto remota não entra no LCP. Trocar o pote por foto exige direito de imagem e uma revisão de performance. Framer Motion pode entrar numa cena pontual; o padrão continua sendo CSS, com reduced-motion.
