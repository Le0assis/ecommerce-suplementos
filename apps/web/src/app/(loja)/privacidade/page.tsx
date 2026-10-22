import { InfoPage } from "@/components/content/info-page";

export const metadata = { title: "Privacidade" };

export default function PrivacyPage() {
  return (
    <InfoPage eyebrow="LGPD" title="Seus dados neste protótipo">
      <p>Não há servidor de contas. Nome, e-mail, CPF digitado no checkout, endereços, sacola, pontos e raspadinha ficam no localStorage deste navegador. Limpar os dados do site apaga a conta demo alterada e os pedidos novos.</p>
      <p>A senha da conta também fica no aparelho. Não use uma senha real. O admin em /admin usa uma senha pública de protótipo, visível no JavaScript. Isso não é um backoffice.</p>
      <p>Em produção, a base legal de um pedido é a execução do contrato. Marketing só com opt-in. O titular pede acesso, correção e exclusão pelo canal da loja, e o backend — não o browser — guarda o registro com prazo e criptografia.</p>
      <p>Não usamos pixel de anúncio neste protótipo. O banner de cookies só registra que você viu o aviso.</p>
    </InfoPage>
  );
}
