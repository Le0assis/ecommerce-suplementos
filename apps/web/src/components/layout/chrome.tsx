"use client";

import { Logo } from "@/components/brand/logo";
import { useStoreData } from "@/components/store-data";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { siteConfig } from "@/lib/config";
import { selectHydratedCart, useCurrentUser, usePulso } from "@/lib/store";
import { formatBRL, freeShippingProgress } from "@pulso/domain";
import { Heart, Home, Menu, Search, ShoppingBag, Sparkles, User, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Pack } from "@/components/brand/pack";

const links = [
  { href: "/loja", label: "Loja" },
  { href: "/drops", label: "Drops" },
  { href: "/atletas", label: "Atletas" },
  { href: "/quiz", label: "Quiz" },
  { href: "/blog", label: "Blog" },
];

export function AnnouncementBar() {
  return (
    <div className="bg-lime text-primary-foreground">
      <p className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-4 gap-y-1 px-4 py-2 text-center text-[11px] font-bold uppercase tracking-[0.16em]">
        <span>Pix {siteConfig.pixDiscountPercent}% off em tudo</span>
        <span className="hidden sm:inline">·</span>
        <span>Frete grátis a partir de {formatBRL(siteConfig.freeShippingCents)}</span>
        <span className="hidden sm:inline">·</span>
        <Link href="/raspadinha" className="underline decoration-2 underline-offset-2">Raspadinha do dia</Link>
      </p>
    </div>
  );
}

export function SiteHeader() {
  const pathname = usePathname();
  const cartCount = usePulso((state) => state.hydrated ? state.cart.reduce((sum, line) => sum + line.quantity, 0) : 0);
  const setCartOpen = usePulso((state) => state.setCartOpen);
  const user = useCurrentUser();
  const hydrated = usePulso((state) => state.hydrated);
  const [menu, setMenu] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-background/85 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4">
        <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setMenu(true)} aria-label="Abrir menu">
          <Menu />
        </Button>
        <Link href="/" aria-label="PULSO, início"><Logo /></Link>
        <nav className="ml-4 hidden items-center gap-1 md:flex" aria-label="Principal">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`rounded-full px-3 py-2 text-sm font-semibold uppercase tracking-[0.12em] ${pathname.startsWith(link.href) ? "bg-lime text-primary-foreground" : "text-foreground/80 hover:bg-white/5"}`}
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="icon" aria-label="Buscar" onClick={() => setSearchOpen(true)}><Search /></Button>
          <Button variant="ghost" size="icon" asChild className="hidden sm:inline-flex" aria-label="Favoritos">
            <Link href="/favoritos"><Heart /></Link>
          </Button>
          <Button variant="ghost" size="icon" asChild aria-label={hydrated && user ? `Conta de ${user.name}` : "Entrar"}>
            <Link href={hydrated && user ? "/conta" : "/entrar"}><User /></Link>
          </Button>
          <Button variant="ghost" size="icon" className="relative" aria-label={`Sacola com ${cartCount} itens`} onClick={() => setCartOpen(true)}>
            <ShoppingBag />
            {cartCount > 0 ? <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-lime px-1 text-[10px] font-bold text-primary-foreground">{cartCount}</span> : null}
          </Button>
        </div>
      </div>
      <Sheet open={menu} onOpenChange={setMenu}>
        <SheetContent side="left" className="bg-background text-foreground">
          <SheetHeader><SheetTitle className="font-display text-5xl">Menu</SheetTitle></SheetHeader>
          <div className="mt-6 flex flex-col gap-2">
            {links.map((link) => (
              <Link key={link.href} href={link.href} onClick={() => setMenu(false)} className="font-display text-5xl leading-none">{link.label}</Link>
            ))}
            <Link href="/calculadora" onClick={() => setMenu(false)} className="font-display text-5xl leading-none">Calculadora</Link>
            <Link href="/kits" onClick={() => setMenu(false)} className="font-display text-5xl leading-none">Kits</Link>
          </div>
          <Socials className="mt-8" />
        </SheetContent>
      </Sheet>
      <SearchDialog open={searchOpen} onOpenChange={setSearchOpen} />
    </header>
  );
}

export function Socials({ className = "" }: { className?: string }) {
  return (
    <div className={`flex gap-3 text-sm font-semibold uppercase tracking-[0.14em] ${className}`}>
      {siteConfig.socials.map((social) => (
        <a key={social.label} href={social.href} target="_blank" rel="noreferrer" className="text-foreground/80 hover:text-lime">{social.label}</a>
      ))}
    </div>
  );
}

function SearchDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { products } = useStoreData();
  const [query, setQuery] = useState("");
  const router = useRouter();
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return products.slice(0, 5);
    return products.filter((product) => `${product.name} ${product.line} ${product.flavors.map((flavor) => flavor.name).join(" ")}`.toLowerCase().includes(q)).slice(0, 6);
  }, [products, query]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="top" className="bg-background text-foreground">
        <SheetHeader>
          <SheetTitle className="font-display text-4xl">Busca</SheetTitle>
        </SheetHeader>
        <form
          className="mt-4 flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            onOpenChange(false);
            router.push(query.trim() ? `/busca?q=${encodeURIComponent(query.trim())}` : "/loja");
          }}
        >
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Caos, creatina, limão..." aria-label="Buscar produto" autoFocus />
          <Button type="submit">Buscar</Button>
        </form>
        <ul className="mt-4 grid gap-2 sm:grid-cols-2">
          {results.map((product) => (
            <li key={product.slug}>
              <Link href={`/loja/${product.slug}`} onClick={() => onOpenChange(false)} className="flex items-center gap-3 rounded-2xl border border-white/10 p-2 hover:border-lime">
                <div className="w-12"><Pack line={product.line} flavor={product.flavors[0]?.name ?? product.name} hex={product.flavors[0]?.hex ?? "#d6ff3c"} /></div>
                <span>
                  <span className="block font-display text-2xl leading-none">{product.name}</span>
                  <span className="text-xs uppercase tracking-[0.14em] text-muted-foreground">{product.line}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </SheetContent>
    </Sheet>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-white/10 bg-black">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <Logo />
          <p className="mt-3 max-w-xs text-sm text-muted-foreground">Suplemento com cara de collab. Feito pro treino de quem vive de série, story e pix. Marca fictícia do Gustavo.</p>
          <Socials className="mt-4" />
        </div>
        <FooterCol title="Loja" links={[["/loja", "Catálogo"], ["/drops", "Drops"], ["/kits", "Montar kit"], ["/quiz", "Quiz de objetivo"], ["/calculadora", "Proteína e creatina"]]} />
        <FooterCol title="Conta" links={[["/conta", "Meu pulso"], ["/conta/pedidos", "Pedidos"], ["/conta/pontos", "Pontos"], ["/favoritos", "Favoritos"], ["/rastreio", "Rastreio"]]} />
        <FooterCol title="Casa" links={[["/sobre", "Sobre"], ["/blog", "Treino e rótulo"], ["/conteudo", "CMS"], ["/ajuda", "Ajuda"], ["/entrega", "Entrega e CEP"], ["/trocas", "Trocas"], ["/privacidade", "Privacidade"], ["/rotulos", "Rótulos e ANVISA"]]} />
      </div>
      <p className="border-t border-white/10 px-4 py-4 text-center text-xs text-muted-foreground">Suplemento alimentar não é medicamento. Protótipo com dados fictícios · © 2026 PULSO</p>
    </footer>
  );
}

function FooterCol({ title, links }: { title: string; links: [string, string][] }) {
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-lime">{title}</p>
      <ul className="mt-3 space-y-2 text-sm">
        {links.map(([href, label]) => (
          <li key={href}><Link href={href} className="text-foreground/80 hover:text-lime">{label}</Link></li>
        ))}
      </ul>
    </div>
  );
}

export function BottomNav() {
  const pathname = usePathname();
  const setCartOpen = usePulso((state) => state.setCartOpen);
  const count = usePulso((state) => (state.hydrated ? state.cart.reduce((sum, line) => sum + line.quantity, 0) : 0));
  if (pathname.startsWith("/checkout")) return null;
  const items = [
    { href: "/", label: "Início", icon: Home },
    { href: "/loja", label: "Loja", icon: Sparkles },
    { href: "/quiz", label: "Quiz", icon: Sparkles },
  ];
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-background/95 backdrop-blur md:hidden" aria-label="Atalhos">
      <ul className="grid grid-cols-5">
        {items.slice(0, 2).map((item) => (
          <li key={item.href}>
            <Link href={item.href} className={`flex flex-col items-center py-2 text-[10px] font-bold uppercase tracking-[0.12em] ${pathname === item.href ? "text-lime" : "text-muted-foreground"}`}>
              <item.icon className="size-4" />
              {item.label}
            </Link>
          </li>
        ))}
        <li>
          <Link href="/quiz" className={`flex flex-col items-center py-2 text-[10px] font-bold uppercase tracking-[0.12em] ${pathname === "/quiz" ? "text-lime" : "text-muted-foreground"}`}>Quiz</Link>
        </li>
        <li>
          <button type="button" onClick={() => setCartOpen(true)} className="flex w-full flex-col items-center py-2 text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
            Sacola{count ? ` ${count}` : ""}
          </button>
        </li>
        <li>
          <Link href="/conta" className="flex flex-col items-center py-2 text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Conta</Link>
        </li>
      </ul>
    </nav>
  );
}

