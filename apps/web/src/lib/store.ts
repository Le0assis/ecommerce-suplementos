"use client";

import { coupons } from "@pulso/data";
import {
  findCoupon,
  applyReferralReward,
  matchReferral,
  orderCode,
  quoteCart,
  referralCodeFrom,
  sandboxCharge,
  WELCOME_POINTS,
  type CatalogPatch,
  type PaymentMethod,
  type ShippingMethod,
} from "@pulso/domain";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { demoUser } from "./demo";
import type { AccountUser, CartLine, OrderRecord, SavedAddress, ScratchRecord, SubscriptionRecord } from "./types";

interface Toast {
  id: string;
  message: string;
}

interface PulsoState {
  hydrated: boolean;
  users: AccountUser[];
  currentUserId: string | null;
  cart: CartLine[];
  cartOpen: boolean;
  couponCode: string | null;
  wishlist: Record<string, string[]>;
  guestOrders: OrderRecord[];
  patches: Record<string, CatalogPatch>;
  scratch: Record<string, ScratchRecord>;
  lgpdAccepted: boolean;
  newsletter: string[];
  toasts: Toast[];
  setHydrated: (value: boolean) => void;
  toast: (message: string) => void;
  dismissToast: (id: string) => void;
  setCartOpen: (open: boolean) => void;
  addToCart: (line: Omit<CartLine, "lineId" | "quantity"> & { quantity?: number }) => void;
  setQuantity: (lineId: string, quantity: number) => void;
  removeLine: (lineId: string) => void;
  clearCart: () => void;
  applyCoupon: (code: string) => string | null;
  clearCoupon: () => void;
  toggleWishlist: (slug: string) => void;
  register: (input: { name: string; email: string; password: string; marketingOptIn: boolean; referralCode?: string }) => string | null;
  login: (email: string, password: string) => string | null;
  logout: () => void;
  saveAddress: (address: SavedAddress) => void;
  removeAddress: (id: string) => void;
  placeOrder: (order: OrderRecord) => void;
  advanceOrder: (code: string) => void;
  cancelOrder: (code: string) => void;
  setSubscriptionStatus: (id: string, status: SubscriptionRecord["status"]) => void;
  savePatch: (slug: string, patch: CatalogPatch) => void;
  acceptLgpd: () => void;
  saveScratch: (record: ScratchRecord) => void;
  addPoints: (delta: number, label: string) => void;
  joinNewsletter: (email: string) => void;
}

