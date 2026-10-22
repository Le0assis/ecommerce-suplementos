import type { PaymentGateway, PaymentMethod, Quote, ShippingMethod } from "@pulso/domain";

export interface CartLine {
  lineId: string;
  productSlug: string;
  variantId: string;
  name: string;
  flavorName: string;
  size: string;
  unitPriceCents: number;
  quantity: number;
  subscription: boolean;
  subscriptionDiscountPercent: number;
  category: string;
  hex: string;
}

export interface SavedAddress {
  id: string;
  label: string;
  cep: string;
  street: string;
  number: string;
  complement?: string;
  neighborhood: string;
  city: string;
  state: string;
}

export interface OrderRecord {
  id: string;
  code: string;
  createdAt: string;
  email: string;
  cpf: string;
  status: "pagamento_pendente" | "pago" | "separando" | "enviado" | "entregue" | "cancelado";
  pointsCredited: boolean;
  payment: {
    method: PaymentMethod;
    status: "pendente" | "aprovado" | "recusado";
    pixPayload?: string;
    boletoLine?: string;
    cardBrand?: string;
    cardLast4?: string;
    installments?: number;
    installmentAmountCents?: number;
    gateway?: PaymentGateway;
    externalId?: string;
    sandboxMessage?: string;
  };
  shipping: {
    method: ShippingMethod;
    priceCents: number;
    etaLabel: string;
    trackingCode?: string;
    address: SavedAddress;
  };
  lines: CartLine[];
  quote: Quote;
  timeline: { status: string; label: string; at: string }[];
}

export interface SubscriptionRecord {
  id: string;
  productSlug: string;
  variantId: string;
  name: string;
  flavorName: string;
  size: string;
  quantity: number;
  unitPriceCents: number;
  everyDays: number;
  nextDate: string;
  status: "ativa" | "pausada" | "cancelada";
  hex: string;
}

export interface PointsEvent {
  id: string;
  at: string;
  label: string;
  delta: number;
}

export interface AccountUser {
  id: string;
  name: string;
  email: string;
  password: string;
  cpf: string;
  phone: string;
  pointsBalance: number;
  pointsLifetime: number;
  marketingOptIn: boolean;
  createdAt: string;
  addresses: SavedAddress[];
  orders: OrderRecord[];
  subscriptions: SubscriptionRecord[];
  pointsHistory: PointsEvent[];
}

export interface ScratchRecord {
  date: string;
  prizeId: string;
  prizeLabel: string;
  couponCode?: string;
  points?: number;
}
