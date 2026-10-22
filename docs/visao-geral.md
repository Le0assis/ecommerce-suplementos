# Visão geral

A PULSO é a loja de suplementos do Gustavo para quem treina e vive no celular. O tom mistura português informal e palavra de academia em inglês (drop, shape, cutting, stack). A promessa visual é fundo preto, lima elétrica `#d6ff3c` e rosa `#ff3d8a` só quando o assunto é drop ou urgência.

A marca é fictícia. Atletas (Luna Vaz, Caio Bruto, Nanda Pace, Theo Ink) são ilustração SVG, não foto de pessoa famosa. Potes são desenho em CSS. Isso deixa a página rápida e evita copiar embalagem de outra marca.

## O que uma pessoa consegue fazer hoje

Percorrer a loja inteira no navegador: home, catálogo, produto, quiz, calculadora, kit, raspadinha, drops, atletas, blog, social, carrinho, checkout simulado, conta, favoritos, rastreio e um admin local.

A conta `ana@pulso.dev` / `pulso123` já chega com pedido `PLDEMOANA`, pontos e nível Bruto, para o time ver o estado cheio sem completar uma compra.

## O que ainda é fachada

- Pagamento não cobra. Pix e boleto mostram código falso com a palavra demonstração.
- CEP não consulta os Correios nem a ViaCEP. Há uma tabela de CEPs públicos conhecidos e uma regra por região.
- Pedido, ponto, favorito e patch de admin ficam no `localStorage` do navegador (chave `pulso-store`).
- A senha de `/admin` viaja no JavaScript. Serve para a demo, não para um painel real.
- `DATA_SOURCE=api` ainda não alimenta as páginas. A API, separada, já lista o catálogo.

O detalhe do que falta está em [roadmap-e-status.md](roadmap-e-status.md).