function uid(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

function wishlistKey(userId: string | null): string {
  return userId ?? "guest";
}

function withUser(users: AccountUser[], id: string | null, update: (user: AccountUser) => AccountUser): AccountUser[] {
  if (!id) return users;
  return users.map((user) => (user.id === id ? update(user) : user));
}

function rewardReferral(users: AccountUser[], buyerId: string, at: string): AccountUser[] {
  const next = applyReferralReward(users, buyerId);
  if (next === users) return users;
  return next.map((user) => {
    const previous = users.find((item) => item.id === user.id);
    if (!previous || previous.pointsBalance === user.pointsBalance) return user;
    const delta = user.pointsBalance - previous.pointsBalance;
    return {
      ...user,
      pointsHistory: [
        { id: uid("ph"), at, label: user.id === buyerId ? "Bônus de indicação" : "Indicação convertida", delta },
        ...user.pointsHistory,
      ],
    };
  });
}

function ensureDemo(users: AccountUser[]): AccountUser[] {
  if (users.some((user) => user.email === demoUser.email)) return users;
  return [demoUser, ...users];
}

export const usePulso = create<PulsoState>()(
  persist(
    (set, get) => ({
      hydrated: false,
      users: [demoUser],
      currentUserId: null,
      cart: [],
      cartOpen: false,
      couponCode: null,
      wishlist: { guest: [] },
      guestOrders: [],
      patches: {},
      scratch: {},
      lgpdAccepted: false,
      newsletter: [],
      toasts: [],
      setHydrated: (hydrated) => set({ hydrated }),
      toast: (message) => set((state) => ({ toasts: [...state.toasts, { id: uid("toast"), message }] })),
      dismissToast: (id) => set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) })),
      setCartOpen: (cartOpen) => set({ cartOpen }),
      addToCart: (line) => {
        const quantity = line.quantity ?? 1;
        set((state) => {
          const existing = state.cart.find(
            (item) => item.variantId === line.variantId && item.subscription === line.subscription,
          );
          const cart = existing
            ? state.cart.map((item) =>
                item.lineId === existing.lineId ? { ...item, quantity: item.quantity + quantity } : item,
              )
            : [...state.cart, { ...line, quantity, lineId: uid("line") }];
          return { cart, cartOpen: true };
        });
        get().toast("Entrou na sacola.");
      },
      setQuantity: (lineId, quantity) =>
        set((state) => ({
          cart: state.cart
            .map((item) => (item.lineId === lineId ? { ...item, quantity } : item))
            .filter((item) => item.quantity > 0),
        })),
      removeLine: (lineId) => set((state) => ({ cart: state.cart.filter((item) => item.lineId !== lineId) })),
      clearCart: () => set({ cart: [], couponCode: null }),
      applyCoupon: (code) => {
        const found = findCoupon(code, coupons);
        if (!found.coupon) return found.error ?? "Cupom inválido.";
        set({ couponCode: found.coupon.code });
        get().toast(`Cupom ${found.coupon.code} aplicado.`);
        return null;
      },
      clearCoupon: () => set({ couponCode: null }),
      toggleWishlist: (slug) =>
        set((state) => {
          const key = wishlistKey(state.currentUserId);
          const current = state.wishlist[key] ?? [];
          const next = current.includes(slug) ? current.filter((item) => item !== slug) : [...current, slug];
          return { wishlist: { ...state.wishlist, [key]: next } };
        }),
      register: ({ name, email, password, marketingOptIn, referralCode }) => {
        const normalized = email.trim().toLowerCase();
        if (get().users.some((user) => user.email === normalized)) return "Esse e-mail já tem conta.";
        if (password.length < 6) return "Senha com pelo menos 6 caracteres.";
        const id = uid("user");
        let referredBy: string | undefined;
        if (referralCode?.trim()) {
          const match = matchReferral(
            referralCode,
            get().users.map((user) => ({ code: user.referralCode ?? referralCodeFrom(user.name, user.id), userId: user.id })),
            id,
          );
          if ("error" in match) return match.error;
          referredBy = match.referrerId;
        }
        const user: AccountUser = {
          id,
          name: name.trim(),
          email: normalized,
          password,
          cpf: "",
          phone: "",
          pointsBalance: WELCOME_POINTS,
          pointsLifetime: WELCOME_POINTS,
          marketingOptIn,
          createdAt: new Date().toISOString(),
          addresses: [],
          orders: [],
          subscriptions: [],
          pointsHistory: [{ id: uid("ph"), at: new Date().toISOString(), label: "Boas-vindas", delta: WELCOME_POINTS }],
          referralCode: referralCodeFrom(name, id),
          referredBy,
          referralRewarded: false,
        };
        set((state) => ({ users: [...state.users, user], currentUserId: user.id }));
        get().toast(`Conta criada. +${WELCOME_POINTS} pontos.`);
        return null;
      },
      login: (email, password) => {
        const user = get().users.find((item) => item.email === email.trim().toLowerCase() && item.password === password);
        if (!user) return "E-mail ou senha não batem.";
        set((state) => {
          const guest = state.wishlist.guest ?? [];
          const own = state.wishlist[user.id] ?? [];
          return {
            currentUserId: user.id,
            wishlist: { ...state.wishlist, [user.id]: [...new Set([...own, ...guest])], guest: [] },
          };
        });
        get().toast(`E aí, ${user.name.split(" ")[0]}.`);
        return null;
      },
      logout: () => set({ currentUserId: null }),
      saveAddress: (address) =>
        set((state) => ({
          users: withUser(state.users, state.currentUserId, (user) => ({
            ...user,
            addresses: user.addresses.some((item) => item.id === address.id)
              ? user.addresses.map((item) => (item.id === address.id ? address : item))
              : [...user.addresses, address],
          })),
        })),
      removeAddress: (id) =>
        set((state) => ({
          users: withUser(state.users, state.currentUserId, (user) => ({
            ...user,
            addresses: user.addresses.filter((item) => item.id !== id),
          })),
        })),
      placeOrder: (order) =>
        set((state) => {
          const user = state.users.find((item) => item.id === state.currentUserId);
          const subscriptions = order.lines
            .filter((line) => line.subscription)
            .map((line) => ({
              id: uid("sub"),
              productSlug: line.productSlug,
              variantId: line.variantId,
              name: line.name,
              flavorName: line.flavorName,
              size: line.size,
              quantity: line.quantity,
              unitPriceCents: line.unitPriceCents,
              everyDays: 30,
              nextDate: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
              status: "ativa" as const,
              hex: line.hex,
            }));
          const credit = order.pointsCredited ? order.quote.pointsEarned : 0;
          const spent = order.quote.pointsUsed;
          if (!user) return { guestOrders: [order, ...state.guestOrders], cart: [], couponCode: null };
          let users = withUser(state.users, user.id, (current) => ({
              ...current,
              cpf: order.cpf || current.cpf,
              orders: [order, ...current.orders],
              subscriptions: [...subscriptions, ...current.subscriptions],
              addresses: current.addresses.some((item) => item.cep === order.shipping.address.cep && item.number === order.shipping.address.number)
                ? current.addresses
                : [order.shipping.address, ...current.addresses],
              pointsBalance: current.pointsBalance - spent + credit,
              pointsLifetime: current.pointsLifetime + credit,
              pointsHistory: [
                ...(spent ? [{ id: uid("ph"), at: order.createdAt, label: `Resgate no ${order.code}`, delta: -spent }] : []),
                ...(credit ? [{ id: uid("ph"), at: order.createdAt, label: `Pedido ${order.code}`, delta: credit }] : []),
                ...current.pointsHistory,
              ],
            }));
          if (order.pointsCredited) users = rewardReferral(users, user.id, order.createdAt);
          return { cart: [], couponCode: null, users };
        }),
      advanceOrder: (code) =>
        set((state) => {
          const flow = ["pagamento_pendente", "pago", "separando", "enviado", "entregue"] as const;
          const bump = (order: OrderRecord): OrderRecord => {
            if (order.code !== code || order.status === "cancelado" || order.status === "entregue") return order;
            const index = flow.indexOf(order.status as (typeof flow)[number]);
            const next = flow[Math.min(flow.length - 1, index + 1)]!;
            const shouldCredit = !order.pointsCredited && next !== "pagamento_pendente";
            return {
              ...order,
              status: next,
              pointsCredited: order.pointsCredited || shouldCredit,
              payment: {
                ...order.payment,
                status: next === "pagamento_pendente" ? "pendente" : "aprovado",
              },
              shipping: {
                ...order.shipping,
                trackingCode: next === "enviado" || next === "entregue" ? order.shipping.trackingCode ?? `${order.code}BR` : order.shipping.trackingCode,
              },
              timeline: [
                ...order.timeline,
                {
                  status: next,
                  label: next === "pago" ? "Pagamento confirmado" : next === "separando" ? "Separando na bancada" : next === "enviado" ? "Postado" : "Entregue",
                  at: new Date().toISOString(),
                },
              ],
              quote: order.quote,
            };
          };
          const before = findOrder(state, code);
          const users = state.users.map((user) => ({ ...user, orders: user.orders.map(bump) }));
          const guestOrders = state.guestOrders.map(bump);
          const after = findOrder({ ...state, users, guestOrders }, code);
          let nextUsers = users;
          if (before && after && !before.pointsCredited && after.pointsCredited && state.currentUserId) {
            nextUsers = rewardReferral(
              withUser(users, state.currentUserId, (user) => ({
                ...user,
                pointsBalance: user.pointsBalance + after.quote.pointsEarned,
                pointsLifetime: user.pointsLifetime + after.quote.pointsEarned,
                pointsHistory: [
                  { id: uid("ph"), at: new Date().toISOString(), label: `Pedido ${after.code}`, delta: after.quote.pointsEarned },
                  ...user.pointsHistory,
                ],
              })),
              state.currentUserId,
              new Date().toISOString(),
            );
          }
          return { users: nextUsers, guestOrders };
        }),
      cancelOrder: (code) =>
        set((state) => {
          const cancel = (order: OrderRecord): OrderRecord =>
            order.code === code && order.status === "pagamento_pendente"
              ? {
                  ...order,
                  status: "cancelado",
                  timeline: [...order.timeline, { status: "cancelado", label: "Pedido cancelado", at: new Date().toISOString() }],
                }
              : order;
          return {
            users: state.users.map((user) => ({
              ...user,
              orders: user.orders.map(cancel),
              pointsBalance: user.orders.some((order) => order.code === code && order.status === "pagamento_pendente")
                ? user.pointsBalance + (user.orders.find((order) => order.code === code)?.quote.pointsUsed ?? 0)
                : user.pointsBalance,
            })),
            guestOrders: state.guestOrders.map(cancel),
          };
        }),
      setSubscriptionStatus: (id, status) =>
        set((state) => ({
          users: withUser(state.users, state.currentUserId, (user) => ({
            ...user,
            subscriptions: user.subscriptions.map((item) => (item.id === id ? { ...item, status } : item)),
          })),
        })),
      savePatch: (slug, patch) => set((state) => ({ patches: { ...state.patches, [slug]: { ...state.patches[slug], ...patch } } })),
      acceptLgpd: () => set({ lgpdAccepted: true }),
      saveScratch: (record) =>
        set((state) => ({ scratch: { ...state.scratch, [wishlistKey(state.currentUserId)]: record } })),
      addPoints: (delta, label) =>
        set((state) => ({
          users: withUser(state.users, state.currentUserId, (user) => ({
            ...user,
            pointsBalance: user.pointsBalance + delta,
            pointsLifetime: user.pointsLifetime + Math.max(0, delta),
            pointsHistory: [{ id: uid("ph"), at: new Date().toISOString(), label, delta }, ...user.pointsHistory],
          })),
        })),
      joinNewsletter: (email) =>
        set((state) => ({ newsletter: state.newsletter.includes(email) ? state.newsletter : [...state.newsletter, email] })),
    }),
    {
      name: "pulso-store",
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
      partialize: (state) => ({
        users: state.users,
        currentUserId: state.currentUserId,
        cart: state.cart,
        couponCode: state.couponCode,
        wishlist: state.wishlist,
        guestOrders: state.guestOrders,
        patches: state.patches,
        scratch: state.scratch,
        lgpdAccepted: state.lgpdAccepted,
        newsletter: state.newsletter,
      }),
      merge: (persisted, current) => {
        const stored = (persisted ?? {}) as Partial<PulsoState>;
        return {
          ...current,
          ...stored,
          users: ensureDemo(stored.users ?? current.users),
          toasts: [],
          cartOpen: false,
          hydrated: true,
        };
      },
      onRehydrateStorage: () => (state) => {
        state?.setHydrated(true);
      },
    },
  ),
);

