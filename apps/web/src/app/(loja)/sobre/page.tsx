import { InfoPage } from "@/components/content/info-page";

export const metadata = { title: "Sobre" };

export default function AboutPage() {
  return (
    <InfoPage eyebrow="A casa" title="PULSO é do Gustavo">
      <p>A PULSO é uma marca fictícia de suplementos para quem treina e cresceu vendo collab, drop e pix. O visual mistura streetwear escuro com um neon só — lima — e rosa quando o lote é curto.</p>
      <p>Este site é um protótipo de loja completo no navegador. Catálogo, checkout, pontos e raspadinha funcionam com dados locais. Pagamento, Correios e ANVISA de verdade ficam para a fase com backend.</p>
      <p>A voz é jovem e direta, em português do Brasil, com um inglês de treino quando cabe: pump, cutting, drop. A letra miúda do rótulo continua séria.</p>
    </InfoPage>
  );
}
