"use client";

import { Pack } from "@/components/brand/pack";
import { ProductCard } from "@/components/product/product-card";
import { useStoreData } from "@/components/store-data";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { siteConfig } from "@/lib/config";
import { useCurrentUser, usePulso, useWishlist } from "@/lib/store";
import type { SavedAddress } from "@/lib/types";
import { formatBRL, formatCep, levelFor, nextLevel, parseBRLToCents, referralCodeFrom, REFERRED_POINTS, REFERRER_POINTS } from "@pulso/domain";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const login = usePulso((state) => state.login);
  const register = usePulso((state) => state.register);
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", email: mode === "login" ? "ana@pulso.dev" : "", password: mode === "login" ? "pulso123" : "", marketing: false, referral: "" });

  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <h1 className="font-display text-7xl leading-none">{mode === "login" ? "Entra" : "Cria a conta"}</h1>
      <p className="mt-2 text-sm text-muted-foreground">Protótipo: a senha fica neste navegador, sem servidor. Conta demo ana@pulso.dev / pulso123.</p>
      <form
        className="mt-6 space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          const message = mode === "login"
            ? login(form.email, form.password)
            : register({ name: form.name, email: form.email, password: form.password, marketingOptIn: form.marketing, referralCode: form.referral });
          setError(message);
          if (!message) router.push("/conta");
        }}
      >
        {mode === "register" ? <Input aria-label="Nome" placeholder="Nome" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /> : null}
        <Input aria-label="E-mail" type="email" placeholder="E-mail" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required />
        <Input aria-label="Senha" type="password" placeholder="Senha" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} required />
        {mode === "register" ? <Input aria-label="Código de indicação" placeholder="Código de quem te chamou (opcional)" value={form.referral} onChange={(event) => setForm({ ...form, referral: event.target.value })} /> : null}
        {mode === "register" ? <label className="flex gap-2 text-sm"><input type="checkbox" checked={form.marketing} onChange={(event) => setForm({ ...form, marketing: event.target.checked })} className="accent-lime" />Quero novidade de drop por e-mail (fica só neste aparelho).</label> : null}
        {error ? <p className="text-sm text-pink">{error}</p> : null}
        <Button className="w-full rounded-full" type="submit">{mode === "login" ? "Entrar" : "Criar e ganhar 100 pontos"}</Button>
      </form>
      <p className="mt-4 text-sm">{mode === "login" ? <Link href="/criar-conta" className="text-lime">Não tenho conta</Link> : <Link href="/entrar" className="text-lime">Já tenho conta</Link>}</p>
    </div>
  );
}

function Gate({ children }: { children: React.ReactNode }) {
  const hydrated = usePulso((state) => state.hydrated);
  const user = useCurrentUser();
  if (!hydrated) return <p className="px-4 py-16">Carregando sua conta…</p>;
  if (!user) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <h1 className="font-display text-6xl">Entra pra ver isso</h1>
        <Button className="mt-4 rounded-full" asChild><Link href="/entrar">Entrar</Link></Button>
      </div>
    );
  }
  return <>{children}</>;
}

export function AccountHome() {
  const user = useCurrentUser();
  const logout = usePulso((state) => state.logout);
  return (
    <Gate>
      {user ? (
        <div className="mx-auto max-w-4xl px-4 py-10">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-lime">{levelFor(user.pointsLifetime).name}</p>
          <h1 className="font-display text-7xl leading-none">E aí, {user.name.split(" ")[0]}</h1>
          <LevelBar lifetime={user.pointsLifetime} balance={user.pointsBalance} />
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <NavCard href="/conta/pedidos" title="Pedidos" text={`${user.orders.length} na conta`} />
            <NavCard href="/conta/pontos" title="Pontos" text={`${user.pointsBalance} pra usar`} />
            <NavCard href="/conta/assinaturas" title="Assinaturas" text={`${user.subscriptions.length} recorrência(s)`} />
            <NavCard href="/conta/enderecos" title="Endereços" text={`${user.addresses.length} salvos`} />
            <NavCard href="/conta/indicar" title="Indicar" text="150 pontos quando a pessoa compra" />
          </div>
          <Button variant="outline" className="mt-6 rounded-full" onClick={logout}>Sair</Button>
        </div>
      ) : null}
    </Gate>
  );
}

function LevelBar({ lifetime, balance }: { lifetime: number; balance: number }) {
  const level = levelFor(lifetime);
  const upcoming = nextLevel(lifetime);
  const span = upcoming ? upcoming.level.minPoints - level.minPoints : 1;
  const ratio = upcoming ? Math.min(1, (lifetime - level.minPoints) / span) : 1;
  return (
    <div className="mt-4">
      <div className="h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full bg-lime" style={{ width: `${ratio * 100}%` }} /></div>
      <p className="mt-2 text-sm text-muted-foreground">{balance} pontos de saldo · {lifetime} na vida toda. {upcoming ? `Faltam ${upcoming.missing} pro nível ${upcoming.level.name}.` : "Você é Lenda."}</p>
      <ul className="mt-2 text-sm text-muted-foreground">{level.perks.map((perk) => <li key={perk}>· {perk}</li>)}</ul>
    </div>
  );
}

