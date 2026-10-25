import type {
  Badge,
  CategoryId,
  Flavor,
  FlavorFamily,
  GoalId,
  KitItem,
  Product,
  ProductDrop,
  ProductLabel,
  ProductVariant,
} from "@pulso/domain";

interface FlavorSeed {
  id: string;
  name: string;
  tagline: string;
  hex: string;
  family: FlavorFamily;
  stock?: number;
  limited?: boolean;
}

interface SizeSeed {
  id: string;
  label: string;
  priceCents: number;
  compareAtCents?: number;
  weightGrams: number;
  servings: number;
}

const WARNINGS = [
  "Este produto não é um medicamento.",
  "Não exceder a recomendação diária indicada na embalagem.",
  "Suplemento alimentar para adultos. Gestantes, lactantes e crianças só com orientação de profissional de saúde.",
  "Mantenha fora do alcance de crianças, em local seco e ao abrigo da luz.",
  "Quem compete deve conferir a lista de substâncias proibidas da sua modalidade.",
];

const wheyTable = [
  { nutrient: "Valor energético", amount: "480 kJ / 115 kcal", dailyValue: "6%" },
  { nutrient: "Carboidratos", amount: "2,1 g", dailyValue: "1%" },
  { nutrient: "Açúcares", amount: "1,0 g" },
  { nutrient: "Proteínas", amount: "25 g", dailyValue: "50%" },
  { nutrient: "Gorduras totais", amount: "1,2 g", dailyValue: "2%" },
  { nutrient: "Gorduras saturadas", amount: "0,6 g", dailyValue: "3%" },
  { nutrient: "Sódio", amount: "90 mg", dailyValue: "4%" },
];

function flavors(seeds: FlavorSeed[]): Flavor[] {
  return seeds.map((seed) => ({ stock: 90, ...seed }));
}

function variants(slug: string, items: Flavor[], sizes: SizeSeed[]): ProductVariant[] {
  return items.flatMap((flavor) =>
    sizes.map((size) => ({
      id: `${slug}__${flavor.id}__${size.id}`,
      flavorId: flavor.id,
      size: size.label,
      sku: `PL-${slug}-${flavor.id}-${size.id}`.toUpperCase(),
      priceCents: size.priceCents,
      compareAtCents: size.compareAtCents,
      stock: flavor.stock,
      weightGrams: size.weightGrams,
      servings: size.servings,
    })),
  );
}

function facts(input: Omit<ProductLabel, "category" | "warnings" | "manufacturer"> & Partial<Pick<ProductLabel, "warnings">>): ProductLabel {
  return {
    category: "Suplemento alimentar",
    warnings: input.warnings ?? WARNINGS,
    manufacturer: "PULSO Indústria de Alimentos Ltda. (empresa fictícia deste protótipo) — São Paulo/SP. Responsável técnico: a definir no registro real.",
    registration: input.registration,
    serving: input.serving,
    servingsPerContainer: input.servingsPerContainer,
    ingredients: input.ingredients,
    allergens: input.allergens,
    nutrition: input.nutrition,
  };
}

interface Draft {
  slug: string;
  name: string;
  line: string;
  tagline: string;
  description: string;
  howToUse: string;
  category: CategoryId;
  goals: GoalId[];
  flavorSeeds: FlavorSeed[];
  sizes: SizeSeed[];
  badges?: Badge[];
  subscription?: boolean;
  subscriptionPercent?: number;
  caffeineMg?: number;
  proteinPerServingGrams?: number;
  influencerSlug?: string;
  drop?: ProductDrop;
  isKit?: boolean;
  kitItems?: KitItem[];
  label: ProductLabel;
}

function product(draft: Draft): Product & { label: ProductLabel } {
  const items = flavors(draft.flavorSeeds);
  return {
    id: draft.slug,
    slug: draft.slug,
    name: draft.name,
    line: draft.line,
    tagline: draft.tagline,
    description: draft.description,
    howToUse: draft.howToUse,
    category: draft.category,
    goals: draft.goals,
    flavors: items,
    variants: variants(draft.slug, items, draft.sizes),
    badges: draft.badges ?? [],
    rating: 0,
    reviewCount: 0,
    subscription: {
      enabled: draft.subscription ?? true,
      discountPercent: draft.subscriptionPercent ?? 10,
      intervalDays: 30,
    },
    caffeineMg: draft.caffeineMg ?? 0,
    proteinPerServingGrams: draft.proteinPerServingGrams ?? 0,
    influencerSlug: draft.influencerSlug,
    drop: draft.drop,
    isKit: draft.isKit,
    kitItems: draft.kitItems,
    label: draft.label,
  };
}

