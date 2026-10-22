import { CatalogRoute } from "@/components/catalog/catalog-view";
import { GOALS } from "@pulso/domain";
import { notFound } from "next/navigation";
import { Suspense } from "react";

export function generateStaticParams() {
  return GOALS.map((goal) => ({ goal: goal.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ goal: string }> }) {
  const { goal } = await params;
  const found = GOALS.find((item) => item.id === goal);
  return { title: found?.label ?? "Objetivo", description: found?.blurb };
}

export default async function GoalPage({ params }: { params: Promise<{ goal: string }> }) {
  const { goal } = await params;
  const found = GOALS.find((item) => item.id === goal);
  if (!found) notFound();
  return (
    <Suspense fallback={<p className="px-4 py-10">Separando o objetivo…</p>}>
      <CatalogRoute lockedGoal={found.id} />
    </Suspense>
  );
}
