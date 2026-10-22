import { freeShippingThresholdCents } from "./loyalty";
import { onlyDigits } from "./money";
import { isValidCep } from "./validators";
import type { ShippingMethod } from "./types";

export interface CepAddress {
  cep: string;
  street: string;
  neighborhood: string;
  city: string;
  state: string;
  area: string;
  source: "demo-tabela" | "demo-regra";
}

export interface ShippingRate {
  id: ShippingMethod;
  label: string;
  carrier: "Correios";
  priceCents: number;
  etaBusinessDays: [number, number];
}

interface Region {
  pac: number;
  sedex: number;
  pacDays: [number, number];
  sedexDays: [number, number];
  city: string;
  state: string;
  area: string;
}

const REGIONS: Record<string, Region> = {
  "0": { pac: 1890, sedex: 3290, pacDays: [2, 4], sedexDays: [1, 2], city: "São Paulo", state: "SP", area: "capital" },
  "1": { pac: 2190, sedex: 3690, pacDays: [3, 6], sedexDays: [1, 3], city: "Campinas", state: "SP", area: "interior de SP" },
  "2": { pac: 2490, sedex: 3990, pacDays: [3, 6], sedexDays: [1, 3], city: "Rio de Janeiro", state: "RJ", area: "RJ e ES" },
  "3": { pac: 2490, sedex: 4190, pacDays: [4, 7], sedexDays: [2, 4], city: "Belo Horizonte", state: "MG", area: "Minas Gerais" },
  "4": { pac: 2990, sedex: 4990, pacDays: [5, 9], sedexDays: [2, 5], city: "Salvador", state: "BA", area: "BA e SE" },
  "5": { pac: 3290, sedex: 5490, pacDays: [6, 10], sedexDays: [3, 6], city: "Recife", state: "PE", area: "Nordeste" },
  "6": { pac: 3690, sedex: 6290, pacDays: [8, 14], sedexDays: [4, 8], city: "Fortaleza", state: "CE", area: "Norte e Nordeste" },
  "7": { pac: 2890, sedex: 4690, pacDays: [4, 8], sedexDays: [2, 4], city: "Brasília", state: "DF", area: "Centro-Oeste" },
  "8": { pac: 2390, sedex: 3990, pacDays: [3, 6], sedexDays: [1, 3], city: "Curitiba", state: "PR", area: "Sul" },
  "9": { pac: 2690, sedex: 4490, pacDays: [4, 7], sedexDays: [2, 4], city: "Porto Alegre", state: "RS", area: "Rio Grande do Sul" },
};

const KNOWN: Record<string, Omit<CepAddress, "cep" | "source">> = {
  "01310100": { street: "Avenida Paulista", neighborhood: "Bela Vista", city: "São Paulo", state: "SP", area: "capital" },
  "22041080": { street: "Avenida Atlântica", neighborhood: "Copacabana", city: "Rio de Janeiro", state: "RJ", area: "RJ e ES" },
  "30130010": { street: "Avenida Afonso Pena", neighborhood: "Centro", city: "Belo Horizonte", state: "MG", area: "Minas Gerais" },
  "80010000": { street: "Rua XV de Novembro", neighborhood: "Centro", city: "Curitiba", state: "PR", area: "Sul" },
  "40020000": { street: "Rua Chile", neighborhood: "Comércio", city: "Salvador", state: "BA", area: "BA e SE" },
  "90010000": { street: "Rua dos Andradas", neighborhood: "Centro Histórico", city: "Porto Alegre", state: "RS", area: "Rio Grande do Sul" },
  "70040902": { street: "Esplanada dos Ministérios", neighborhood: "Zona Cívico-Administrativa", city: "Brasília", state: "DF", area: "Centro-Oeste" },
  "60025100": { street: "Avenida Beira Mar", neighborhood: "Meireles", city: "Fortaleza", state: "CE", area: "Norte e Nordeste" },
};

export type CepLookup = { ok: true; address: CepAddress } | { ok: false; error: string };

export function lookupCep(value: string): CepLookup {
  if (!isValidCep(value)) return { ok: false, error: "CEP precisa ter 8 números." };
  const cep = onlyDigits(value);
  const known = KNOWN[cep];
  if (known) return { ok: true, address: { cep, ...known, source: "demo-tabela" } };
  const region = REGIONS[cep[0]!]!;
  const block = Number(cep.slice(1, 4)) % 80;
  return {
    ok: true,
    address: {
      cep,
      street: `Rua do Treino ${block + 10}`,
      neighborhood: "Centro",
      city: region.city,
      state: region.state,
      area: region.area,
      source: "demo-regra",
    },
  };
}

export function shippingRates(value: string): { ok: true; rates: ShippingRate[] } | { ok: false; error: string } {
  const found = lookupCep(value);
  if (!found.ok) return found;
  const region = REGIONS[onlyDigits(value)[0]!]!;
  return {
    ok: true,
    rates: [
      { id: "pac", label: "PAC", carrier: "Correios", priceCents: region.pac, etaBusinessDays: region.pacDays },
      { id: "sedex", label: "SEDEX", carrier: "Correios", priceCents: region.sedex, etaBusinessDays: region.sedexDays },
    ],
  };
}

export function etaLabel(days: [number, number]): string {
  return `${days[0]} a ${days[1]} dias úteis`;
}

export function resolveShippingCents(input: {
  method: ShippingMethod;
  pacCents: number;
  sedexCents: number;
  merchandiseCents: number;
  levelId?: string;
  freeShippingBaseCents?: number;
  shippingCoupon?: boolean;
}): { cents: number; free: boolean; thresholdCents: number } {
  const thresholdCents = freeShippingThresholdCents(input.levelId ?? "rookie", input.freeShippingBaseCents);
  const base = input.method === "pac" ? input.pacCents : input.sedexCents;
  const freeByThreshold = input.method === "pac" && input.merchandiseCents >= thresholdCents;
  const free = Boolean(input.shippingCoupon) || freeByThreshold;
  return { cents: free ? 0 : base, free, thresholdCents };
}

export function freeShippingProgress(merchandiseCents: number, thresholdCents: number): {
  remainingCents: number;
  ratio: number;
  reached: boolean;
} {
  const remainingCents = Math.max(0, thresholdCents - merchandiseCents);
  const ratio = thresholdCents <= 0 ? 1 : Math.min(1, merchandiseCents / thresholdCents);
  return { remainingCents, ratio, reached: remainingCents === 0 };
}
