import type { Coupon } from "@pulso/domain";

export const coupons: Coupon[] = [
  { code: "LUNA15", label: "Luna 15%", kind: "percent", percent: 15, influencerSlug: "luna-vaz", active: true, public: true },
  { code: "CAIO10", label: "Caio 10%", kind: "percent", percent: 10, influencerSlug: "caio-bruto", active: true, public: true },
  { code: "NANDA10", label: "Nanda 10%", kind: "percent", percent: 10, influencerSlug: "nanda-pace", active: true, public: true },
  { code: "THEO10", label: "Theo 10%", kind: "percent", percent: 10, influencerSlug: "theo-ink", active: true, public: true },
  { code: "PULSO10", label: "Boas-vindas 10%", kind: "percent", percent: 10, active: true, public: true },
  { code: "RASPA5", label: "Raspadinha 5%", kind: "percent", percent: 5, active: true, public: false },
  { code: "RASPA10", label: "Raspadinha 10%", kind: "percent", percent: 10, active: true, public: false },
  { code: "RASPAFRETE", label: "Frete da raspadinha", kind: "shipping", active: true, public: false },
  { code: "VENCIDO", label: "Cupom encerrado", kind: "percent", percent: 50, active: false, public: false },
];
