export const REFERRER_POINTS = 150;
export const REFERRED_POINTS = 80;

export function referralCodeFrom(name: string, userId: string): string {
  const letters = name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toUpperCase()
    .replace(/[^A-Z]/g, "");
  const base = letters.slice(0, 6) || "PULSO";
  const tail = userId.replace(/[^a-zA-Z0-9]/g, "").slice(-4).toUpperCase().padStart(4, "X");
  return `${base}${tail}`;
}

export function matchReferral(
  code: string,
  directory: { code: string; userId: string }[],
  newUserId: string,
): { referrerId: string } | { error: string } {
  const normalized = code.trim().toUpperCase().replace(/\s+/g, "");
  if (!normalized) return { error: "Digita o código de quem te chamou." };
  const found = directory.find((item) => item.code === normalized);
  if (!found) return { error: "Código de indicação não existe." };
  if (found.userId === newUserId) return { error: "Você não indica a si." };
  return { referrerId: found.userId };
}

export interface ReferralAccount {
  id: string;
  pointsBalance: number;
  pointsLifetime: number;
  referredBy?: string | null;
  referralRewarded?: boolean;
}

/** Credita os dois lados uma vez, no primeiro pedido pago de quem foi indicado. */
export function applyReferralReward<T extends ReferralAccount>(accounts: T[], buyerId: string): T[] {
  const buyer = accounts.find((account) => account.id === buyerId);
  if (!buyer?.referredBy || buyer.referralRewarded) return accounts;
  if (!accounts.some((account) => account.id === buyer.referredBy)) return accounts;
  return accounts.map((account) => {
    if (account.id === buyer.referredBy) {
      return {
        ...account,
        pointsBalance: account.pointsBalance + REFERRER_POINTS,
        pointsLifetime: account.pointsLifetime + REFERRER_POINTS,
      };
    }
    if (account.id === buyer.id) {
      return {
        ...account,
        referralRewarded: true,
        pointsBalance: account.pointsBalance + REFERRED_POINTS,
        pointsLifetime: account.pointsLifetime + REFERRED_POINTS,
      };
    }
    return account;
  });
}
