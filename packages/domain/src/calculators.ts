import type { GoalId } from "./types";

const PROTEIN_PER_KG: Record<GoalId, number> = {
  hipertrofia: 2,
  emagrecimento: 2,
  energia: 1.6,
  recuperacao: 1.8,
  resistencia: 1.4,
  saude: 1.2,
};

export interface ProteinPlan {
  perKg: number;
  targetGrams: number;
  fromFoodGrams: number;
  gapGrams: number;
  scoops: number;
  scoopProteinGrams: number;
  disclaimer: string;
}

export function proteinPlan(input: {
  weightKg: number;
  goal: GoalId;
  foodGramsPerKg?: number;
}): ProteinPlan | { error: string } {
  if (!Number.isFinite(input.weightKg) || input.weightKg < 35 || input.weightKg > 220) {
    return { error: "Peso entre 35 e 220 kg." };
  }
  const perKg = PROTEIN_PER_KG[input.goal];
  const food = input.foodGramsPerKg ?? 1;
  if (food < 0 || food > 3) return { error: "Proteína da comida entre 0 e 3 g/kg." };
  const targetGrams = Math.round(input.weightKg * perKg);
  const fromFoodGrams = Math.round(input.weightKg * food);
  const gapGrams = Math.max(0, targetGrams - fromFoodGrams);
  const scoopProteinGrams = 25;
  const scoops = Math.round((gapGrams / scoopProteinGrams) * 10) / 10;
  return {
    perKg,
    targetGrams,
    fromFoodGrams,
    gapGrams,
    scoops,
    scoopProteinGrams,
    disclaimer:
      "Conta educativa, não prescrição. Necessidade de proteína muda com o prato, o sono e o treino. Quem compete, está grávida ou tem condição de saúde precisa de nutricionista.",
  };
}

export interface CreatinePlan {
  grams: number;
  note: string;
  disclaimer: string;
}

export function creatinePlan(weightKg: number): CreatinePlan | { error: string } {
  if (!Number.isFinite(weightKg) || weightKg < 35 || weightKg > 220) {
    return { error: "Peso entre 35 e 220 kg." };
  }
  const grams = weightKg >= 90 ? 5 : 3;
  return {
    grams,
    note: "Creatina monohidratada, todo dia, com água. Fase de saturação não é obrigatória.",
    disclaimer: "Uso adulto. Se você tem orientação médica contrária, segue ela — a calculadora não substitui consulta.",
  };
}
