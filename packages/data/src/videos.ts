export interface VideoSpot {
  id: string;
  slug: string;
  title: string;
  caption: string;
  duration: string;
  frames: [string, string, string];
  transcript: string[];
}

export const videos: VideoSpot[] = [
  {
    id: "spot-caos",
    slug: "spot-caos",
    title: "Caos em quinze segundos",
    caption: "Limão, shaker, sem ator famoso.",
    duration: "0:15",
    frames: ["#d6ff3c", "#101402", "#ff3d8a"],
    transcript: [
      "Abre o pote. Meia dose se a cafeína é nova pra você.",
      "300 mg por dose cheia. O rótulo conta a história, não o story.",
      "Suplemento alimentar. Não é medicamento.",
    ],
  },
  {
    id: "spot-luna",
    slug: "spot-luna",
    title: "Collab Luna, take único",
    caption: "Pôster, não foto de campanha alheia.",
    duration: "0:12",
    frames: ["#ff5cae", "#070708", "#d6ff3c"],
    transcript: [
      "A Luna é personagem desta loja.",
      "O cupom dela está na página do atleta.",
      "Nada aqui usa imagem de uma pessoa real.",
    ],
  },
  {
    id: "spot-rotulo",
    slug: "spot-rotulo",
    title: "Como ler o rótulo",
    caption: "Porção, alergênico, advertência.",
    duration: "0:20",
    frames: ["#f6f6f4", "#d6ff3c", "#1c1c22"],
    transcript: [
      "Acha a porção antes de comparar preço.",
      "Alergênico fica em destaque. Leite no whey não é detalhe.",
      "Registro NI-DEMO é fictício neste protótipo.",
    ],
  },
];
