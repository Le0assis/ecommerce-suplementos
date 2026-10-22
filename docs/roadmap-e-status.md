# Roadmap e status

Atualizado para o corte que está neste repositório.

## Pronto

- Vitrine mobile-first com as rotas de catálogo, PDP, quiz, calculadora, kit, carrinho, checkout simulado, conta, favoritos, rastreio, drops, atletas, raspadinha, blog, social, institucionais, admin local, 404, erro e loading.
- Regras de Pix, frete, kit, cupom, pontos, parcela, CPF, Luhn e CEP com Vitest (14 + 2 + 1 + 3).
- API Hono de leitura e simulação, health, limite de POST.
- SQL idempotente, migrate, seed, Docker Compose de Postgres 16 e Redis 7.
- CI de lint, typecheck, test e build.
- Documentação pt-BR e README de instalação.

## Parcial de propósito

| Peça | Estado |
| --- | --- |
| `DATA_SOURCE=api` | Função `loadStorefront` pronta. Páginas ainda importam `@pulso/data` |
| Pedido, cliente, pontos, wishlist, assinatura | Funcionam no `localStorage`. Tabelas SQL existem vazias |
| Admin | Patch local de nome, preço e ocultar. Não é CMS |
| CEP e frete | Tabela demo. Contrato de função estável para trocar pela ViaCEP |
| Pagamento | UI completa, cobrança falsa, marcada na confirmação |
| Raspadinha | Uma por dia no navegador. Prêmio não persiste no servidor |
| Framer Motion | Dependência instalada, movimento feito em CSS |
| Playwright | Script `pnpm test:e2e` explica que não está instalado. Fora do CI |

## Próximo corte sugerido

1. Ligar as páginas de catálogo em `loadStorefront` e cobrir com um teste de integração da API em modo mock.
2. `POST` de pedido gravando `orders` e `order_lines`, com a vitrine lendo de lá quando houver sessão.
3. Playwright: home, PDP, cupom e checkout Pix feliz, mais CEP inválido.
4. Só então escolher Medusa ou seguir na API própria. A comparação está em [stack.md](stack.md).

## Não vender com este build

Registro ANVISA fictício, sem nota fiscal, sem gateway, senha de admin no bundle, conta sem hash de senha. O rodapé já diz que é protótipo.
