export interface ScratchPrize {
  id: string;
  label: string;
  detail: string;
  weight: number;
  couponCode?: string;
  points?: number;
}

export const SCRATCH_PRIZES: ScratchPrize[] = [
  { id: "off5", label: "5% OFF", detail: "Cupom RASPA5 no próximo checkout.", weight: 30, couponCode: "RASPA5" },
  { id: "off10", label: "10% OFF", detail: "Cupom RASPA10. Não acumula com cupom de atleta.", weight: 15, couponCode: "RASPA10" },
  { id: "frete", label: "FRETE GRÁTIS", detail: "RASPAFRETE zera o frete desta compra.", weight: 15, couponCode: "RASPAFRETE" },
  { id: "pts", label: "+200 PONTOS", detail: "Cai na conta se você estiver logado.", weight: 20, points: 200 },
  { id: "nada", label: "QUASE", detail: "Hoje não veio. Amanhã a raspadinha reseta.", weight: 20 },
];

export function scratchPrize(seed: string): ScratchPrize {
  let hash = 2166136261;
  for (const char of seed) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  const bucket = Math.abs(hash) % 100;
  let cursor = 0;
  for (const prize of SCRATCH_PRIZES) {
    cursor += prize.weight;
    if (bucket < cursor) return prize;
  }
  return SCRATCH_PRIZES[SCRATCH_PRIZES.length - 1]!;
}

export function saoPauloDateKey(date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function fakePixPayload(orderCode: string, cents: number): string {
  const amount = (cents / 100).toFixed(2);
  return `00020126580014BR.GOV.BCB.PIX0136demo-pulso-${orderCode}52040000530398654${amount}5802BR5922PULSO DEMO GUSTAVO6009SAO PAULO62070503***6304DEMO`;
}

export function fakeBoletoLine(orderCode: string): string {
  const digits = orderCode.replace(/\W/g, "").padEnd(12, "0").slice(0, 12);
  return `23793.38128 60000.000003 00000.${digits.slice(0, 6)} 1 00000000000000`;
}

export function orderCode(now = Date.now()): string {
  return `PL${now.toString(36).toUpperCase()}`;
}
