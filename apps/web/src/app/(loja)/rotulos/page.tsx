import { InfoPage } from "@/components/content/info-page";

export const metadata = { title: "Rótulos" };

export default function LabelsPage() {
  return (
    <InfoPage eyebrow="ANVISA" title="Como o rótulo aparece">
      <p>Cada produto tem categoria de suplemento alimentar, porção, tabela, ingredientes, alergênicos e advertências. A frase “não é um medicamento” fica no rótulo e na página.</p>
      <p>Os números NI-DEMO e a empresa fabricante são fictícios. Não existe registro, notificação nem responsável técnico real por trás deles. O formato existe para o time desenhar a ficha antes da notificação de verdade.</p>
      <p>Cafeína aparece em miligramas. Quem compete confere a lista da própria modalidade. Gestantes, lactantes e menores ficam fora da recomendação de uso sem profissional de saúde. A venda no checkout pede 18 anos.</p>
    </InfoPage>
  );
}