export function CookieBanner() {
  const accepted = usePulso((state) => state.hydrated && state.lgpdAccepted);
  const hydrated = usePulso((state) => state.hydrated);
  const accept = usePulso((state) => state.acceptLgpd);
  if (!hydrated || accepted) return null;
  return (
    <div className="fixed inset-x-3 bottom-20 z-50 rounded-3xl border border-white/10 bg-surface p-4 shadow-2xl md:bottom-4 md:left-auto md:right-4 md:max-w-sm">
      <p className="text-sm">A gente guarda sacola, conta e raspadinha neste navegador. Sem anúncio de terceiro neste protótipo.</p>
      <div className="mt-3 flex gap-2">
        <Button onClick={accept}>Pode salvar</Button>
        <Button variant="outline" asChild><Link href="/privacidade">Ler</Link></Button>
      </div>
    </div>
  );
}

export function Toaster() {
  const toasts = usePulso((state) => state.toasts);
  const dismiss = usePulso((state) => state.dismissToast);
  return (
    <div className="pointer-events-none fixed right-3 top-20 z-[70] flex w-[min(100%-1.5rem,22rem)] flex-col gap-2">
      {toasts.map((toast) => (
        <button key={toast.id} type="button" onClick={() => dismiss(toast.id)} className="pointer-events-auto rounded-2xl bg-lime px-4 py-3 text-left text-sm font-semibold text-primary-foreground shadow-lg">
          {toast.message}
        </button>
      ))}
    </div>
  );
}

export function CartDrawer() {
  const open = usePulso((state) => state.cartOpen);
  const setOpen = usePulso((state) => state.setCartOpen);
  const cart = usePulso(selectHydratedCart);
  const setQuantity = usePulso((state) => state.setQuantity);
  const removeLine = usePulso((state) => state.removeLine);
  const merchandise = cart.reduce((sum, line) => sum + line.unitPriceCents * line.quantity, 0);
  const progress = freeShippingProgress(merchandise, siteConfig.freeShippingCents);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent className="flex w-full flex-col bg-background text-foreground sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="font-display text-5xl">Sacola</SheetTitle>
        </SheetHeader>
        <div className="mt-4">
          <div className="h-2 overflow-hidden rounded-full bg-white/10">
            <div className="h-full bg-lime" style={{ width: `${progress.ratio * 100}%` }} />
          </div>
          <p className="mt-2 text-xs uppercase tracking-[0.14em] text-muted-foreground">
            {progress.reached ? "Frete PAC liberado." : `Faltam ${formatBRL(progress.remainingCents)} pro frete grátis.`}
          </p>
        </div>
        <ul className="mt-4 flex-1 space-y-3 overflow-auto">
          {cart.length === 0 ? <li className="text-sm text-muted-foreground">Sacola vazia. O Caos está te esperando.</li> : null}
          {cart.map((line) => (
            <li key={line.lineId} className="flex gap-3 rounded-2xl border border-white/10 p-2">
              <div className="w-14 shrink-0"><Pack line={line.name} flavor={line.flavorName} hex={line.hex} /></div>
              <div className="min-w-0 flex-1">
                <p className="font-display text-2xl leading-none">{line.name}</p>
                <p className="truncate text-xs text-muted-foreground">{line.flavorName} · {line.size}</p>
                <div className="mt-2 flex items-center gap-2">
                  <button type="button" className="grid size-7 place-items-center rounded-full border border-white/15" onClick={() => setQuantity(line.lineId, line.quantity - 1)} aria-label="Diminuir">-</button>
                  <span className="text-sm">{line.quantity}</span>
                  <button type="button" className="grid size-7 place-items-center rounded-full border border-white/15" onClick={() => setQuantity(line.lineId, line.quantity + 1)} aria-label="Aumentar">+</button>
                  <button type="button" className="ml-auto text-xs uppercase tracking-[0.14em] text-pink" onClick={() => removeLine(line.lineId)}>Tirar</button>
                </div>
              </div>
            </li>
          ))}
        </ul>
        <div className="mt-4 space-y-2">
          <Button className="h-12 w-full rounded-full uppercase tracking-[0.14em]" asChild onClick={() => setOpen(false)}>
            <Link href="/checkout">Bora pro checkout</Link>
          </Button>
          <Button variant="outline" className="w-full rounded-full" asChild onClick={() => setOpen(false)}>
            <Link href="/carrinho">Ver sacola</Link>
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function EmptyState({ title, text, href, action }: { title: string; text: string; href: string; action: string }) {
  return (
    <div className="rounded-[1.8rem] border border-dashed border-white/15 p-8 text-center">
      <X className="mx-auto size-5 text-lime" aria-hidden="true" />
      <h2 className="mt-3 font-display text-5xl">{title}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">{text}</p>
      <Button className="mt-5 rounded-full" asChild><Link href={href}>{action}</Link></Button>
    </div>
  );
}
