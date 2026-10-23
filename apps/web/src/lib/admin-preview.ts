/** Cor de reserva quando a URL da foto vem nula ou não é uma imagem segura. */
export function safePreview(url: string | null | undefined, hex: string): string {
  if (url && (url.startsWith("https://") || url.startsWith("data:image/"))) {
    return `${hex} url("${url.replaceAll('"', "")}") center / cover no-repeat`;
  }
  return hex;
}
