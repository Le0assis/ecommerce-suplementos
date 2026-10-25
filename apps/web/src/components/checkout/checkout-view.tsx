"use client";

import { Pack } from "@/components/brand/pack";
import { SupplementNotice } from "@/components/product/supplement-notice";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { siteConfig } from "@/lib/config";
import { pointsUnavailableMessage, readServerQuote, serverCheckoutActive, serverCheckoutPayload, type ServerQuoteSummary } from "@/lib/checkout-quote";
import { buildSimulatedPayment, makeOrderCode, quoteFromCart, selectHydratedCart, useCurrentUser, usePulso } from "@/lib/store";
import type { OrderRecord, SavedAddress } from "@/lib/types";
import {
  UF_LIST,
  etaLabel,
  formatBRL,
  formatCep,
  formatCpf,
  formatPhone,
  freeShippingProgress,
  levelFor,
  lookupCep,
  resolveShippingCents,
  shippingRates,
  validateCheckout,
  type CheckoutInput,
  type PaymentMethod,
  type ShippingMethod,
} from "@pulso/domain";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const steps = ["Contato", "Entrega", "Pagamento", "Revisão"];

export function CheckoutView() {
  const cart = usePulso(selectHydratedCart);
  const hydrated = usePulso((state) => state.hydrated);
  const couponCode = usePulso((state) => state.couponCode);
  const applyCoupon = usePulso((state) => state.applyCoupon);
  const user = useCurrentUser();
  const placeOrder = usePulso((state) => state.placeOrder);
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [couponInput, setCouponInput] = useState("");
  const [couponError, setCouponError] = useState<string | null>(null);
  const [pointsMessage, setPointsMessage] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [shippingMethod, setShippingMethod] = useState<ShippingMethod>("pac");
  const [payment, setPayment] = useState<PaymentMethod>("pix");
  const [installments, setInstallments] = useState(1);
  const [serverSummary, setServerSummary] = useState<ServerQuoteSummary | null>(null);
  const [form, setForm] = useState({
    name: user?.name ?? "",
    email: user?.email ?? "",
    cpf: user?.cpf ?? "",
    phone: user?.phone ?? "",
    cep: user?.addresses[0]?.cep ?? "",
    street: user?.addresses[0]?.street ?? "",
    number: user?.addresses[0]?.number ?? "",
    complement: user?.addresses[0]?.complement ?? "",
    neighborhood: user?.addresses[0]?.neighborhood ?? "",
    city: user?.addresses[0]?.city ?? "",
    state: user?.addresses[0]?.state ?? "SP",
    cardNumber: "",
    cardName: "",
    cardExpiry: "",
    cardCvv: "",
    acceptAge: false,
    acceptTerms: false,
    acceptLgpd: false,
  });

  const rates = shippingRates(form.cep);
  const pac = rates.ok ? rates.rates[0]!.priceCents : 0;
  const sedex = rates.ok ? rates.rates[1]!.priceCents : 0;
  const quote = quoteFromCart({
    cart,
    couponCode,
    redeemPoints: 0,
    pointsBalance: 0,
    lifetimePoints: user?.pointsLifetime ?? 0,
    payment,
    shippingMethod,
    pacCents: pac,
    sedexCents: sedex,
    pixDiscountPercent: siteConfig.pixDiscountPercent,
    freeShippingBaseCents: siteConfig.freeShippingCents,
  });
  const progress = freeShippingProgress(quote.merchandiseCents, quote.thresholdCents);
  const plan = quote.installments.find((item) => item.n === installments) ?? quote.installments[0];
  const chargedTotal = serverSummary?.totalCents ?? quote.totalCents;

  useEffect(() => {
    if (!serverCheckoutActive()) return;
    let cancelled = false;
    async function load() {
      const body = serverCheckoutPayload({ lines: cart, couponCode });
      try {
        const response = await fetch("/api/checkout/quote", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        const json = (await response.json().catch(() => null)) as unknown;
        if (cancelled) return;
        const unavailable = pointsUnavailableMessage(json, response.status);
        setPointsMessage(unavailable);
        setServerSummary(unavailable || !response.ok ? null : readServerQuote(json));
      } catch {
        if (!cancelled) setServerSummary(null);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [cart, couponCode]);

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function fillCep(value: string) {
    const found = lookupCep(value);
    setForm((current) => ({
      ...current,
      cep: formatCep(value),
      ...(found.ok
        ? {
            street: found.address.street,
            neighborhood: found.address.neighborhood,
            city: found.address.city,
            state: found.address.state,
          }
        : {}),
    }));
  }

  function payload(): CheckoutInput {
    return {
      name: form.name,
      email: form.email,
      cpf: form.cpf,
      phone: form.phone,
      cep: form.cep,
      street: form.street,
      number: form.number,
      complement: form.complement,
      neighborhood: form.neighborhood,
      city: form.city,
      state: form.state,
      shippingMethod,
      paymentMethod: payment,
      card: payment === "card" ? {
        number: form.cardNumber,
        name: form.cardName,
        expiry: form.cardExpiry,
        cvv: form.cardCvv,
        installments,
      } : undefined,
      acceptAge: form.acceptAge,
      acceptTerms: form.acceptTerms,
      acceptLgpd: form.acceptLgpd,
    };
  }

  function confirm() {
    const validated = validateCheckout(payload());
    if (!validated.ok) {
      setErrors(validated.errors);
      setStep(validated.errors.cardNumber || validated.errors.acceptAge ? 3 : 1);
      return;
    }
    if (!rates.ok) {
      setErrors({ cep: rates.error });
      setStep(1);
      return;
    }
    const charged = serverSummary?.totalCents != null
      ? {
          ...quote,
          totalCents: serverSummary.totalCents,
          discountCents: serverSummary.discountCents,
          discountLabel: serverSummary.discountLabel,
          pointsCents: 0,
          pointsUsed: 0,
          pointsEarned: serverSummary.pointsEarned,
          pixCents: serverSummary.pixCents,
          ...(serverSummary.merchandiseCents != null ? { merchandiseCents: serverSummary.merchandiseCents } : {}),
          ...(serverSummary.shippingCents != null ? { shippingCents: serverSummary.shippingCents, shippingFree: serverSummary.shippingCents === 0 } : {}),
        }
      : quote;
    const code = makeOrderCode();
    const address: SavedAddress = {
      id: `addr-${code}`,
      label: "Entrega",
      cep: form.cep.replace(/\D/g, ""),
      street: form.street,
      number: form.number,
      complement: form.complement,
      neighborhood: form.neighborhood,
      city: form.city,
      state: form.state,
    };
    const approved = payment === "card";
    const order: OrderRecord = {
      id: `ord-${code}`,
      code,
      createdAt: new Date().toISOString(),
      email: form.email,
      cpf: form.cpf,
      status: approved ? "pago" : "pagamento_pendente",
      pointsCredited: approved,
      payment: buildSimulatedPayment({
        method: payment,
        code,
        totalCents: charged.totalCents,
        installments,
        installmentAmountCents: plan?.amountCents,
        cardLast4: form.cardNumber.replace(/\D/g, "").slice(-4),
      }),
      shipping: {
        method: shippingMethod,
        priceCents: charged.shippingCents,
        etaLabel: etaLabel((shippingMethod === "pac" ? rates.rates[0] : rates.rates[1])!.etaBusinessDays),
        address,
      },
      lines: cart,
      quote: charged,
      timeline: [{ status: approved ? "pago" : "pagamento_pendente", label: approved ? "Cartão aprovado na simulação" : "Aguardando pagamento simulado", at: new Date().toISOString() }],
    };
    placeOrder(order);
    router.push(`/pedido/confirmado?codigo=${code}`);
  }

  if (!hydrated) return <p className="px-4 py-16 text-center">Abrindo o checkout…</p>;
  if (!cart.length) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center">
        <h1 className="font-display text-6xl">Sacola vazia</h1>
        <Button className="mt-6 rounded-full" asChild><Link href="/loja">Voltar pra loja</Link></Button>
      </div>
    );
  }

  return (
    <div className="mx-auto grid max-w-6xl gap-8 px-4 py-8 lg:grid-cols-[1.2fr_.8fr]">
      <div>
        <SupplementNotice />
        <ol className="mt-4 flex gap-2 text-[11px] font-bold uppercase tracking-[0.14em]">
          {steps.map((label, index) => (
            <li key={label}><button type="button" onClick={() => setStep(index)} className={index === step ? "text-lime" : "text-muted-foreground"}>{index + 1} {label}</button></li>
          ))}
        </ol>
        <h1 className="mt-3 font-display text-6xl leading-none">Checkout</h1>
        {step === 0 ? (
          <div className="mt-6 grid gap-4">
            <Field label="Nome" error={errors.name}><Input value={form.name} onChange={(event) => set("name", event.target.value)} /></Field>
            <Field label="E-mail" error={errors.email}><Input type="email" value={form.email} onChange={(event) => set("email", event.target.value)} /></Field>
            <Field label="CPF" error={errors.cpf}><Input inputMode="numeric" value={form.cpf} onChange={(event) => set("cpf", formatCpf(event.target.value))} /></Field>
            <Field label="Celular" error={errors.phone}><Input inputMode="numeric" value={form.phone} onChange={(event) => set("phone", formatPhone(event.target.value))} /></Field>
            <Button className="rounded-full" onClick={() => setStep(1)}>Continuar pra entrega</Button>
          </div>
        ) : null}
        {step === 1 ? (
          <div className="mt-6 grid gap-4">
            <Field label="CEP" error={errors.cep}>
              <Input inputMode="numeric" value={form.cep} onChange={(event) => fillCep(event.target.value)} placeholder="01310-100" />
            </Field>
            <p className="text-xs text-muted-foreground">Endereço de demonstração. Em produção isso consulta o ViaCEP. Experimenta 01310-100.</p>
            <Field label="Rua" error={errors.street}><Input value={form.street} onChange={(event) => set("street", event.target.value)} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Número" error={errors.number}><Input value={form.number} onChange={(event) => set("number", event.target.value)} /></Field>
              <Field label="Complemento"><Input value={form.complement} onChange={(event) => set("complement", event.target.value)} /></Field>
            </div>
            <Field label="Bairro" error={errors.neighborhood}><Input value={form.neighborhood} onChange={(event) => set("neighborhood", event.target.value)} /></Field>
            <div className="grid grid-cols-[1fr_6rem] gap-3">
              <Field label="Cidade" error={errors.city}><Input value={form.city} onChange={(event) => set("city", event.target.value)} /></Field>
              <Field label="UF" error={errors.state}>
                <select value={form.state} onChange={(event) => set("state", event.target.value)} className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm">
                  {UF_LIST.map((uf) => <option key={uf}>{uf}</option>)}
                </select>
              </Field>
            </div>
            {rates.ok ? (
              <fieldset className="space-y-2">
                <legend className="text-sm font-semibold">Frete</legend>
                {rates.rates.map((rate) => {
                  const resolved = resolveShippingCents({
                    method: rate.id,
                    pacCents: pac,
                    sedexCents: sedex,
                    merchandiseCents: quote.merchandiseCents,
                    levelId: user ? levelFor(user.pointsLifetime).id : "rookie",
                    freeShippingBaseCents: siteConfig.freeShippingCents,
                    shippingCoupon: couponCode === "RASPAFRETE",
                  });
                  return (
                    <label key={rate.id} className="flex items-center justify-between rounded-2xl border border-white/10 p-3">
                      <span><input type="radio" name="frete" checked={shippingMethod === rate.id} onChange={() => setShippingMethod(rate.id)} className="mr-2 accent-lime" />{rate.label} · {etaLabel(rate.etaBusinessDays)}</span>
                      <span>{resolved.free ? "Grátis" : formatBRL(resolved.cents)}</span>
                    </label>
                  );
                })}
              </fieldset>
            ) : <p className="text-sm text-pink">{rates.error}</p>}
            <p className="text-xs text-muted-foreground">{progress.reached ? "PAC grátis neste pedido." : `Faltam ${formatBRL(progress.remainingCents)} para o PAC grátis.`}</p>
            <Button className="rounded-full" onClick={() => setStep(2)}>Ir pro pagamento</Button>
          </div>
        ) : null}
        {step === 2 ? (
          <div className="mt-6 space-y-4">
            <div className="grid grid-cols-3 gap-2">
              {(["pix", "boleto", "card"] as const).map((method) => (
                <button key={method} type="button" onClick={() => setPayment(method)} className={`rounded-2xl border p-3 text-sm font-bold uppercase tracking-[0.12em] ${payment === method ? "border-lime bg-lime text-primary-foreground" : "border-white/10"}`}>
                  {method === "pix" ? `Pix -${siteConfig.pixDiscountPercent}%` : method === "boleto" ? "Boleto" : "Cartão"}
                </button>
              ))}
            </div>
            {payment === "card" ? (
              <div className="grid gap-3">
                <Field label="Número" error={errors.cardNumber}><Input value={form.cardNumber} onChange={(event) => set("cardNumber", event.target.value)} placeholder="4242 4242 4242 4242" /></Field>
                <Field label="Nome impresso" error={errors.cardName}><Input value={form.cardName} onChange={(event) => set("cardName", event.target.value)} /></Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Validade" error={errors.cardExpiry}><Input value={form.cardExpiry} onChange={(event) => set("cardExpiry", event.target.value)} placeholder="12/30" /></Field>
                  <Field label="CVV" error={errors.cardCvv}><Input value={form.cardCvv} onChange={(event) => set("cardCvv", event.target.value)} /></Field>
                </div>
                <Field label="Parcelas" error={errors.installments}>
                  <select value={installments} onChange={(event) => setInstallments(Number(event.target.value))} className="h-11 w-full rounded-full border border-white/15 bg-background px-4 text-sm">
                    {quote.installments.map((item) => (
                      <option key={item.n} value={item.n}>{item.n}x de {formatBRL(item.amountCents)} {item.interestFree ? "sem juros" : `total ${formatBRL(item.totalCents)}`}</option>
                    ))}
                  </select>
                </Field>
                <p className="text-xs text-muted-foreground">Cartão de teste 4242 4242 4242 4242. Nada é cobrado. Até 3x sem juros, depois 1,99% ao mês na simulação.</p>
              </div>
            ) : null}
            {payment === "pix" ? <p className="text-sm text-muted-foreground">O QR do próximo passo é ilustrativo. O desconto de {siteConfig.pixDiscountPercent}% já entrou no total.</p> : null}
            {payment === "boleto" ? <p className="text-sm text-muted-foreground">Boleto simulado, vence em 3 dias neste protótipo. Sem desconto de pix.</p> : null}
            <Button className="rounded-full" onClick={() => setStep(3)}>Revisar pedido</Button>
          </div>
        ) : null}
        {step === 3 ? (
          <div className="mt-6 space-y-4">
            <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={form.acceptAge} onChange={(event) => set("acceptAge", event.target.checked)} className="mt-1 accent-lime" />Tenho 18 anos ou mais.</label>
            {errors.acceptAge ? <p className="text-sm text-pink">{errors.acceptAge}</p> : null}
            <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={form.acceptTerms} onChange={(event) => set("acceptTerms", event.target.checked)} className="mt-1 accent-lime" />Li as regras de entrega e troca deste protótipo.</label>
            {errors.acceptTerms ? <p className="text-sm text-pink">{errors.acceptTerms}</p> : null}
            <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={form.acceptLgpd} onChange={(event) => set("acceptLgpd", event.target.checked)} className="mt-1 accent-lime" />Autorizo o uso dos dados deste pedido, como descreve a página de privacidade.</label>
            {errors.acceptLgpd ? <p className="text-sm text-pink">{errors.acceptLgpd}</p> : null}
            <Button className="h-14 w-full rounded-full uppercase tracking-[0.16em]" onClick={confirm}>Fechar pedido de {formatBRL(chargedTotal)}</Button>
          </div>
        ) : null}
      </div>
      <aside className="h-fit rounded-[1.6rem] border border-white/10 bg-black/50 p-4">
        <h2 className="font-display text-4xl">Resumo</h2>
        <ul className="mt-3 space-y-3" data-quote={serverSummary ? "servidor" : "navegador"}>
          {serverSummary
            ? serverSummary.lines.map((line) => (
              <li key={`${line.slug}-${line.variant}`} className="text-sm">
                <p className="font-semibold">{line.name}</p>
                <p className="text-muted-foreground">{line.qty}x{line.lineCents != null ? ` · ${formatBRL(line.lineCents)}` : ""}</p>
              </li>
            ))
            : cart.map((line) => (
              <li key={line.lineId} className="flex gap-3">
                <div className="w-12"><Pack line={line.name} flavor={line.flavorName} hex={line.hex} /></div>
                <div className="text-sm"><p className="font-semibold">{line.name}</p><p className="text-muted-foreground">{line.flavorName} · {line.quantity}x</p></div>
              </li>
            ))}
        </ul>
        <div className="mt-4 flex gap-2">
          <Input value={couponInput} onChange={(event) => setCouponInput(event.target.value)} placeholder="Cupom" aria-label="Cupom" />
          <Button type="button" variant="outline" onClick={() => setCouponError(applyCoupon(couponInput))}>Aplicar</Button>
        </div>
        {couponError ? <p className="mt-2 text-sm text-pink">{couponError}</p> : null}
        {couponCode ? <p className="mt-2 text-sm text-lime">Cupom {couponCode}</p> : null}
        {pointsMessage ? <p className="mt-3 text-sm text-muted-foreground" role="status">{pointsMessage}</p> : null}
        <dl className="mt-4 space-y-1 text-sm">
          {serverSummary ? (
            <>
              {serverSummary.merchandiseCents != null ? <Row label="Produtos" value={formatBRL(serverSummary.merchandiseCents)} /> : null}
              {serverSummary.discountCents ? <Row label={serverSummary.discountLabel ?? "Desconto"} value={`- ${formatBRL(serverSummary.discountCents)}`} /> : null}
              {serverSummary.pixCents ? <Row label="Pix" value={`- ${formatBRL(serverSummary.pixCents)}`} /> : null}
              <Row label="Frete" value={serverSummary.shippingCents == null ? (quote.shippingFree ? "Grátis" : formatBRL(quote.shippingCents)) : serverSummary.shippingCents === 0 ? "Grátis" : formatBRL(serverSummary.shippingCents)} />
              <Row label="Total" value={formatBRL(chargedTotal)} strong />
              <Row label="Pontos deste pedido" value={`+${serverSummary.pointsEarned}`} />
            </>
          ) : (
            <>
              <Row label="Produtos" value={formatBRL(quote.grossCents)} />
              {quote.subscriptionSavingsCents ? <Row label="Assinatura" value={`- ${formatBRL(quote.subscriptionSavingsCents)}`} /> : null}
              {quote.discountCents ? <Row label={quote.discountLabel ?? "Desconto"} value={`- ${formatBRL(quote.discountCents)}`} /> : null}
              {quote.pixCents ? <Row label="Pix" value={`- ${formatBRL(quote.pixCents)}`} /> : null}
              <Row label="Frete" value={quote.shippingFree ? "Grátis" : formatBRL(quote.shippingCents)} />
              <Row label="Total" value={formatBRL(quote.totalCents)} strong />
              <Row label="Pontos deste pedido" value={`+${quote.pointsEarned}`} />
            </>
          )}
        </dl>
      </aside>
    </div>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="text-xs uppercase tracking-[0.14em] text-muted-foreground">{label}</Label>
      <div className="mt-1">{children}</div>
      {error ? <p className="mt-1 text-sm text-pink">{error}</p> : null}
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between ${strong ? "pt-2 font-display text-3xl" : ""}`}>
      <dt>{label}</dt><dd>{value}</dd>
    </div>
  );
}