export type CatalogProduct = Product & { label: ProductLabel };

export const catalogProducts: CatalogProduct[] = [
  product({
    slug: "caos-pre-treino",
    name: "Caos",
    line: "Pré-treino",
    tagline: "O pré que não pede licença.",
    description: "Cafeína, beta-alanina e sabor alto pra série que começa quando o dia já acabou. Feito pra quem treina de noite, entre um trampo e um story.",
    howToUse: "Misture 1 dose (10 g) em 250 ml de água gelada, 20 a 30 minutos antes de treinar. Não combine com outro produto de cafeína no mesmo horário.",
    category: "pre-treino",
    goals: ["energia", "hipertrofia", "resistencia"],
    badges: ["bestseller", "drop"],
    caffeineMg: 300,
    flavorSeeds: [
      { id: "limao", name: "Limão Elétrico", tagline: "Azedo que acorda até desculpa.", hex: "#d6ff3c", family: "citrica" },
      { id: "uva", name: "Uva Insana", tagline: "Doce, roxo e sem freio.", hex: "#b794f6", family: "fruta" },
      { id: "frutas", name: "Frutas Vermelhas", tagline: "Berry de quem treina de noite.", hex: "#ff3d8a", family: "fruta" },
      { id: "melancia", name: "Melancia Ácida", tagline: "Drop 04. Acabou, acabou.", hex: "#ff5d73", family: "fruta", stock: 14, limited: true },
    ],
    sizes: [{ id: "300", label: "300 g · 30 doses", priceCents: 14990, weightGrams: 300, servings: 30 }],
    drop: { id: "drop-04-melancia", edition: "Drop 04", endsAt: "2026-11-08T23:59:00-03:00", unitsLeft: 14 },
    label: facts({
      registration: "NI-DEMO-0001",
      serving: "10 g (1 dosador)",
      servingsPerContainer: 30,
      ingredients: "Beta-alanina, creatina monohidratada, L-citrulina, cafeína anidra, taurina, aroma idêntico ao natural, acidulante ácido cítrico, edulcorantes sucralose e acessulfame-K, antiumectante dióxido de silício, corante natural conforme o sabor.",
      allergens: "Pode conter leite, soja e ovo.",
      nutrition: [
        { nutrient: "Valor energético", amount: "70 kJ / 17 kcal", dailyValue: "1%" },
        { nutrient: "Carboidratos", amount: "1 g" },
        { nutrient: "Cafeína", amount: "300 mg" },
        { nutrient: "Beta-alanina", amount: "3,2 g" },
        { nutrient: "Citrulina", amount: "3 g" },
        { nutrient: "Sódio", amount: "40 mg", dailyValue: "2%" },
      ],
    }),
  }),
  product({
    slug: "foco-pre-sem-cafeina",
    name: "Foco",
    line: "Pré sem cafeína",
    tagline: "Pump pra quem treina tarde e quer dormir.",
    description: "Pré stim-free com citrulina e beta-alanina. Mesma cara de collab, zero cafeína. Serve pra quem já tomou café o dia inteiro.",
    howToUse: "1 dose (10 g) em 300 ml de água, antes de treinar. Pode usar à noite.",
    category: "pre-treino",
    goals: ["energia", "hipertrofia"],
    badges: ["novo"],
    caffeineMg: 0,
    flavorSeeds: [
      { id: "uva", name: "Uva Calma", tagline: "Doce, sem o coração disparado.", hex: "#c4b5fd", family: "fruta" },
      { id: "limao", name: "Limão Zero", tagline: "Cítrico e limpo.", hex: "#d6ff3c", family: "citrica" },
      { id: "framboesa", name: "Framboesa", tagline: "Azedinha, cor de drop.", hex: "#fb7185", family: "fruta" },
    ],
    sizes: [{ id: "300", label: "300 g · 30 doses", priceCents: 13990, weightGrams: 300, servings: 30 }],
    label: facts({
      registration: "NI-DEMO-0002",
      serving: "10 g",
      servingsPerContainer: 30,
      ingredients: "L-citrulina, beta-alanina, taurina, magnésio, aroma, acidulante ácido cítrico, edulcorantes sucralose e acessulfame-K, antiumectante dióxido de silício.",
      allergens: "Pode conter leite e soja.",
      nutrition: [
        { nutrient: "Valor energético", amount: "60 kJ / 14 kcal", dailyValue: "1%" },
        { nutrient: "Citrulina", amount: "4 g" },
        { nutrient: "Beta-alanina", amount: "3,2 g" },
        { nutrient: "Cafeína", amount: "0 mg" },
      ],
    }),
  }),
  product({
    slug: "shape-whey-isolado",
    name: "Shape",
    line: "Whey isolado",
    tagline: "25 g de proteína. Sabor que você toma até sexta.",
    description: "Isolado de verdade, pouca lactose e cinco sabores que parecem sobremesa sem virar açúcar. O pote que fica em cima da geladeira de propósito.",
    howToUse: "1 dosador (30 g) em 200 ml de água ou leite, a qualquer hora do dia. Não precisa ser só no pós-treino.",
    category: "whey",
    goals: ["hipertrofia", "emagrecimento", "recuperacao"],
    badges: ["bestseller"],
    proteinPerServingGrams: 25,
    flavorSeeds: [
      { id: "chocolate", name: "Chocolate Meia-Noite", tagline: "Cacau de verdade, não pó doce.", hex: "#6b3a22", family: "chocolate" },
      { id: "baunilha", name: "Baunilha Nuvem", tagline: "Base pra vitamina, bowl ou copo.", hex: "#f3e6c8", family: "doce" },
      { id: "morango", name: "Morango Doce", tagline: "Fruta, não bala velha.", hex: "#ff8fab", family: "fruta" },
      { id: "leite", name: "Doce de Leite", tagline: "O sabor que a casa pede.", hex: "#e0a35c", family: "doce" },
      { id: "cookies", name: "Cookies", tagline: "Pedacinho crocante, sem vergonha.", hex: "#c4a07a", family: "chocolate" },
    ],
    sizes: [
      { id: "450", label: "450 g · 15 doses", priceCents: 12990, weightGrams: 450, servings: 15 },
      { id: "900", label: "900 g · 30 doses", priceCents: 18990, compareAtCents: 21990, weightGrams: 900, servings: 30 },
    ],
    label: facts({
      registration: "NI-DEMO-0003",
      serving: "30 g",
      servingsPerContainer: 30,
      ingredients: "Proteína isolada de soro de leite, cacau em pó ou aroma conforme o sabor, emulsificante lecitina de girassol, edulcorante sucralose, antiumectante dióxido de silício.",
      allergens: "Contém leite e derivados. Pode conter soja.",
      nutrition: wheyTable,
    }),
  }),
  product({
    slug: "clear-whey",
    name: "Clear",
    line: "Whey suco",
    tagline: "Proteína que bebe gelada, tipo suco.",
    description: "Isolado hidrolisado com cara de refresco. Menos denso que o shake clássico, feito pra cutting e pra quem enjoou de chocolate.",
    howToUse: "1 sachê-dose (25 g) em 350 ml de água bem gelada. Agite e espera a espuma baixar.",
    category: "whey",
    goals: ["emagrecimento", "hipertrofia", "resistencia"],
    badges: ["novo"],
    proteinPerServingGrams: 20,
    flavorSeeds: [
      { id: "limao", name: "Limão Gelo", tagline: "Quase soda, com 20 g de proteína.", hex: "#d6ff3c", family: "citrica" },
      { id: "uva", name: "Uva Roxa", tagline: "Suco de treino, não de lanchonete.", hex: "#a78bfa", family: "fruta" },
      { id: "melancia", name: "Melancia Clara", tagline: "Leve, doce na medida.", hex: "#fb7185", family: "fruta" },
    ],
    sizes: [{ id: "500", label: "500 g · 20 doses", priceCents: 17990, weightGrams: 500, servings: 20 }],
    label: facts({
      registration: "NI-DEMO-0004",
      serving: "25 g",
      servingsPerContainer: 20,
      ingredients: "Proteína isolada e hidrolisada de soro de leite, acidulante ácido cítrico, aroma, edulcorantes sucralose e acessulfame-K.",
      allergens: "Contém leite. Pode conter soja.",
      nutrition: [
        { nutrient: "Valor energético", amount: "360 kJ / 86 kcal", dailyValue: "4%" },
        { nutrient: "Proteínas", amount: "20 g", dailyValue: "40%" },
        { nutrient: "Carboidratos", amount: "0,5 g" },
        { nutrient: "Sódio", amount: "50 mg", dailyValue: "2%" },
      ],
    }),
  }),
  product({
    slug: "base-creatina",
    name: "Base",
    line: "Creatina",
    tagline: "3 a 5 g. Todo dia. Sem mistério.",
    description: "Monohidratada, micronizada, sem blend milagroso. O pote mais sem graça do catálogo — e o que a gente mais recomenda.",
    howToUse: "3 g (ou 5 g acima de 90 kg) em água, suco ou no whey, qualquer hora do dia. Não precisa carregar.",
    category: "creatina",
    goals: ["hipertrofia", "energia", "resistencia", "recuperacao"],
    badges: ["bestseller"],
    flavorSeeds: [
      { id: "neutro", name: "Sem sabor", tagline: "Some no whey e no suco.", hex: "#e7e5e4", family: "neutro" },
      { id: "limao", name: "Limão Seco", tagline: "Um cítrico curto, pra água.", hex: "#d6ff3c", family: "citrica" },
    ],
    sizes: [
      { id: "150", label: "150 g · 50 doses de 3 g", priceCents: 5990, weightGrams: 150, servings: 50 },
      { id: "300", label: "300 g · 100 doses de 3 g", priceCents: 8990, weightGrams: 300, servings: 100 },
    ],
    label: facts({
      registration: "NI-DEMO-0005",
      serving: "3 g",
      servingsPerContainer: 100,
      ingredients: "Creatina monohidratada. Versão limão: aroma idêntico ao natural e edulcorante sucralose.",
      allergens: "Não contém glúten. Pode conter traços de leite por equipamento compartilhado.",
      nutrition: [
        { nutrient: "Creatina monohidratada", amount: "3 g" },
        { nutrient: "Valor energético", amount: "0 kcal" },
      ],
    }),
  }),
  product({
    slug: "pump-intra",
    name: "Pump",
    line: "Intra EAA",
    tagline: "Garrafa colorida, série longa.",
    description: "Aminoácidos essenciais com eletrólitos pra sessão que passa de uma hora. Sabor de energético de festa, função de treino.",
    howToUse: "1 dose durante o treino, em 500 ml de água. Pode dividir em goles.",
    category: "aminoacidos",
    goals: ["resistencia", "hipertrofia", "recuperacao"],
    flavorSeeds: [
      { id: "blue", name: "Blue Raspberry", tagline: "Azul de vídeo game.", hex: "#3d7bff", family: "fruta" },
      { id: "laranja", name: "Laranja Laser", tagline: "Cítrica e barulhenta.", hex: "#ff8a00", family: "citrica" },
      { id: "limao", name: "Limão Gelo", tagline: "A opção menos doce.", hex: "#d6ff3c", family: "citrica" },
    ],
    sizes: [{ id: "300", label: "300 g · 30 doses", priceCents: 12990, weightGrams: 300, servings: 30 }],
    label: facts({
      registration: "NI-DEMO-0006",
      serving: "10 g",
      servingsPerContainer: 30,
      ingredients: "Blend de aminoácidos essenciais (L-leucina, L-isoleucina, L-valina, L-lisina, L-treonina, L-fenilalanina, L-metionina, L-histidina, L-triptofano), sódio, potássio, magnésio, aroma, acidulante, edulcorantes.",
      allergens: "Pode conter leite e soja.",
      nutrition: [
        { nutrient: "Valor energético", amount: "80 kJ / 19 kcal" },
        { nutrient: "Aminoácidos essenciais", amount: "7 g" },
        { nutrient: "Sódio", amount: "180 mg", dailyValue: "8%" },
        { nutrient: "Potássio", amount: "120 mg" },
      ],
    }),
  }),
  product({
    slug: "corte-termo",
    name: "Corte",
    line: "Termogênico",
    tagline: "Cafeína e chá verde. Sem promessa mágica.",
    description: "Cápsula pro cutting de quem já come direito e quer um empurrão de energia. Não derrete gordura sozinho — e a gente não vai fingir que derrete.",
    howToUse: "1 cápsula pela manhã, com água. Não use perto de dormir nem junto com o Caos no mesmo horário.",
    category: "termogenico",
    goals: ["emagrecimento", "energia"],
    caffeineMg: 200,
    subscription: true,
    flavorSeeds: [
      { id: "abacaxi", name: "Abacaxi", tagline: "O aroma da cápsula, não um suco.", hex: "#ffe14a", family: "citrica" },
      { id: "tropical", name: "Frutas Tropicais", tagline: "Mistura doce-ácida.", hex: "#ff7a59", family: "fruta" },
    ],
    sizes: [{ id: "60", label: "60 cápsulas · 60 doses", priceCents: 11990, weightGrams: 70, servings: 60 }],
    label: facts({
      registration: "NI-DEMO-0007",
      serving: "1 cápsula",
      servingsPerContainer: 60,
      ingredients: "Cafeína anidra, extrato de chá verde, pimenta caiena, cromo, antiumectante dióxido de silício, cápsula vegetal.",
      allergens: "Não contém glúten.",
      warnings: [
        ...WARNINGS,
        "Contém cafeína. Evite se você é sensível, está grávida ou usa outro estimulante.",
      ],
      nutrition: [
        { nutrient: "Cafeína", amount: "200 mg" },
        { nutrient: "Extrato de chá verde", amount: "200 mg" },
      ],
    }),
  }),
  product({
    slug: "diaria-multi",
    name: "Diária",
    line: "Multivitamínico",
    tagline: "O que a marmita não cobriu.",
    description: "Complexo de vitaminas e minerais em dose de adulto ativo. Sem frase de imunidade milagrosa: é complemento, não escudo.",
    howToUse: "1 cápsula no café da manhã, com comida.",
    category: "vitaminas",
    goals: ["saude", "recuperacao"],
    flavorSeeds: [{ id: "capsula", name: "Cápsula sem sabor", tagline: "Engole e segue.", hex: "#a3e635", family: "neutro" }],
    sizes: [{ id: "60", label: "60 cápsulas", priceCents: 6990, weightGrams: 60, servings: 60 }],
    label: facts({
      registration: "NI-DEMO-0008",
      serving: "1 cápsula",
      servingsPerContainer: 60,
      ingredients: "Vitaminas A, C, D, E, complexo B, zinco, magnésio, selênio, iodo, cápsula vegetal.",
      allergens: "Não contém glúten nem lactose.",
      nutrition: [
        { nutrient: "Vitamina C", amount: "90 mg", dailyValue: "90%" },
        { nutrient: "Vitamina D", amount: "15 mcg", dailyValue: "75%" },
        { nutrient: "Zinco", amount: "7 mg", dailyValue: "64%" },
        { nutrient: "Magnésio", amount: "60 mg", dailyValue: "14%" },
      ],
    }),
  }),
  product({
    slug: "volume-hipercalorico",
    name: "Volume",
    line: "Hipercalórico",
    tagline: "Caloria extra pra quem não consegue comer mais.",
    description: "Blend de carboidrato e proteína pro bulking de quem treina pesado e sai da mesa ainda leve. Não é atalho pra pular refeição.",
    howToUse: "2 dosadores (80 g) em 300 ml de água, como lanche. Ajuste se o resto do dia já cobre as calorias.",
    category: "hipercalorico",
    goals: ["hipertrofia"],
    proteinPerServingGrams: 18,
    flavorSeeds: [
      { id: "baunilha", name: "Baunilha", tagline: "A mais fácil de tomar todo dia.", hex: "#f5e6c8", family: "doce" },
      { id: "chocolate", name: "Chocolate", tagline: "Mais denso, tipo milk-shake.", hex: "#6b3a22", family: "chocolate" },
      { id: "morango", name: "Morango", tagline: "Doce, sem ser infantil.", hex: "#fb7185", family: "fruta" },
    ],
    sizes: [{ id: "1k", label: "1,4 kg · 17 doses", priceCents: 15990, weightGrams: 1400, servings: 17 }],
    label: facts({
      registration: "NI-DEMO-0009",
      serving: "80 g",
      servingsPerContainer: 17,
      ingredients: "Maltodextrina, proteína concentrada de soro de leite, cacau ou aroma, vitaminas, minerais.",
      allergens: "Contém leite. Pode conter soja e glúten.",
      nutrition: [
        { nutrient: "Valor energético", amount: "1280 kJ / 306 kcal", dailyValue: "15%" },
        { nutrient: "Carboidratos", amount: "48 g", dailyValue: "16%" },
        { nutrient: "Proteínas", amount: "18 g", dailyValue: "36%" },
        { nutrient: "Gorduras totais", amount: "4 g", dailyValue: "7%" },
      ],
    }),
  }),
  product({
    slug: "barra-shape",
    name: "Barra Shape",
    line: "Barra de proteína",
    tagline: "12 g de proteína entre uma aula e outra.",
    description: "Barra macia, cobertura fininha, cabe no bolso do moletom. Lanche, não refeição.",
    howToUse: "1 barra quando a próxima refeição ainda está longe. Tome água junto.",
    category: "barra",
    goals: ["hipertrofia", "emagrecimento", "saude"],
    proteinPerServingGrams: 12,
    subscription: false,
    flavorSeeds: [
      { id: "chocolate", name: "Chocolate", tagline: "A segura.", hex: "#6b3a22", family: "chocolate" },
      { id: "cookies", name: "Cookies", tagline: "A que some primeiro.", hex: "#d6b48a", family: "doce" },
    ],
    sizes: [
      { id: "1", label: "1 barra", priceCents: 1490, weightGrams: 50, servings: 1 },
      { id: "12", label: "Caixa com 12", priceCents: 14990, compareAtCents: 17880, weightGrams: 600, servings: 12 },
    ],
    label: facts({
      registration: "NI-DEMO-0010",
      serving: "1 barra (50 g)",
      servingsPerContainer: 1,
      ingredients: "Proteína de leite, cobertura de chocolate meio amargo, pasta de amendoim, colágeno, glicerina, aroma.",
      allergens: "Contém leite e amendoim. Pode conter castanhas e soja.",
      nutrition: [
        { nutrient: "Valor energético", amount: "850 kJ / 203 kcal", dailyValue: "10%" },
        { nutrient: "Proteínas", amount: "12 g", dailyValue: "24%" },
        { nutrient: "Carboidratos", amount: "18 g", dailyValue: "6%" },
        { nutrient: "Gorduras totais", amount: "8 g", dailyValue: "15%" },
      ],
    }),
  }),
  product({
    slug: "collab-luna",
    name: "Luna × PULSO",
    line: "Collab",
    tagline: "O whey cor de drop. Edição com a Luna Vaz.",
    description: "Isolado em dois sabores assinados pela Luna: rosa chiclete e lima candy. Lote curto, sem reposição prometida.",
    howToUse: "1 dosador (30 g) em água gelada. Os sabores são mais doces — começa com menos pó se quiser.",
    category: "whey",
    goals: ["hipertrofia", "emagrecimento"],
    badges: ["collab", "limited", "drop"],
    proteinPerServingGrams: 24,
    influencerSlug: "luna-vaz",
    flavorSeeds: [
      { id: "rosa", name: "Rosa Chiclete", tagline: "Doce, alto, inconfundível.", hex: "#ff5cae", family: "doce", stock: 40, limited: true },
      { id: "lima", name: "Lima Candy", tagline: "Cítrico com final de bala.", hex: "#d6ff3c", family: "citrica", stock: 36, limited: true },
    ],
    sizes: [{ id: "900", label: "900 g · edição limitada", priceCents: 20990, compareAtCents: 23990, weightGrams: 900, servings: 30 }],
    drop: { id: "drop-luna", edition: "Collab Luna", endsAt: "2026-11-30T23:59:00-03:00", unitsLeft: 76 },
    label: facts({
      registration: "NI-DEMO-0011",
      serving: "30 g",
      servingsPerContainer: 30,
      ingredients: "Proteína isolada de soro de leite, aroma idêntico ao natural, corante natural, edulcorante sucralose, emulsificante lecitina de girassol.",
      allergens: "Contém leite. Pode conter soja.",
      nutrition: wheyTable.map((row) => (row.nutrient === "Proteínas" ? { ...row, amount: "24 g", dailyValue: "48%" } : row)),
    }),
  }),
  product({
    slug: "night-recuperacao",
    name: "Night",
    line: "Ritual da noite",
    tagline: "Magnésio e glicina pra desligar depois do treino.",
    description: "Pó de maracujá com magnésio e glicina. Não é sonífero e não trata insônia: é um ritual de fechar o dia, com a composição escrita no rótulo.",
    howToUse: "1 dose (6 g) em 150 ml de água, 30 a 60 minutos antes de dormir. Longe do Caos.",
    category: "vitaminas",
    goals: ["recuperacao", "saude"],
    caffeineMg: 0,
    flavorSeeds: [{ id: "maracuja", name: "Maracujá", tagline: "Azedinho, noite de quinta.", hex: "#f5c16c", family: "fruta" }],
    sizes: [{ id: "180", label: "180 g · 30 doses", priceCents: 9990, weightGrams: 180, servings: 30 }],
    label: facts({
      registration: "NI-DEMO-0012",
      serving: "6 g",
      servingsPerContainer: 30,
      ingredients: "Glicina, citrato de magnésio, aroma de maracujá, acidulante ácido cítrico, edulcorante sucralose.",
      allergens: "Não contém glúten nem lactose.",
      nutrition: [
        { nutrient: "Magnésio", amount: "200 mg", dailyValue: "48%" },
        { nutrient: "Glicina", amount: "3 g" },
        { nutrient: "Valor energético", amount: "50 kJ / 12 kcal" },
      ],
    }),
  }),
  product({
    slug: "omega-3",
    name: "Ômega",
    line: "Ômega 3",
    tagline: "Duas cápsulas. Rotina sem discurso.",
    description: "Óleo de peixe concentrado em EPA e DHA. O item quieto da prateleira de saúde, do lado do multivitamínico.",
    howToUse: "2 cápsulas ao dia, com uma refeição que tenha gordura.",
    category: "vitaminas",
    goals: ["saude", "recuperacao"],
    flavorSeeds: [{ id: "capsula", name: "Cápsula", tagline: "Sem sabor de shake.", hex: "#93c5fd", family: "neutro" }],
    sizes: [{ id: "60", label: "60 cápsulas · 30 doses", priceCents: 5990, weightGrams: 80, servings: 30 }],
    label: facts({
      registration: "NI-DEMO-0013",
      serving: "2 cápsulas",
      servingsPerContainer: 30,
      ingredients: "Óleo de peixe (fonte de EPA e DHA), vitamina E, cápsula de gelatina.",
      allergens: "Contém peixe. Cápsula de origem animal.",
      nutrition: [
        { nutrient: "EPA", amount: "360 mg" },
        { nutrient: "DHA", amount: "240 mg" },
        { nutrient: "Valor energético", amount: "70 kJ / 17 kcal" },
      ],
    }),
  }),
  product({
    slug: "kit-bruto",
    name: "Kit Bruto",
    line: "Stack hipertrofia",
    tagline: "Caos + Shape + Base, num preço só.",
    description: "O stack que a gente montaria pra um mês de hipertrofia: pré Caos 300 g, whey Shape 900 g e creatina Base 300 g. Os sabores você escolhe na hora.",
    howToUse: "Use cada produto como no rótulo individual. O kit não muda a dose.",
    category: "kit",
    goals: ["hipertrofia", "energia"],
    badges: ["bestseller"],
    isKit: true,
    kitItems: [
      { productSlug: "caos-pre-treino", quantity: 1 },
      { productSlug: "shape-whey-isolado", quantity: 1 },
      { productSlug: "base-creatina", quantity: 1 },
    ],
    caffeineMg: 300,
    proteinPerServingGrams: 25,
    flavorSeeds: [
      { id: "limao-choco", name: "Limão + Chocolate + Neutro", tagline: "A combinação clássica.", hex: "#d6ff3c", family: "citrica" },
      { id: "uva-leite", name: "Uva + Doce de leite + Limão", tagline: "A combinação doce.", hex: "#e0a35c", family: "doce" },
      { id: "frutas-morango", name: "Frutas + Morango + Neutro", tagline: "A combinação fruta.", hex: "#ff3d8a", family: "fruta" },
    ],
    sizes: [{ id: "mes", label: "Kit mês", priceCents: 37990, compareAtCents: 42970, weightGrams: 1500, servings: 30 }],
    label: facts({
      registration: "NI-DEMO-0014",
      serving: "Conforme cada produto do kit",
      servingsPerContainer: 30,
      ingredients: "Ver ingredientes de Caos, Shape e Base. Cada pote traz o próprio rótulo.",
      allergens: "Contém leite (whey). Pré e creatina podem conter traços de leite e soja.",
      nutrition: [{ nutrient: "Ver tabela", amount: "Em cada pote do kit" }],
    }),
  }),
];

export const upcomingDrop = {
  id: "drop-05",
  edition: "Drop 05",
  name: "Sabor ainda sem nome",
  endsAt: "2026-12-15T18:00:00-03:00",
  teaser: true,
  note: "A lista de espera guarda teu e-mail neste navegador. Não enviamos nada de verdade neste protótipo.",
};
