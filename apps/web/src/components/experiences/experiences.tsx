"use client";

import { ProductCard } from "@/components/product/product-card";
import { useStoreData } from "@/components/store-data";
import { Button } from "@/components/ui/button";
import { useCurrentUser, usePulso } from "@/lib/store";
import {
  GOALS,
  creatinePlan,
  formatBRL,
  proteinPlan,
  quizResult,
  saoPauloDateKey,
  scratchPrize,
  type GoalId,
  type QuizAnswers,
} from "@pulso/domain";
import Link from "next/link";
import { useMemo, useRef, useState } from "react";

const questions: { key: keyof QuizAnswers; title: string; options: { id: string; label: string }[] }[] = [
  { key: "goal", title: "Qual é o objetivo agora?", options: GOALS.map((goal) => ({ id: goal.id, label: goal.label })) },
  { key: "days", title: "Quantos dias você treina?", options: [2, 3, 4, 5, 6].map((days) => ({ id: String(days), label: `${days} dias` })) },
  { key: "caffeine", title: "Cafeína, como é?", options: [{ id: "alta", label: "Quero o máximo" }, { id: "media", label: "No meio" }, { id: "zero", label: "Sem cafeína" }] },
  { key: "flavor", title: "Que sabor te representa?", options: [{ id: "citrica", label: "Cítrico elétrico" }, { id: "doce", label: "Doce" }, { id: "fruta", label: "Fruta" }, { id: "neutro", label: "Sem sabor" }] },
  { key: "budget", title: "Orçamento do mês", options: [{ id: "baixo", label: "Até uns R$ 150" }, { id: "medio", label: "R$ 150 a 300" }, { id: "alto", label: "Monta o stack" }] },
];

