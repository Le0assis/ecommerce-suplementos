import { InfoPage } from "@/components/content/info-page";

export const metadata = { title: "Trocas" };

export default function ReturnsPage() {
  return (
    <InfoPage eyebrow="Depois da compra" title="Troca neste protótipo">
      <p>Pedido com pagamento pendente pode ser cancelado na conta, e os pontos usados voltam. Pedido pago na simulação segue o fluxo de separação, envio e entrega pelo botão de demonstração.</p>
      <p>Na loja real, suplemento lacrado segue o direito de arrependimento em compra online e a política de avaria no transporte. Pote aberto por uso não volta para a prateleira. Este texto não substitui o termo jurídico da operação.</p>
    </InfoPage>
  );
}
