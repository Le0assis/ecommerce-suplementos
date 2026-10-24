/** Texto do 429. O cabeçalho continua `Retry-After` em segundos. */

export function loginWaitLabel(retryAfter: string | null | undefined): string | null {
  const seconds = Number(retryAfter);
  if (!Number.isInteger(seconds) || seconds <= 0) return null;
  if (seconds % 60 === 0) {
    const minutes = seconds / 60;
    return minutes === 1 ? "1 minuto" : `${minutes} minutos`;
  }
  return seconds === 1 ? "1 segundo" : `${seconds} segundos`;
}

export function loginLimitMessage(error: string | null | undefined, retryAfter: string | null | undefined): string {
  const base = error?.trim() || "Muitas tentativas de login. Espera alguns minutos.";
  const wait = loginWaitLabel(retryAfter);
  if (!wait || base.includes(wait)) return base;
  if (base.includes("alguns minutos")) return base.replace("alguns minutos", wait);
  return base;
}