export function QuizView() {
  const { products } = useStoreData();
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Partial<QuizAnswers>>({});
  const current = questions[step];
  const done = step >= questions.length;
  const result = done ? quizResult(answers as QuizAnswers) : null;
  const picks = result ? products.filter((product) => result.productSlugs.includes(product.slug)) : [];

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-lime">Quiz</p>
      <h1 className="font-display text-7xl leading-[0.85]">Descobre teu stack</h1>
      <p className="mt-3 text-muted-foreground">Cinco respostas. Sem formulário de lead. A recomendação é educativa, não prescrição.</p>
      {!done && current ? (
        <div className="mt-8">
          <p className="text-sm text-lime">{step + 1} / {questions.length}</p>
          <h2 className="font-display text-5xl leading-none">{current.title}</h2>
          <div className="mt-4 grid gap-2">
            {current.options.map((option) => (
              <button
                key={option.id}
                type="button"
                className="rounded-2xl border border-white/10 px-4 py-4 text-left text-lg hover:border-lime"
                onClick={() => {
                  const value = current.key === "days" ? Number(option.id) : option.id;
                  const next = { ...answers, [current.key]: value };
                  setAnswers(next);
                  setStep((valueStep) => valueStep + 1);
                }}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {result ? (
        <div className="mt-8">
          <h2 className="font-display text-6xl leading-none">{result.title}</h2>
          <p className="mt-2 text-muted-foreground">{result.subtitle}</p>
          <ul className="mt-4 list-disc space-y-1 pl-5 text-sm">{result.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">{picks.map((product) => <ProductCard key={product.slug} product={product} />)}</div>
          <Button className="mt-6 rounded-full" variant="outline" onClick={() => { setStep(0); setAnswers({}); }}>Refazer</Button>
        </div>
      ) : null}
    </div>
  );
}

export function CalculatorView() {
  const [weight, setWeight] = useState(70);
  const [goal, setGoal] = useState<GoalId>("hipertrofia");
  const [food, setFood] = useState(1);
  const protein = proteinPlan({ weightKg: weight, goal, foodGramsPerKg: food });
  const creatine = creatinePlan(weight);
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-lime">Calculadora</p>
      <h1 className="font-display text-7xl leading-[0.85]">Proteína e creatina</h1>
      <label className="mt-6 block text-sm">Peso: {weight} kg
        <input type="range" min={40} max={140} value={weight} onChange={(event) => setWeight(Number(event.target.value))} className="mt-2 w-full accent-lime" />
      </label>
      <label className="mt-4 block text-sm">Objetivo
        <select value={goal} onChange={(event) => setGoal(event.target.value as GoalId)} className="mt-2 h-11 w-full rounded-full border border-white/15 bg-background px-4">
          {GOALS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
        </select>
      </label>
      <label className="mt-4 block text-sm">Proteína que a comida já cobre: {food.toFixed(1)} g/kg
        <input type="range" min={0} max={2.5} step={0.1} value={food} onChange={(event) => setFood(Number(event.target.value))} className="mt-2 w-full accent-lime" />
      </label>
      {"targetGrams" in protein ? (
        <div className="mt-6 rounded-[1.6rem] border border-white/10 p-5">
          <p className="font-display text-6xl leading-none">{protein.targetGrams} g</p>
          <p className="text-sm text-muted-foreground">meta do dia · {protein.perKg} g/kg. A comida cobre cerca de {protein.fromFoodGrams} g. Faltam {protein.gapGrams} g, perto de {protein.scoops} doses do Shape (25 g).</p>
          <p className="mt-3 text-xs text-muted-foreground">{protein.disclaimer}</p>
          <Button className="mt-4 rounded-full" asChild><Link href="/loja/shape-whey-isolado">Ver o Shape</Link></Button>
        </div>
      ) : <p className="mt-4 text-pink">{protein.error}</p>}
      {"grams" in creatine ? (
        <div className="mt-4 rounded-[1.6rem] bg-lime p-5 text-primary-foreground">
          <p className="font-display text-6xl leading-none">{creatine.grams} g</p>
          <p className="text-sm">{creatine.note}</p>
          <p className="mt-2 text-xs">{creatine.disclaimer}</p>
          <Button className="mt-4 rounded-full bg-black text-white hover:bg-black/80" asChild><Link href="/loja/base-creatina">Ver a Base</Link></Button>
        </div>
      ) : null}
    </div>
  );
}

export function KitBuilder() {
  const { products } = useStoreData();
  const add = usePulso((state) => state.addToCart);
  const slots = [
    { id: "pre-treino", label: "Pré" },
    { id: "whey", label: "Proteína" },
    { id: "creatina", label: "Creatina" },
  ] as const;
  const [picked, setPicked] = useState<Record<string, string>>({
    "pre-treino": "caos-pre-treino",
    whey: "shape-whey-isolado",
    creatina: "base-creatina",
  });
  const chosen = slots.map((slot) => products.find((product) => product.slug === picked[slot.id])).filter((product) => product !== undefined);
  const total = chosen.reduce((sum, product) => sum + Math.min(...product.variants.map((variant) => variant.priceCents)), 0);
  const kit = Math.round(total * 0.88);
  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-lime">Kit builder</p>
      <h1 className="font-display text-7xl leading-[0.85]">Monta o stack</h1>
      <p className="mt-3 max-w-2xl text-muted-foreground">Três categorias no carrinho liberam 12% — o mesmo desconto entra sozinho se você misturar pré, whey e creatina na sacola. Aqui a gente já mostra o número.</p>
      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        {slots.map((slot) => (
          <fieldset key={slot.id} className="rounded-[1.4rem] border border-white/10 p-3">
            <legend className="px-2 font-display text-3xl">{slot.label}</legend>
            <div className="mt-2 space-y-2">
              {products.filter((product) => product.category === slot.id).map((product) => (
                <label key={product.slug} className="flex items-center gap-2 text-sm">
                  <input type="radio" name={slot.id} checked={picked[slot.id] === product.slug} onChange={() => setPicked((current) => ({ ...current, [slot.id]: product.slug }))} className="accent-lime" />
                  {product.name}
                </label>
              ))}
            </div>
          </fieldset>
        ))}
      </div>
      <div className="mt-6 flex flex-wrap items-end justify-between gap-4 rounded-[1.6rem] bg-lime p-5 text-primary-foreground">
        <div>
          <p className="text-sm line-through opacity-70">{formatBRL(total)}</p>
          <p className="font-display text-6xl leading-none">{formatBRL(kit)}</p>
          <p className="text-sm">com 12% de kit. Os sabores você escolhe na página de cada um, ou a gente manda o primeiro sabor.</p>
        </div>
        <Button
          className="rounded-full bg-black text-white hover:bg-black/80"
          onClick={() => {
            for (const product of chosen) {
              const flavor = product.flavors[0];
              const variant = product.variants[0];
              if (!flavor || !variant) continue;
              add({
                productSlug: product.slug,
                variantId: variant.id,
                name: product.name,
                flavorName: flavor.name,
                size: variant.size,
                unitPriceCents: variant.priceCents,
                subscription: false,
                subscriptionDiscountPercent: product.subscription.discountPercent,
                category: product.category,
                hex: flavor.hex,
              });
            }
          }}
        >
          Adicionar os três
        </Button>
      </div>
      <div className="mt-6 grid gap-4 sm:grid-cols-3">{chosen.map((product) => <ProductCard key={product.slug} product={product} />)}</div>
    </div>
  );
}

export function ScratchView() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const user = useCurrentUser();
  const hydrated = usePulso((state) => state.hydrated);
  const scratch = usePulso((state) => state.scratch);
  const save = usePulso((state) => state.saveScratch);
  const applyCoupon = usePulso((state) => state.applyCoupon);
  const addPoints = usePulso((state) => state.addPoints);
  const key = user?.id ?? "guest";
  const today = saoPauloDateKey();
  const saved = scratch[key];
  const already = saved?.date === today;
  const prize = useMemo(() => scratchPrize(`${key}-${today}`), [key, today]);
  const [revealed, setRevealed] = useState(false);

  function paint() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    canvas.width = canvas.offsetWidth * 2;
    canvas.height = canvas.offsetHeight * 2;
    context.scale(2, 2);
    context.fillStyle = "#d6ff3c";
    context.fillRect(0, 0, canvas.offsetWidth, canvas.offsetHeight);
    context.fillStyle = "#101402";
    context.font = "700 28px sans-serif";
    context.fillText("RASPA AQUI", 24, canvas.offsetHeight / 2);
  }

  function scratchAt(event: React.PointerEvent<HTMLCanvasElement>) {
    if (already) return;
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const rect = canvas.getBoundingClientRect();
    context.globalCompositeOperation = "destination-out";
    context.beginPath();
    context.arc(event.clientX - rect.left, event.clientY - rect.top, 18, 0, Math.PI * 2);
    context.fill();
    const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let clear = 0;
    for (let index = 3; index < data.length; index += 16) if (data[index] === 0) clear += 1;
    if (clear / (data.length / 16) > 0.45) finish();
  }

  function finish() {
    if (revealed || already) return;
    setRevealed(true);
    save({ date: today, prizeId: prize.id, prizeLabel: prize.label, couponCode: prize.couponCode, points: prize.points });
    if (prize.points && user) addPoints(prize.points, "Raspadinha");
  }

  const show = already || revealed;
  const current = already && saved ? saved : prize;

  return (
    <div className="mx-auto max-w-xl px-4 py-10">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-pink">Uma por dia</p>
      <h1 className="font-display text-7xl leading-[0.85]">Raspadinha</h1>
      <p className="mt-3 text-muted-foreground">Horário de Brasília. O prêmio fica neste navegador. {user ? "Pontos caem na sua conta." : "Entra na conta se vier pontos."}</p>
      <div className="relative mt-6 h-48 overflow-hidden rounded-[1.6rem] border border-white/10 bg-pink">
        <div className="flex h-full flex-col items-center justify-center text-center text-white">
          <p className="font-display text-6xl leading-none">{show ? ("label" in current ? current.label : current.prizeLabel) : "???"}</p>
          {show && "detail" in prize && !already ? <p className="mt-2 px-6 text-sm">{prize.detail}</p> : null}
          {show && already ? <p className="mt-2 text-sm">Você já raspou hoje. Volta amanhã.</p> : null}
        </div>
        {!already && hydrated ? (
          <canvas
            ref={(node) => {
              canvasRef.current = node;
              if (node && node.dataset.ready !== "1") {
                node.dataset.ready = "1";
                paint();
              }
            }}
            className="absolute inset-0 h-full w-full touch-none"
            onPointerDown={scratchAt}
            onPointerMove={(event) => { if (event.buttons === 1) scratchAt(event); }}
            aria-label="Raspe a área para revelar o prêmio"
          />
        ) : null}
      </div>
      {show && prize.couponCode && !already ? <Button className="mt-4 rounded-full" onClick={() => applyCoupon(prize.couponCode!)}>Aplicar {prize.couponCode}</Button> : null}
      {show && saved?.couponCode && already ? <Button className="mt-4 rounded-full" onClick={() => applyCoupon(saved.couponCode!)}>Aplicar {saved.couponCode}</Button> : null}
      {!already && hydrated ? <Button variant="outline" className="mt-4 rounded-full" onClick={finish}>Revelar sem raspar</Button> : null}
      {!user ? <p className="mt-4 text-sm"><Link href="/criar-conta" className="text-lime">Cria a conta</Link> pra guardar ponto de raspadinha.</p> : null}
    </div>
  );
}
