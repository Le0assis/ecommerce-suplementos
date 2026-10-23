"use client";

import { ProductCard } from "@/components/product/product-card";
import { useStoreData } from "@/components/store-data";
import { filterProducts, sortProducts, type CatalogProduct, type ProductSort } from "@pulso/data";
import { CATEGORIES, GOALS } from "@pulso/domain";
import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

const families = [
  { id: "", label: "Todos os sabores" },
  { id: "citrica", label: "Cítrico" },
  { id: "doce", label: "Doce" },
  { id: "fruta", label: "Fruta" },
  { id: "chocolate", label: "Chocolate" },
  { id: "neutro", label: "Neutro" },
];

export function CatalogRoute({ products, lockedGoal, lockedCategory }: { products?: CatalogProduct[]; lockedGoal?: string; lockedCategory?: string }) {
  const params = useSearchParams();
  return (
    <CatalogView
      products={products}
      initialGoal={lockedGoal ?? params.get("objetivo") ?? ""}
      initialCategory={lockedCategory ?? params.get("categoria") ?? ""}
      initialQuery={params.get("q") ?? ""}
    />
  );
}

export function CatalogView({
  products: listed,
  initialGoal = "",
  initialCategory = "",
  initialQuery = "",
  title = "Loja",
  lede = "Filtra por objetivo, categoria e família de sabor. O preço menor de cada pote aparece no card.",
}: {
  products?: CatalogProduct[];
  initialGoal?: string;
  initialCategory?: string;
  initialQuery?: string;
  title?: string;
  lede?: string;
}) {
  const store = useStoreData();
  const products = listed !== undefined ? listed : store.products;
  const [goal, setGoal] = useState(initialGoal);
  const [category, setCategory] = useState(initialCategory);
  const [family, setFamily] = useState("");
  const [sort, setSort] = useState<ProductSort>("relevance");
  const [query, setQuery] = useState(initialQuery);
  const visible = useMemo(
    () => sortProducts(filterProducts(products, { goal: goal || undefined, category: category || undefined, family: family || undefined, q: query }), sort),
    [products, goal, category, family, query, sort],
  );

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-lime">Catálogo</p>
      <h1 className="font-display text-7xl leading-[0.85]">{title}</h1>
      <p className="mt-3 max-w-2xl text-muted-foreground">{lede}</p>
      <div className="mt-6 grid gap-3 md:grid-cols-4">
        <label className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Busca
          <input value={query} onChange={(event) => setQuery(event.target.value)} className="mt-1 h-11 w-full rounded-full border border-white/15 bg-transparent px-4 text-sm text-foreground" />
        </label>
        <Select label="Objetivo" value={goal} onChange={setGoal} options={[{ id: "", label: "Todos" }, ...GOALS.map((item) => ({ id: item.id, label: item.label }))]} />
        <Select label="Categoria" value={category} onChange={setCategory} options={[{ id: "", label: "Todas" }, ...CATEGORIES.map((item) => ({ id: item.id, label: item.label }))]} />
        <Select label="Ordem" value={sort} onChange={(value) => setSort(value as ProductSort)} options={[{ id: "relevance", label: "Destaques" }, { id: "price-asc", label: "Menor preço" }, { id: "price-desc", label: "Maior preço" }, { id: "rating", label: "Avaliação" }]} />
      </div>
      <div className="mt-4 flex gap-2 overflow-auto pb-2">
        {families.map((item) => (
          <button key={item.id || "all"} type="button" onClick={() => setFamily(item.id)} className={`shrink-0 rounded-full border px-4 py-2 text-sm ${family === item.id ? "border-lime bg-lime text-primary-foreground" : "border-white/15"}`}>
            {item.label}
          </button>
        ))}
      </div>
      <p className="mt-4 text-sm text-muted-foreground">{visible.length} produto{visible.length === 1 ? "" : "s"}</p>
      {visible.length === 0 ? <p className="mt-8 text-lg">Nada com esse filtro. Tira um e tenta de novo.</p> : null}
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((product) => <ProductCard key={product.slug} product={product} />)}
      </div>
    </div>
  );
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: { id: string; label: string }[] }) {
  return (
    <label className="text-xs uppercase tracking-[0.14em] text-muted-foreground">{label}
      <select value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 h-11 w-full rounded-full border border-white/15 bg-background px-4 text-sm text-foreground">
        {options.map((option) => <option key={option.id || label} value={option.id}>{option.label}</option>)}
      </select>
    </label>
  );
}
