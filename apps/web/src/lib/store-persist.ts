import { demoUser } from "./demo";
import type { AccountUser } from "./types";

/** O que a chave `pulso-store` pode gravar. Conta, sessão, pedido e CPF ficam de fora. */
export interface PersistedStoreSlice {
  cart: unknown;
  couponCode: string | null;
  wishlist: Record<string, string[]>;
  patches: unknown;
  couponPatches: Record<string, { active?: boolean }>;
  contentPatches: unknown;
  analytics: unknown;
  scratch: unknown;
  lgpdAccepted: boolean;
  newsletter: string[];
}

const DROPPED_KEYS = new Set([
  "users",
  "currentUserId",
  "guestOrders",
  "password",
  "cpf",
  "cpfEnc",
  "cpfHash",
  "passwordHash",
]);

export function persistedStoreSlice(state: PersistedStoreSlice): PersistedStoreSlice {
  return {
    cart: state.cart,
    couponCode: state.couponCode,
    wishlist: state.wishlist,
    patches: state.patches,
    couponPatches: state.couponPatches,
    contentPatches: state.contentPatches,
    analytics: state.analytics,
    scratch: state.scratch,
    lgpdAccepted: state.lgpdAccepted,
    newsletter: state.newsletter,
  };
}

export function ensureDemo(users: AccountUser[]): AccountUser[] {
  if (users.some((user) => user.email === demoUser.email)) return users;
  return [demoUser, ...users];
}

/** Blob antigo com CPF, senha ou pedido não volta para a memória. A conta demo continua a do código. */
export function mergePersistedStore<T extends { users: AccountUser[] }>(persisted: unknown, current: T): T {
  const raw = persisted && typeof persisted === "object" ? (persisted as Record<string, unknown>) : {};
  const stored: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (DROPPED_KEYS.has(key)) continue;
    stored[key] = value;
  }
  return {
    ...current,
    ...stored,
    users: ensureDemo(current.users),
    currentUserId: null,
    guestOrders: [],
    couponPatches: stored.couponPatches ?? {},
    contentPatches: stored.contentPatches ?? {},
    analytics: stored.analytics ?? [],
    toasts: [],
    cartOpen: false,
    hydrated: true,
  } as T;
}
