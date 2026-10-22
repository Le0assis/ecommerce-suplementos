import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

export const metadata = { title: "Ajuda" };

const faqs = [
  ["O pix desconta mesmo?", "No protótipo, sim: 10% sobre os produtos, depois do cupom e dos pontos. O frete fica de fora."],
  ["Posso assinar?", "Na página do produto, marca assinar. A recorrência aparece na conta e pode ser pausada. Não há cobrança real."],
  ["Onde ficam meus pedidos?", "Neste navegador. A conta demo ana@pulso.dev / pulso123 já chega com um kit a caminho."],
  ["A raspadinha é todo dia?", "Uma por navegador, no fuso de Brasília. Cupom de porcentagem não soma com cupom de atleta: fica o maior."],
  ["Isso é a loja final?", "É o front completo com regras de negócio testadas. Pagamento, estoque e CMS de produção entram na API e no Postgres."],
];

export default function HelpPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="font-display text-7xl leading-[0.85]">Ajuda</h1>
      <Accordion type="single" collapsible className="mt-6">
        {faqs.map(([question, answer]) => (
          <AccordionItem key={question} value={question}>
            <AccordionTrigger>{question}</AccordionTrigger>
            <AccordionContent>{answer}</AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
}
