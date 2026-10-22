export interface Installment {
  n: number;
  amountCents: number;
  totalCents: number;
  interestFree: boolean;
}

const MONTHLY_RATE = 0.0199;

export function installmentSchedule(totalCents: number, max = 12): Installment[] {
  const safeTotal = Math.max(0, Math.round(totalCents));
  let ceiling = max;
  while (ceiling > 1 && Math.floor(safeTotal / ceiling) < 500) ceiling -= 1;
  const items: Installment[] = [];
  for (let n = 1; n <= ceiling; n += 1) {
    if (n <= 3) {
      items.push({
        n,
        amountCents: Math.round(safeTotal / n),
        totalCents: safeTotal,
        interestFree: true,
      });
      continue;
    }
    const factor = (MONTHLY_RATE * (1 + MONTHLY_RATE) ** n) / ((1 + MONTHLY_RATE) ** n - 1);
    const amountCents = Math.round(safeTotal * factor);
    items.push({
      n,
      amountCents,
      totalCents: amountCents * n,
      interestFree: false,
    });
  }
  return items;
}