function NavCard({ href, title, text }: { href: string; title: string; text: string }) {
  return <Link href={href} className="rounded-[1.4rem] border border-white/10 p-4 hover:border-lime"><p className="font-display text-4xl leading-none">{title}</p><p className="text-sm text-muted-foreground">{text}</p></Link>;
}

export function ReferralView() {
  const user = useCurrentUser();
  return (
    <Gate>
      {user ? (
        <div className="mx-auto max-w-xl px-4 py-10">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-lime">Indica a crew</p>
          <h1 className="font-display text-7xl leading-none">{user.referralCode ?? referralCodeFrom(user.name, user.id)}</h1>
          <p className="mt-3 text-sm text-muted-foreground">Quem cria a conta com esse código e paga o primeiro pedido ganha {REFERRED_POINTS} pontos. Você ganha {REFERRER_POINTS} nesse momento. Uma vez por pessoa. O código da Ana é {referralCodeFrom("Ana Luz", "user-ana")}.</p>
        </div>
      ) : null}
    </Gate>
  );
}

export function OrdersView() {
  const user = useCurrentUser();
  const advance = usePulso((state) => state.advanceOrder);
  const cancel = usePulso((state) => state.cancelOrder);
  return (
    <Gate>
      <div className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="font-display text-6xl">Pedidos</h1>
        <ul className="mt-6 space-y-4">
          {user?.orders.map((order) => (
            <li key={order.id} className="rounded-[1.4rem] border border-white/10 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-display text-3xl">{order.code}</p>
                <p className="text-sm uppercase tracking-[0.14em] text-lime">{order.status.replaceAll("_", " ")}</p>
              </div>
              <p className="text-sm text-muted-foreground">{formatBRL(order.quote.totalCents)} · {order.payment.method}</p>
              {order.shipping.trackingCode ? <p className="text-sm">Rastreio {order.shipping.trackingCode}</p> : null}
              <ol className="mt-3 space-y-1 text-sm text-muted-foreground">
                {order.timeline.map((event) => <li key={`${event.status}-${event.at}`}>{event.label}</li>)}
              </ol>
              <div className="mt-3 flex gap-2">
                {order.status !== "entregue" && order.status !== "cancelado" ? <Button size="sm" variant="outline" onClick={() => advance(order.code)}>Avançar status (demo)</Button> : null}
                {order.status === "pagamento_pendente" ? <Button size="sm" variant="ghost" onClick={() => cancel(order.code)}>Cancelar</Button> : null}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </Gate>
  );
}

export function PointsView() {
  const user = useCurrentUser();
  return (
    <Gate>
      {user ? (
        <div className="mx-auto max-w-3xl px-4 py-10">
          <h1 className="font-display text-6xl">Pontos</h1>
          <p className="mt-2 text-muted-foreground">100 pontos = R$ 1. Dá pra usar até 20% do pedido. Pix rende 20% de pontos a mais.</p>
          <LevelBar lifetime={user.pointsLifetime} balance={user.pointsBalance} />
          <ul className="mt-6 space-y-2">
            {user.pointsHistory.map((event) => (
              <li key={event.id} className="flex justify-between border-b border-white/10 py-2 text-sm">
                <span>{event.label}</span><span className={event.delta > 0 ? "text-lime" : "text-pink"}>{event.delta > 0 ? "+" : ""}{event.delta}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Gate>
  );
}

export function AddressView() {
  const user = useCurrentUser();
  const save = usePulso((state) => state.saveAddress);
  const remove = usePulso((state) => state.removeAddress);
  const [draft, setDraft] = useState<SavedAddress>({ id: "", label: "Casa", cep: "", street: "", number: "", neighborhood: "", city: "", state: "SP" });
  return (
    <Gate>
      <div className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="font-display text-6xl">Endereços</h1>
        <ul className="mt-4 space-y-3">
          {user?.addresses.map((address) => (
            <li key={address.id} className="rounded-2xl border border-white/10 p-3 text-sm">
              <p className="font-semibold">{address.label}</p>
              <p>{address.street}, {address.number} · {address.city}/{address.state}</p>
              <p>{formatCep(address.cep)}</p>
              <button type="button" className="mt-2 text-pink" onClick={() => remove(address.id)}>Remover</button>
            </li>
          ))}
        </ul>
        <form className="mt-6 grid gap-2" onSubmit={(event) => { event.preventDefault(); save({ ...draft, id: draft.id || `addr-${Date.now()}` }); }}>
          <Input aria-label="Apelido" placeholder="Casa, treino..." value={draft.label} onChange={(event) => setDraft({ ...draft, label: event.target.value })} />
          <Input aria-label="CEP" placeholder="CEP" value={draft.cep} onChange={(event) => setDraft({ ...draft, cep: event.target.value })} />
          <Input aria-label="Rua" placeholder="Rua" value={draft.street} onChange={(event) => setDraft({ ...draft, street: event.target.value })} />
          <Input aria-label="Número" placeholder="Número" value={draft.number} onChange={(event) => setDraft({ ...draft, number: event.target.value })} />
          <Input aria-label="Bairro" placeholder="Bairro" value={draft.neighborhood} onChange={(event) => setDraft({ ...draft, neighborhood: event.target.value })} />
          <Input aria-label="Cidade" placeholder="Cidade" value={draft.city} onChange={(event) => setDraft({ ...draft, city: event.target.value })} />
          <Button className="rounded-full" type="submit">Salvar endereço</Button>
        </form>
      </div>
    </Gate>
  );
}

export function SubscriptionsView() {
  const user = useCurrentUser();
  const setStatus = usePulso((state) => state.setSubscriptionStatus);
  return (
    <Gate>
      <div className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="font-display text-6xl">Assinaturas</h1>
        <ul className="mt-4 space-y-3">
          {user?.subscriptions.length === 0 ? <li className="text-muted-foreground">Nenhuma recorrência. No produto, marca “assina e economiza”.</li> : null}
          {user?.subscriptions.map((item) => (
            <li key={item.id} className="flex gap-3 rounded-2xl border border-white/10 p-3">
              <div className="w-16"><Pack line={item.name} flavor={item.flavorName} hex={item.hex} /></div>
              <div>
                <p className="font-display text-3xl leading-none">{item.name}</p>
                <p className="text-sm text-muted-foreground">{item.flavorName} · a cada {item.everyDays} dias · {item.status}</p>
                <p className="text-sm">Próxima: {item.nextDate} · {formatBRL(item.unitPriceCents)}</p>
                <div className="mt-2 flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => setStatus(item.id, item.status === "pausada" ? "ativa" : "pausada")}>{item.status === "pausada" ? "Retomar" : "Pausar"}</Button>
                  <Button size="sm" variant="ghost" onClick={() => setStatus(item.id, "cancelada")}>Cancelar</Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </Gate>
  );
}

export function WishlistView() {
  const { products } = useStoreData();
  const ids = useWishlist();
  const hydrated = usePulso((state) => state.hydrated);
  const saved = products.filter((product) => ids.includes(product.slug));
  if (!hydrated) return <p className="px-4 py-10">Carregando favoritos…</p>;
  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="font-display text-6xl">Favoritos</h1>
      {saved.length === 0 ? <p className="mt-4 text-muted-foreground">Nenhum pote salvo. O coração no card guarda neste aparelho.</p> : null}
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{saved.map((product) => <ProductCard key={product.slug} product={product} />)}</div>
    </div>
  );
}

export function OrderResult() {
  const params = useSearchParams();
  const code = params.get("codigo") ?? "";
  const users = usePulso((state) => state.users);
  const guest = usePulso((state) => state.guestOrders);
  const hydrated = usePulso((state) => state.hydrated);
  const order = [...users.flatMap((user) => user.orders), ...guest].find((item) => item.code === code);
  if (!hydrated) return <p className="px-4 py-10">Buscando pedido…</p>;
  if (!order) return <div className="px-4 py-10"><h1 className="font-display text-5xl">Pedido não está neste navegador</h1><Button className="mt-4" asChild><Link href="/rastreio">Rastrear</Link></Button></div>;
  return (
    <div className="mx-auto max-w-xl px-4 py-10">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-lime">Pedido {order.code}</p>
      <h1 className="font-display text-6xl leading-none">{order.status === "pagamento_pendente" ? "Falta o pagamento simulado" : "Tá pago na simulação"}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{order.payment.sandboxMessage ?? "Nenhum valor foi cobrado. Sandbox Mercado Pago / Pagar.me."}</p>
      {order.payment.externalId ? <p className="mt-1 text-xs text-muted-foreground">Cobrança {order.payment.externalId}</p> : null}
      {order.payment.pixPayload ? <CopyBlock title="Pix copia e cola (demo)" value={order.payment.pixPayload} /> : null}
      {order.payment.boletoLine ? <CopyBlock title="Linha digitável (demo)" value={order.payment.boletoLine} /> : null}
      <p className="mt-4 font-display text-4xl">{formatBRL(order.quote.totalCents)}</p>
      <Button className="mt-4 rounded-full" asChild><Link href="/conta/pedidos">Acompanhar</Link></Button>
    </div>
  );
}

function CopyBlock({ title, value }: { title: string; value: string }) {
  return (
    <div className="mt-4 rounded-2xl border border-white/10 p-3">
      <p className="text-xs uppercase tracking-[0.14em] text-lime">{title}</p>
      <p className="mt-2 break-all text-xs">{value}</p>
      <Button size="sm" variant="outline" className="mt-2" onClick={() => void navigator.clipboard?.writeText(value)}>Copiar</Button>
    </div>
  );
}

export function TrackingView() {
  const [code, setCode] = useState("PL123456789BR");
  const users = usePulso((state) => state.users);
  const guest = usePulso((state) => state.guestOrders);
  const orders = [...users.flatMap((user) => user.orders), ...guest];
  const found = orders.find((order) => order.code === code || order.shipping.trackingCode === code);
  return (
    <div className="mx-auto max-w-xl px-4 py-10">
      <h1 className="font-display text-6xl">Rastreio</h1>
      <form className="mt-4 flex gap-2" onSubmit={(event) => event.preventDefault()}>
        <Input aria-label="Código" value={code} onChange={(event) => setCode(event.target.value.trim())} />
        <Button type="submit">Buscar</Button>
      </form>
      <p className="mt-2 text-xs text-muted-foreground">Demo da Ana: PL123456789BR ou PLDEMOANA.</p>
      {found ? (
        <div className="mt-4 rounded-2xl border border-white/10 p-4">
          <p className="font-display text-4xl">{found.status.replaceAll("_", " ")}</p>
          <p className="text-sm text-muted-foreground">{found.shipping.address.city}/{found.shipping.address.state} · {found.shipping.method.toUpperCase()}</p>
          <ol className="mt-3 space-y-1 text-sm">{found.timeline.map((event) => <li key={`${event.at}${event.status}`}>{event.label}</li>)}</ol>
        </div>
      ) : <p className="mt-4 text-sm text-muted-foreground">Não achei esse código nos pedidos deste navegador.</p>}
    </div>
  );
}

export function AdminView() {
  const { allProducts } = useStoreData();
  const savePatch = usePulso((state) => state.savePatch);
  const orders = usePulso((state) => state.users.flatMap((user) => user.orders));
  const [password, setPassword] = useState("");
  const [ok, setOk] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!ok) {
    return (
      <form className="mx-auto max-w-md space-y-3 px-4 py-12" onSubmit={(event) => { event.preventDefault(); if (password === siteConfig.adminPassword) setOk(true); else setError("Senha do protótipo não confere."); }}>
        <h1 className="font-display text-6xl">Admin</h1>
        <p className="text-sm text-muted-foreground">CMS local. A senha padrão está no .env (NEXT_PUBLIC_ADMIN_PASSWORD) e não protege um servidor.</p>
        <Input type="password" aria-label="Senha do admin" value={password} onChange={(event) => setPassword(event.target.value)} />
        {error ? <p className="text-sm text-pink">{error}</p> : null}
        <Button type="submit" className="rounded-full">Entrar</Button>
      </form>
    );
  }
  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="font-display text-6xl">Catálogo local</h1>
      <p className="text-sm text-muted-foreground">Preço e ocultar valem só neste navegador, por cima do mock. {orders.length} pedidos nesta sessão.</p>
      <div className="mt-4 overflow-auto">
        <table className="w-full min-w-[40rem] text-left text-sm">
          <thead><tr className="text-xs uppercase tracking-[0.14em] text-muted-foreground"><th className="py-2">Produto</th><th>Preço base</th><th>Nome</th><th>Visível</th></tr></thead>
          <tbody>
            {allProducts.map((product) => (
              <tr key={product.slug} className="border-t border-white/10">
                <td className="py-3 font-display text-2xl">{product.line}</td>
                <td>
                  <Input
                    aria-label={`Preço de ${product.name}`}
                    defaultValue={(Math.min(...product.variants.map((variant) => variant.priceCents)) / 100).toFixed(2).replace(".", ",")}
                    onBlur={(event) => {
                      const cents = parseBRLToCents(event.target.value);
                      if (cents) savePatch(product.slug, { priceCents: cents });
                    }}
                  />
                </td>
                <td><Input aria-label={`Nome de ${product.name}`} defaultValue={product.name} onBlur={(event) => savePatch(product.slug, { name: event.target.value })} /></td>
                <td><input type="checkbox" aria-label={`Visível ${product.name}`} defaultChecked={!product.hidden} onChange={(event) => savePatch(product.slug, { hidden: !event.target.checked })} className="accent-lime" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
