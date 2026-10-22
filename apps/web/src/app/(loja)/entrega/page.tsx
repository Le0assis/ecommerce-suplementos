import { InfoPage } from "@/components/content/info-page";

export const metadata = { title: "Entrega" };

export default function ShippingPage() {
  return (
    <InfoPage eyebrow="CEP" title="Frete de demonstração">
      <p>O checkout calcula PAC e SEDEX por região do CEP. Alguns CEPs conhecidos, como 01310-100, preenchem um endereço público de exemplo. Os outros seguem uma regra ilustrativa. Nada disso consulta os Correios nem o ViaCEP.</p>
      <p>PAC grátis a partir de R$ 299 para Rookie e Atleta. Bruto baixa o piso para R$ 199 e Lenda para R$ 149. SEDEX continua pago, salvo cupom de frete da raspadinha.</p>
      <p>O prazo em dias úteis é estimativa de protótipo, não um compromisso de entrega.</p>
    </InfoPage>
  );
}
