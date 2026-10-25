import type { Level } from "./types";

export const POINTS_PER_REAL = 5;
export const PIX_POINTS_BONUS = 1.2;
export const POINT_VALUE_CENTS = 1;
export const MAX_POINTS_REDEEM_RATIO = 0.2;
export const WELCOME_POINTS = 100;
export const FREE_SHIPPING_CENTS = 29900;
export const PIX_DISCOUNT_PERCENT = 10;
export const KIT_DISCOUNT_PERCENT = 12;
export const SUBSCRIPTION_DEFAULT_PERCENT = 10;

export const LEVELS: Level[] = [
  {
    id: "rookie",
    name: "Rookie",
    minPoints: 0,
    multiplier: 1,
    perks: ["5 pontos por real", "Raspadinha todo dia", "Pix com 10% off"],
  },
  {
    id: "atleta",
    name: "Atleta",
    minPoints: 500,
    multiplier: 1.1,
    perks: ["1,1x pontos", "Sabor novo 24h antes da galera"],
  },
  {
    id: "bruto",
    name: "Bruto",
    minPoints: 2000,
    multiplier: 1.25,
    perks: ["1,25x pontos", "Frete PAC grátis a partir de R$ 199"],
  },
  {
    id: "lenda",
    name: "Lenda",
    minPoints: 6000,
    multiplier: 1.5,
    perks: ["1,5x pontos", "Collab 12h antes", "Frete PAC grátis a partir de R$ 149"],
  },
];

export function levelFor(lifetimePoints: number): Level {
  let current: Level = LEVELS[0]!;
  for (const level of LEVELS) {
    if (lifetimePoints >= level.minPoints) current = level;
  }
  return current;
}

export function nextLevel(lifetimePoints: number): { level: Level; missing: number } | null {
  const upcoming = LEVELS.find((level) => level.minPoints > lifetimePoints);
  if (!upcoming) return null;
  return { level: upcoming, missing: upcoming.minPoints - lifetimePoints };
}

export function freeShippingThresholdCents(levelId: string, base = FREE_SHIPPING_CENTS): number {
  if (levelId === "lenda") return Math.min(base, 14900);
  if (levelId === "bruto") return Math.min(base, 19900);
  return base;
}

export function pointsToCents(points: number): number {
  return Math.max(0, Math.floor(points)) * POINT_VALUE_CENTS;
}

export function earnedPoints(input: {
  productCents: number;
  lifetimePoints: number;
  payment: "pix" | "boleto" | "card";
  pointsPerReal?: number;
  pixPointsBonus?: number;
}): number {
  if (input.productCents <= 0) return 0;
  const level = levelFor(input.lifetimePoints);
  const perReal = input.pointsPerReal ?? POINTS_PER_REAL;
  const bonus = input.payment === "pix" ? (input.pixPointsBonus ?? PIX_POINTS_BONUS) : 1;
  return Math.round((input.productCents / 100) * perReal * level.multiplier * bonus);
}
