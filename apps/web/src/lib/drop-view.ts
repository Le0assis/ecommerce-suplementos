export type DropViewState = "em_breve" | "no_ar" | "encerrado" | "esgotado";

export interface Scarcity {
  text: string;
  percent: number | null;
  soldOut: boolean;
}

export function dropViewState(
  drop: { status: "em_breve" | "no_ar" | "encerrado"; startsAt: string | null; endsAt: string | null; unitsLeft: number | null },
  now: number,
): DropViewState {
  if (drop.status === "encerrado") return "encerrado";
  if (drop.endsAt) {
    const end = new Date(drop.endsAt).getTime();
    if (Number.isFinite(end) && now >= end) return "encerrado";
  }
  if (drop.unitsLeft === 0) return "esgotado";
  if (drop.status === "em_breve") return "em_breve";
  if (drop.startsAt) {
    const start = new Date(drop.startsAt).getTime();
    if (Number.isFinite(start) && now < start) return "em_breve";
  }
  return "no_ar";
}

export function scarcityOf(unitsLeft: number | null, unitsTotal: number | null): Scarcity | null {
  if (unitsLeft === null) return null;
  const soldOut = unitsLeft <= 0;
  const knownTotal = unitsTotal !== null && unitsTotal > 0 && unitsTotal >= unitsLeft;
  if (soldOut) return { text: "Esgotado", percent: knownTotal ? 0 : null, soldOut: true };
  if (knownTotal && unitsTotal) {
    return { text: `Restam ${unitsLeft} de ${unitsTotal}`, percent: Math.round((unitsLeft / unitsTotal) * 100), soldOut: false };
  }
  return { text: `Restam ${unitsLeft}`, percent: null, soldOut: false };
}

export function stockOf(flavors: { id: string; stock: number }[], flavorId: string | null): number | null {
  if (flavorId) {
    const flavor = flavors.find((item) => item.id === flavorId);
    return flavor ? flavor.stock : null;
  }
  if (!flavors.length) return null;
  return flavors.reduce((sum, flavor) => sum + flavor.stock, 0);
}
