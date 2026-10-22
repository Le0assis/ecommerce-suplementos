import { fakeBoletoLine, fakePixPayload } from "./scratch";
import type { PaymentMethod } from "./types";

export type PaymentGateway = "mercadopago" | "pagarme";

export interface SandboxChargeInput {
  gateway?: PaymentGateway;
  method: PaymentMethod;
  amountCents: number;
  orderCode: string;
}

export interface SandboxCharge {
  sandbox: true;
  gateway: PaymentGateway;
  method: PaymentMethod;
  amountCents: number;
  externalId: string;
  status: "pending" | "approved";
  pixCopyPaste?: string;
  boletoLine?: string;
  message: string;
}

/** Pix e boleto passam pelo sandbox do Mercado Pago. Cartão, pelo da Pagar.me. */
export function defaultGateway(method: PaymentMethod): PaymentGateway {
  return method === "card" ? "pagarme" : "mercadopago";
}

export function sandboxCharge(input: SandboxChargeInput): SandboxCharge | { error: string } {
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
    return { error: "Valor inválido para o sandbox." };
  }
  const orderCode = input.orderCode.trim();
  if (!orderCode) return { error: "Pedido sem código." };
  const gateway = input.gateway ?? defaultGateway(input.method);
  const charge: SandboxCharge = {
    sandbox: true,
    gateway,
    method: input.method,
    amountCents: input.amountCents,
    externalId: `${gateway === "mercadopago" ? "mp" : "pm"}_sandbox_${orderCode}`,
    status: input.method === "card" ? "approved" : "pending",
    message:
      gateway === "mercadopago"
        ? "Sandbox Mercado Pago. Nenhum valor foi cobrado."
        : "Sandbox Pagar.me. Nenhum valor foi cobrado.",
  };
  if (input.method === "pix") charge.pixCopyPaste = fakePixPayload(orderCode, input.amountCents);
  if (input.method === "boleto") charge.boletoLine = fakeBoletoLine(orderCode);
  return charge;
}
