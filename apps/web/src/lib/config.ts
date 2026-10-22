import { FREE_SHIPPING_CENTS, PIX_DISCOUNT_PERCENT } from "@pulso/domain";

function numberFrom(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const siteConfig = {
  name: "PULSO",
  description: "Suplementos com cara de rua para quem treina. Pix com desconto, frete por CEP e sabor na frente.",
  pixDiscountPercent: numberFrom(process.env.NEXT_PUBLIC_PIX_DISCOUNT, PIX_DISCOUNT_PERCENT),
  freeShippingCents: numberFrom(process.env.NEXT_PUBLIC_FREE_SHIPPING_CENTS, FREE_SHIPPING_CENTS),
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? "http://127.0.0.1:43123",
  adminPassword: process.env.NEXT_PUBLIC_ADMIN_PASSWORD ?? "pulso-admin",
  apiUrl: process.env.API_URL ?? "http://127.0.0.1:8787",
  dataSource: process.env.DATA_SOURCE === "api" ? "api" : "mock",
  socials: [
    { label: "Instagram", href: "https://instagram.com/pulsosuplementos" },
    { label: "TikTok", href: "https://www.tiktok.com/@pulsosuplementos" },
    { label: "YouTube", href: "https://www.youtube.com/@pulsosuplementos" },
  ],
};
