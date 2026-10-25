export function SupplementNotice({ className = "" }: { className?: string }) {
  return (
    <aside className={`rounded-2xl border border-white/10 bg-white/5 p-3 text-sm text-muted-foreground ${className}`} aria-label="Informações do produto">
      <p>Este produto não é medicamento.</p>
      <p>Consulte um nutricionista ou médico.</p>
      <p>Venda só para maiores de 18 anos.</p>
    </aside>
  );
}
