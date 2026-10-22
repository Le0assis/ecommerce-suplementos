import type { GoalId } from "./types";

export interface QuizAnswers {
  goal: GoalId;
  days: number;
  caffeine: "alta" | "media" | "zero";
  flavor: "citrica" | "doce" | "fruta" | "neutro";
  budget: "baixo" | "medio" | "alto";
}

export interface QuizResult {
  goal: GoalId;
  title: string;
  subtitle: string;
  productSlugs: string[];
  reasons: string[];
}

const TITLES: Record<GoalId, string> = {
  hipertrofia: "Stack de shape",
  emagrecimento: "Stack de cutting",
  energia: "Stack pra aguentar o dia",
  recuperacao: "Stack de quem volta amanhã",
  resistencia: "Stack de fôlego",
  saude: "Stack curto e diário",
};

export function quizResult(answers: QuizAnswers): QuizResult {
  const reasons: string[] = [];
  let slugs: string[];

  switch (answers.goal) {
    case "hipertrofia":
      slugs = ["shape-whey-isolado", "base-creatina", "caos-pre-treino", "volume-hipercalorico"];
      break;
    case "emagrecimento":
      slugs = ["clear-whey", "corte-termo", "base-creatina", "diaria-multi"];
      break;
    case "energia":
      slugs = ["caos-pre-treino", "pump-intra", "base-creatina"];
      break;
    case "recuperacao":
      slugs = ["night-recuperacao", "shape-whey-isolado", "base-creatina", "omega-3"];
      break;
    case "resistencia":
      slugs = ["pump-intra", "base-creatina", "clear-whey"];
      break;
    default:
      slugs = ["diaria-multi", "omega-3", "base-creatina"];
  }

  if (answers.caffeine === "zero") {
    slugs = slugs.map((slug) => (slug === "caos-pre-treino" || slug === "corte-termo" ? "foco-pre-sem-cafeina" : slug));
    reasons.push("Sem cafeína: trocamos o pré estimulante pelo Foco.");
  } else if (answers.caffeine === "alta" && !slugs.includes("caos-pre-treino") && answers.goal !== "saude") {
    slugs = ["caos-pre-treino", ...slugs];
    reasons.push("Você pediu cafeína de verdade. Caos entra na frente.");
  }

  if (answers.flavor === "doce") {
    reasons.push("Perfil doce: começa pelo whey, não pelo pré azedo.");
    slugs = [...slugs].sort((a, b) => Number(b.includes("whey") || b.includes("volume")) - Number(a.includes("whey") || a.includes("volume")));
  }
  if (answers.flavor === "citrica") reasons.push("Cítrico combina com Caos limão, Clear e a creatina de limão.");
  if (answers.days <= 2) reasons.push("Poucos dias de treino: menos pote, mais consistência.");
  if (answers.budget === "baixo") {
    slugs = slugs.filter((slug) => slug !== "volume-hipercalorico" && slug !== "collab-luna").slice(0, 2);
    if (!slugs.includes("base-creatina")) slugs.push("base-creatina");
    reasons.push("Orçamento curto: creatina + uma proteína resolvem o mês.");
  } else if (answers.budget === "medio") {
    slugs = slugs.slice(0, 3);
  } else {
    slugs = slugs.slice(0, 4);
    reasons.push("Orçamento aberto: stack de 3 a 4 produtos, sem encher o carrinho à toa.");
  }

  const unique = [...new Set(slugs)].slice(0, 4);
  if (!reasons.length) reasons.push("Montamos o mínimo que combina com teu objetivo.");

  return {
    goal: answers.goal,
    title: TITLES[answers.goal],
    subtitle: answers.days >= 5 ? "Rotina puxada. O stack acompanha." : "Dá pra evoluir sem viver na loja.",
    productSlugs: unique,
    reasons,
  };
}
