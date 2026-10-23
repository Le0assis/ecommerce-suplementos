import type { AdminPostBlock } from "@/lib/admin-types";

export function readyBlocks(blocks: AdminPostBlock[]): AdminPostBlock[] {
  return blocks.filter((block) => {
    if (block.type === "paragrafo" || block.type === "titulo") return block.text.trim().length > 0;
    if (block.type === "citacao_lateral") return block.text.trim().length > 0;
    if (block.type === "imagem") return block.alt.trim().length > 0 && block.url.trim().length > 0;
    return block.productId.trim().length > 0;
  });
}

export function blockProblem(blocks: AdminPostBlock[]): string | null {
  for (const block of blocks) {
    if (block.type === "citacao_lateral" && !block.text.trim()) return "A citação não pode ficar vazia. Remova o bloco ou escreva a frase.";
    if (block.type === "imagem" && !block.alt.trim()) return "A imagem precisa de texto alternativo.";
    if (block.type === "imagem" && !block.url.trim()) return "A imagem precisa de um arquivo ou de uma URL.";
    if (block.type === "produto" && !block.productId.trim()) return "Escolha o produto do card ou remova o bloco.";
  }
  return null;
}
