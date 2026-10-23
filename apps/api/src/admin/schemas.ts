import { z } from "zod";

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "A cor precisa ser um hex de 6 dígitos.");
const families = z.enum(["citrica", "doce", "fruta", "neutro", "chocolate"]);
const badges = z.enum(["drop", "limited", "bestseller", "novo", "collab"]);
const httpsUrl = z
  .string()
  .url("A foto precisa ser uma URL https.")
  .refine((value) => value.startsWith("https://"), "A foto precisa ser uma URL https.");

const optionalHttps = z
  .union([httpsUrl, z.literal(""), z.null()])
  .optional()
  .transform((value) => (value ? value : null));

export const flavorSchema = z.object({
  id: z.string().trim().min(1).max(80).optional(),
  name: z.string().trim().min(1, "O sabor precisa de nome.").max(80),
  tagline: z.string().trim().max(160).default(""),
  hex,
  family: families,
  limited: z.boolean().optional().default(false),
  stock: z.number().int().nonnegative("Estoque não pode ser negativo.").optional(),
});

export const variantSchema = z.object({
  id: z.string().trim().min(1).max(120).optional(),
  flavorId: z.string().trim().min(1).max(80),
  size: z.string().trim().min(1).max(40),
  sku: z.string().trim().min(1).max(80),
  priceCents: z.number().int().nonnegative("Preço não pode ser negativo."),
  compareAtCents: z.number().int().nonnegative("O preço riscado não pode ser negativo.").nullable().optional(),
  stock: z.number().int().nonnegative("Estoque não pode ser negativo."),
  weightGrams: z.number().int().nonnegative(),
  servings: z.number().int().positive("A variação precisa de pelo menos uma porção."),
});

export const imageSchema = z.object({
  id: z.string().trim().min(1).max(120).optional(),
  flavorId: z.string().trim().min(1).max(80).nullable(),
  url: optionalHttps,
  alt: z.string().trim().min(1, "A foto precisa de texto alternativo.").max(200),
  position: z.number().int().nonnegative().optional(),
  isCover: z.boolean().optional().default(false),
  fallbackHex: z.union([hex, z.null()]).optional().default(null),
});

const nutritionSchema = z.object({
  nutrient: z.string().trim().min(1).max(80),
  amount: z.string().trim().min(1).max(40),
  dailyValue: z.string().trim().max(20).optional(),
});

const labelSchema = z.object({
  registration: z.string().regex(/^NI-DEMO-[A-Z0-9-]{2,40}$/, "O registro deste protótipo usa o prefixo NI-DEMO-."),
  category: z.string().trim().min(1).max(80),
  serving: z.string().trim().min(1, "Informe a porção.").max(80),
  servingsPerContainer: z.number().int().positive("O pote precisa de pelo menos uma porção."),
  ingredients: z.string().trim().min(1).max(2000),
  allergens: z.string().trim().min(1).max(400),
  warnings: z.array(z.string().trim().min(1).max(240)).min(1).max(12),
  nutrition: z.array(nutritionSchema).max(40),
  manufacturer: z.string().trim().min(1).max(400),
});

export const productSchema = z
  .object({
    id: z.string().trim().min(1).max(80).optional(),
    slug: z
      .string()
      .trim()
      .min(1)
      .max(80)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "O slug usa letras minúsculas e hífen."),
    name: z.string().trim().min(1).max(120),
    line: z.string().trim().max(80).default(""),
    tagline: z.string().trim().max(180).default(""),
    description: z.string().trim().min(1).max(4000),
    howToUse: z.string().trim().max(2000).default(""),
    categoryId: z.string().trim().min(1).max(80),
    goals: z.array(z.string().trim().min(1).max(80)).max(12).default([]),
    badges: z.array(badges).max(8).default([]),
    status: z.enum(["rascunho", "publicado", "ativo", "oculto", "arquivado"]).default("rascunho"),
    caffeineMg: z.number().int().nonnegative().default(0),
    proteinG: z.number().int().nonnegative().default(0),
    influencerId: z.string().trim().min(1).max(80).nullable().optional().default(null),
    subscriptionEnabled: z.boolean().default(true),
    subscriptionPercent: z.number().int().min(0).max(100).default(10),
    subscriptionIntervalDays: z.number().int().positive().default(30),
    isKit: z.boolean().default(false),
    kitItems: z
      .array(z.object({ productId: z.string().trim().min(1).max(80), quantity: z.number().int().positive() }))
      .max(20)
      .default([]),
    flavors: z.array(flavorSchema).max(24).default([]),
    variants: z.array(variantSchema).max(80).default([]),
    label: labelSchema,
    images: z.array(imageSchema).max(12).default([]),
  })
  .superRefine((product, ctx) => {
    if (!product.label.warnings.some((warning) => warning.toLowerCase().includes("não é um medicamento"))) {
      ctx.addIssue({ code: "custom", message: "O rótulo precisa dizer que não é um medicamento.", path: ["label", "warnings"] });
    }
    const flavorIds = new Set(product.flavors.map((flavor, index) => flavor.id || `sabor-${index + 1}`));
    for (const variant of product.variants) {
      if (!flavorIds.has(variant.flavorId)) {
        ctx.addIssue({ code: "custom", message: "A variação aponta para um sabor que não existe.", path: ["variants"] });
      }
    }
  });

const nullableDate = z
  .union([z.string(), z.null()])
  .optional()
  .transform((value, ctx) => {
    if (value === undefined || value === null || value === "") return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Data inválida." });
      return z.NEVER;
    }
    return date.toISOString();
  });

export const couponSchema = z
  .object({
    code: z
      .string()
      .trim()
      .min(3)
      .max(32)
      .regex(/^[A-Za-z0-9-]+$/, "O código usa letras, números e hífen."),
    label: z.string().trim().min(1).max(120),
    kind: z.enum(["percent", "shipping"]),
    value: z.number().int().nonnegative().default(0),
    minCents: z.number().int().nonnegative().default(0),
    startsAt: nullableDate,
    endsAt: nullableDate,
    maxUses: z.number().int().positive().nullable().optional().default(null),
    influencerId: z.string().trim().min(1).max(80).nullable().optional().default(null),
    active: z.boolean().default(true),
  })
  .superRefine((coupon, ctx) => {
    if (coupon.kind === "percent" && (coupon.value < 1 || coupon.value > 30)) {
      ctx.addIssue({ code: "custom", message: "O cupom percentual fica entre 1% e 30%.", path: ["value"] });
    }
    if (coupon.startsAt && coupon.endsAt && coupon.endsAt < coupon.startsAt) {
      ctx.addIssue({ code: "custom", message: "A validade termina antes de começar.", path: ["endsAt"] });
    }
  });

export const uploadSchema = z.object({
  filename: z.string().trim().min(1).max(180).optional(),
  contentType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  alt: z.string().trim().min(1, "A foto precisa de texto alternativo.").max(200),
});

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export const UPLOAD_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
