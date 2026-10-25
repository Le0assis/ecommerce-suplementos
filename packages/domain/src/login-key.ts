/** E-mail do balde de login: sem espaço nas pontas, em minúsculas. */
export function normalizeLoginEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Segundo balde do login, 30 falhas em 15 minutos.
 * A API e o site usam esta chave: e-mail normalizado, `|`, IP do socket.
 */
export function loginEmailIpKey(email: string, ip: string): string {
  return `${normalizeLoginEmail(email)}|${ip}`;
}
