import { onlyDigits } from "./money";
import type { PaymentMethod, ShippingMethod } from "./types";

export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim()) && value.trim().length <= 120;
}

export function isValidCpf(value: string): boolean {
  const cpf = onlyDigits(value);
  if (cpf.length !== 11 || /^(\d)\1+$/.test(cpf)) return false;
  const digit = (length: number) => {
    let sum = 0;
    for (let index = 0; index < length; index += 1) {
      sum += Number(cpf[index]) * (length + 1 - index);
    }
    const mod = (sum * 10) % 11;
    return mod === 10 ? 0 : mod;
  };
  return digit(9) === Number(cpf[9]) && digit(10) === Number(cpf[10]);
}

export function isValidCep(value: string): boolean {
  const cep = onlyDigits(value);
  return cep.length === 8 && cep !== "00000000";
}

export function luhn(value: string): boolean {
  const digits = onlyDigits(value);
  if (digits.length < 13 || digits.length > 19) return false;
  let sum = 0;
  let alternate = false;
  for (let index = digits.length - 1; index >= 0; index -= 1) {
    let current = Number(digits[index]);
    if (alternate) {
      current *= 2;
      if (current > 9) current -= 9;
    }
    sum += current;
    alternate = !alternate;
  }
  return sum % 10 === 0;
}

export function isValidExpiry(value: string, now = new Date()): boolean {
  const match = /^(0[1-9]|1[0-2])\/(\d{2})$/.exec(value.trim());
  if (!match) return false;
  const month = Number(match[1]);
  const year = 2000 + Number(match[2]);
  const expiry = new Date(Date.UTC(year, month, 1));
  const current = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  return expiry > current;
}

export const UF_LIST = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG",
  "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
] as const;

export interface CheckoutInput {
  name: string;
  email: string;
  cpf: string;
  phone: string;
  cep: string;
  street: string;
  number: string;
  complement?: string;
  neighborhood: string;
  city: string;
  state: string;
  shippingMethod: ShippingMethod;
  paymentMethod: PaymentMethod;
  card?: {
    number: string;
    name: string;
    expiry: string;
    cvv: string;
    installments: number;
  };
  acceptLgpd: boolean;
  acceptAge: boolean;
  acceptTerms: boolean;
}

export function validateCheckout(
  input: CheckoutInput,
  now = new Date(),
): { ok: true } | { ok: false; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  if (input.name.trim().length < 3) errors.name = "Coloca nome e sobrenome.";
  if (!isValidEmail(input.email)) errors.email = "E-mail inválido.";
  if (!isValidCpf(input.cpf)) errors.cpf = "CPF inválido.";
  const phone = onlyDigits(input.phone);
  if (phone.length < 10 || phone.length > 11) errors.phone = "Celular com DDD.";
  if (!isValidCep(input.cep)) errors.cep = "CEP com 8 números.";
  if (input.street.trim().length < 3) errors.street = "Falta a rua.";
  if (input.number.trim().length < 1) errors.number = "Falta o número.";
  if (input.neighborhood.trim().length < 2) errors.neighborhood = "Falta o bairro.";
  if (input.city.trim().length < 2) errors.city = "Falta a cidade.";
  if (!UF_LIST.includes(input.state.toUpperCase() as (typeof UF_LIST)[number])) {
    errors.state = "UF inválida.";
  }
  if (input.shippingMethod !== "pac" && input.shippingMethod !== "sedex") {
    errors.shippingMethod = "Escolhe PAC ou SEDEX.";
  }
  if (!["pix", "boleto", "card"].includes(input.paymentMethod)) {
    errors.paymentMethod = "Escolhe um jeito de pagar.";
  }
  if (input.paymentMethod === "card") {
    const card = input.card;
    if (!card || !luhn(card.number)) errors.cardNumber = "Número do cartão inválido.";
    if (!card || card.name.trim().length < 3) errors.cardName = "Nome impresso no cartão.";
    if (!card || !isValidExpiry(card.expiry, now)) errors.cardExpiry = "Validade vencida ou incompleta.";
    if (!card || !/^\d{3,4}$/.test(card.cvv)) errors.cardCvv = "CVV com 3 ou 4 dígitos.";
    if (!card || card.installments < 1 || card.installments > 12) {
      errors.installments = "Parcelas de 1 a 12.";
    }
  }
  if (!input.acceptAge) errors.acceptAge = "Venda só para maiores de 18.";
  if (!input.acceptTerms) errors.acceptTerms = "Aceita os termos pra continuar.";
  if (!input.acceptLgpd) errors.acceptLgpd = "Precisamos do ok pra tratar teus dados deste pedido.";
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true };
}
