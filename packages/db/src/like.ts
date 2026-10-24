/** Conteúdo de ILIKE em que `%` e `_` são texto. O SQL usa `escape '\'`. */
export function ilikeContains(value: string): string {
  return `%${value.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}

export function ilikeMatch(expression: string, placeholder: string): string {
  return `${expression} ilike ${placeholder} escape '\\'`;
}
