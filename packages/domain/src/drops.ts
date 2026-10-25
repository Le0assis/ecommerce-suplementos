export type DropPhase = "no-ar" | "encerrado" | "data-invalida";

export function dropPhase(endsAt: string, now: number): DropPhase {
  const end = new Date(endsAt).getTime();
  if (!Number.isFinite(end)) return "data-invalida";
  return now < end ? "no-ar" : "encerrado";
}
