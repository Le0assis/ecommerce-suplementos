/** Id de variação ou foto. A chave é global no banco, então `var-1` e `foto-1` colidem entre produtos. */
export function uniqueRecordId(): string {
  return crypto.randomUUID();
}

/** SKU global. O sufixo vem do id para dois produtos com o mesmo slug não repetirem a variação. */
export function variantSku(slug: string, id: string): string {
  const suffix = id.replace(/[^a-zA-Z0-9]/g, "").slice(0, 12).toUpperCase() || "NOVO";
  const stem = (slug || "NOVO").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 24) || "NOVO";
  return `PL-${stem}-${suffix}`.slice(0, 48);
}
