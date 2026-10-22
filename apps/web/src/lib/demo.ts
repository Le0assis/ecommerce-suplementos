import { quoteCart } from "@pulso/domain";
import type { AccountUser, OrderRecord, SavedAddress } from "./types";

const quote = quoteCart({
  lines: [
    {
      unitPriceCents: 37990,
      quantity: 1,
      subscription: false,
      subscriptionDiscountPercent: 10,
      category: "kit",
    },
  ],
  coupon: null,
  redeemPoints: 0,
  pointsBalance: 0,
  lifetimePoints: 0,
  payment: "card",
  shippingMethod: "pac",
  pacCents: 1890,
  sedexCents: 3290,
});

export const demoAddress: SavedAddress = {
  id: "addr-ana",
  label: "Casa",
  cep: "01310100",
  street: "Avenida Paulista",
  number: "1000",
  complement: "apto 12",
  neighborhood: "Bela Vista",
  city: "São Paulo",
  state: "SP",
};

export const demoOrder: OrderRecord = {
  id: "ord-ana-kit",
  code: "PLDEMOANA",
  createdAt: "2026-09-28T15:04:00-03:00",
  email: "ana@pulso.dev",
  cpf: "52998224725",
  status: "enviado",
  pointsCredited: true,
  payment: {
    method: "card",
    status: "aprovado",
    cardBrand: "visa",
    cardLast4: "4242",
    installments: 3,
    installmentAmountCents: Math.round(quote.totalCents / 3),
  },
  shipping: {
    method: "pac",
    priceCents: 0,
    etaLabel: "2 a 4 dias úteis",
    trackingCode: "PL123456789BR",
    address: demoAddress,
  },
  lines: [
    {
      lineId: "line-ana-kit",
      productSlug: "kit-bruto",
      variantId: "kit-bruto__limao-choco__mes",
      name: "Kit Bruto",
      flavorName: "Limão + Chocolate + Neutro",
      size: "Kit mês",
      unitPriceCents: 37990,
      quantity: 1,
      subscription: false,
      subscriptionDiscountPercent: 10,
      category: "kit",
      hex: "#d6ff3c",
    },
  ],
  quote: { ...quote, pointsEarned: quote.pointsEarned },
  timeline: [
    { status: "pago", label: "Pagamento aprovado", at: "2026-09-28T15:04:00-03:00" },
    { status: "separando", label: "Separando na bancada", at: "2026-09-29T11:10:00-03:00" },
    { status: "enviado", label: "Entregue aos Correios", at: "2026-09-30T18:40:00-03:00" },
  ],
};

const lifetime = 100 + quote.pointsEarned;

export const demoUser: AccountUser = {
  id: "user-ana",
  name: "Ana Luz",
  email: "ana@pulso.dev",
  password: "pulso123",
  cpf: "52998224725",
  phone: "11987654321",
  pointsBalance: 860,
  pointsLifetime: lifetime,
  marketingOptIn: true,
  createdAt: "2026-08-01T10:00:00-03:00",
  addresses: [demoAddress],
  orders: [demoOrder],
  subscriptions: [
    {
      id: "sub-ana-shape",
      productSlug: "shape-whey-isolado",
      variantId: "shape-whey-isolado__chocolate__900",
      name: "Shape",
      flavorName: "Chocolate Meia-Noite",
      size: "900 g · 30 doses",
      quantity: 1,
      unitPriceCents: 18990,
      everyDays: 30,
      nextDate: "2026-11-20",
      status: "ativa",
      hex: "#6b3a22",
    },
  ],
  pointsHistory: [
    { id: "ph-1", at: "2026-08-01", label: "Boas-vindas", delta: 100 },
    { id: "ph-2", at: "2026-09-28", label: "Pedido PLDEMOANA", delta: quote.pointsEarned },
    { id: "ph-3", at: "2026-10-02", label: "Resgate no checkout", delta: -(lifetime - 860) },
  ],
};