function findOrder(state: Pick<PulsoState, "users" | "guestOrders">, code: string): OrderRecord | undefined {
  for (const user of state.users) {
    const found = user.orders.find((order) => order.code === code);
    if (found) return found;
  }
  return state.guestOrders.find((order) => order.code === code);
}

export function useCurrentUser(): AccountUser | null {
  return usePulso((state) => state.users.find((user) => user.id === state.currentUserId) ?? null);
}

export function useWishlist(): string[] {
  const userId = usePulso((state) => state.currentUserId);
  const wishlist = usePulso((state) => state.wishlist);
  return wishlist[wishlistKey(userId)] ?? [];
}

export function buildSimulatedPayment(input: {
  method: PaymentMethod;
  code: string;
  totalCents: number;
  installments?: number;
  installmentAmountCents?: number;
  cardLast4?: string;
}): OrderRecord["payment"] {
  const charge = sandboxCharge({ method: input.method, amountCents: input.totalCents, orderCode: input.code });
  if ("error" in charge) {
    return { method: input.method, status: "recusado", sandboxMessage: charge.error };
  }
  return {
    method: input.method,
    status: charge.status === "approved" ? "aprovado" : "pendente",
    pixPayload: charge.pixCopyPaste,
    boletoLine: charge.boletoLine,
    cardBrand: input.method === "card" ? "visa" : undefined,
    cardLast4: input.method === "card" ? (input.cardLast4 ?? "4242") : undefined,
    installments: input.installments ?? 1,
    installmentAmountCents: input.installmentAmountCents,
    gateway: charge.gateway,
    externalId: charge.externalId,
    sandboxMessage: charge.message,
  };
}

export function quoteFromCart(input: {
  cart: CartLine[];
  couponCode: string | null;
  redeemPoints: number;
  pointsBalance: number;
  lifetimePoints: number;
  payment: PaymentMethod;
  shippingMethod: ShippingMethod;
  pacCents: number;
  sedexCents: number;
  pixDiscountPercent: number;
  freeShippingBaseCents: number;
}) {
  const found = input.couponCode ? findCoupon(input.couponCode, coupons) : { coupon: null };
  return quoteCart({
    lines: input.cart,
    coupon: found.coupon,
    redeemPoints: input.redeemPoints,
    pointsBalance: input.pointsBalance,
    lifetimePoints: input.lifetimePoints,
    payment: input.payment,
    shippingMethod: input.shippingMethod,
    pacCents: input.pacCents,
    sedexCents: input.sedexCents,
    pixDiscountPercent: input.pixDiscountPercent,
    freeShippingBaseCents: input.freeShippingBaseCents,
  });
}

export function makeOrderCode(): string {
  return orderCode();
}
