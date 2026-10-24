import { InfoPage } from "@/components/content/info-page";

export const metadata = { title: "Privacidade" };

export default function PrivacyPage() {
  return (
    <InfoPage eyebrow="LGPD" title="Seus dados neste protótipo">
      <p>Sacola, favoritos, raspadinha e newsletter deste navegador ficam no localStorage. Conta, senha, CPF e pedido não entram nessa chave. A conta demo ana@pulso.dev ainda vem do código da página, só na memória, com senha de exemplo. Não use uma senha real nela.</p>
      <p>O cadastro de verdade fica na API: a senha vira hash no servidor e o CPF não sai em texto puro. A sessão da loja é um cookie httpOnly. O /admin é outro login, também com cookie httpOnly. Ainda é um protótipo, não um backoffice de produção, e Pix, boleto e cartão não cobram.</p>
      <p>Em produção, a base legal de um pedido é a execução do contrato. Marketing só com opt-in. O titular pede acesso, correção e exclusão pelo canal da loja, e o backend — não o browser — guarda o registro com prazo e criptografia.</p>
      <p>Não usamos pixel de anúncio neste protótipo. O banner de cookies só registra que você viu o aviso.</p>
    </InfoPage>
  );
}
