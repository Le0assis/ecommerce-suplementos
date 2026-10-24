import { randomUUID } from "node:crypto";
import type { Review, UgcPost } from "@pulso/domain";
import { CatalogError, resolveProductSlug } from "./catalog";
import type { Sql } from "./sql";

function pgCode(error: unknown): string {
  return typeof error === "object" && error && "code" in error ? String((error as { code: unknown }).code) : "";
}

function num(value: unknown, fallback = 0): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function iso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export interface NamedRow {
  slug: string;
  name: string;
  blurb: string | null;
  imageUrl: string | null;
  position: number;
}

export async function listNamed(sql: Sql, table: "categories" | "goals"): Promise<NamedRow[]> {
  const rows = await sql.query<{ slug: string; name: string; blurb: string | null; image_url: string | null; position: number }>(
    `select slug, name, blurb, image_url, position from ${table} order by position asc, name asc`,
  );
  return rows.rows.map((row) => ({
    slug: row.slug,
    name: row.name,
    blurb: row.blurb,
    imageUrl: row.image_url,
    position: num(row.position),
  }));
}

export async function saveNamed(sql: Sql, table: "categories" | "goals", input: NamedRow): Promise<NamedRow> {
  await sql.query(
    `insert into ${table} (slug, name, blurb, image_url, position)
     values ($1, $2, $3, $4, $5)
     on conflict (slug) do update set name = excluded.name, blurb = excluded.blurb, image_url = excluded.image_url, position = excluded.position`,
    [input.slug, input.name, input.blurb, input.imageUrl, input.position],
  );
  const rows = await listNamed(sql, table);
  const saved = rows.find((row) => row.slug === input.slug);
  if (!saved) throw new CatalogError(500, "Registro não voltou depois de gravar.", "SAVE");
  return saved;
}

export async function deleteNamed(sql: Sql, table: "categories" | "goals", slug: string): Promise<void> {
  try {
    const rows = await sql.query<{ slug: string }>(`delete from ${table} where slug = $1 returning slug`, [slug]);
    if (!rows.rows.length) throw new CatalogError(404, "Registro não encontrado.", "NOT_FOUND");
  } catch (error) {
    if (error instanceof CatalogError) throw error;
    if (pgCode(error) === "23503") throw new CatalogError(409, "Este registro está em uso.", "IN_USE");
    throw error;
  }
}

export interface PromotionInput {
  id: string;
  name: string;
  kind: "percent" | "fixed_cents" | "compare_at";
  value: number;
  targetType: "produto" | "categoria";
  productId: string | null;
  categoryId: string | null;
  startsAt: string | null;
  endsAt: string | null;
  badge: string | null;
  active: boolean;
}

export async function listPromotions(sql: Sql): Promise<PromotionInput[]> {
  const rows = await sql.query<{
    id: string;
    name: string;
    kind: PromotionInput["kind"];
    value: number;
    target_type: PromotionInput["targetType"];
    product_id: string | null;
    category_id: string | null;
    starts_at: Date | string | null;
    ends_at: Date | string | null;
    badge: string | null;
    active: boolean;
  }>(
    `select id, name, kind, value, target_type, product_id, category_id, starts_at, ends_at, badge, active
     from promotions order by name asc`,
  );
  return rows.rows.map((row) => ({
    id: row.id,
    name: row.name,
    kind: row.kind,
    value: num(row.value),
    targetType: row.target_type,
    productId: row.product_id,
    categoryId: row.category_id,
    startsAt: iso(row.starts_at),
    endsAt: iso(row.ends_at),
    badge: row.badge,
    active: row.active,
  }));
}

export async function savePromotion(sql: Sql, input: PromotionInput): Promise<PromotionInput> {
  await sql.query(
    `insert into promotions (id, name, kind, value, target_type, product_id, category_id, starts_at, ends_at, badge, active, updated_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, now())
     on conflict (id) do update set
       name = excluded.name, kind = excluded.kind, value = excluded.value, target_type = excluded.target_type,
       product_id = excluded.product_id, category_id = excluded.category_id, starts_at = excluded.starts_at,
       ends_at = excluded.ends_at, badge = excluded.badge, active = excluded.active, updated_at = now()`,
    [
      input.id,
      input.name,
      input.kind,
      input.value,
      input.targetType,
      input.productId,
      input.categoryId,
      input.startsAt,
      input.endsAt,
      input.badge,
      input.active,
    ],
  );
  const saved = (await listPromotions(sql)).find((row) => row.id === input.id);
  if (!saved) throw new CatalogError(500, "Promoção não voltou depois de gravar.", "SAVE");
  return saved;
}

export async function archivePromotion(sql: Sql, id: string): Promise<PromotionInput> {
  const current = (await listPromotions(sql)).find((row) => row.id === id);
  if (!current) throw new CatalogError(404, "Promoção não encontrada.", "NOT_FOUND");
  return savePromotion(sql, { ...current, active: false });
}

export interface QuizOption {
  id: string;
  label: string;
  value: string;
  position: number;
  weights: { products?: Record<string, number>; goals?: Record<string, number> };
}

export interface QuizQuestion {
  id: string;
  prompt: string;
  answerKey: string;
  position: number;
  options: QuizOption[];
}

export async function listQuiz(sql: Sql): Promise<QuizQuestion[]> {
  const questions = await sql.query<{ id: string; prompt: string; answer_key: string; position: number }>(
    "select id, prompt, answer_key, position from quiz_questions order by position asc",
  );
  const options = await sql.query<{
    id: string;
    question_id: string;
    label: string;
    value: string;
    position: number;
    weights: QuizOption["weights"];
  }>("select id, question_id, label, value, position, weights from quiz_options order by position asc");
  return questions.rows.map((question) => ({
    id: question.id,
    prompt: question.prompt,
    answerKey: question.answer_key,
    position: num(question.position),
    options: options.rows
      .filter((option) => option.question_id === question.id)
      .map((option) => ({
        id: option.id,
        label: option.label,
        value: option.value,
        position: num(option.position),
        weights: option.weights ?? {},
      })),
  }));
}

export async function saveQuizQuestion(sql: Sql, input: QuizQuestion): Promise<QuizQuestion> {
  await sql.query(
    `insert into quiz_questions (id, prompt, answer_key, position)
     values ($1, $2, $3, $4)
     on conflict (id) do update set prompt = excluded.prompt, answer_key = excluded.answer_key, position = excluded.position`,
    [input.id, input.prompt, input.answerKey, input.position],
  );
  await sql.query("delete from quiz_options where question_id = $1", [input.id]);
  for (const [index, option] of input.options.entries()) {
    await sql.query(
      `insert into quiz_options (id, question_id, label, value, position, weights)
       values ($1, $2, $3, $4, $5, $6::jsonb)`,
      [option.id || `${input.id}__${option.value}`, input.id, option.label, option.value, option.position ?? index, JSON.stringify(option.weights ?? {})],
    );
  }
  const saved = (await listQuiz(sql)).find((question) => question.id === input.id);
  if (!saved) throw new CatalogError(500, "Pergunta não voltou depois de gravar.", "SAVE");
  return saved;
}

export async function deleteQuizQuestion(sql: Sql, id: string): Promise<void> {
  try {
    const rows = await sql.query<{ id: string }>("delete from quiz_questions where id = $1 returning id", [id]);
    if (!rows.rows.length) throw new CatalogError(404, "Pergunta não encontrada.", "NOT_FOUND");
  } catch (error) {
    if (error instanceof CatalogError) throw error;
    if (pgCode(error) === "23503") throw new CatalogError(409, "Esta pergunta está em uso.", "IN_USE");
    throw error;
  }
}

export interface LoyaltySettings {
  id: string;
  pointsPerReal: number;
  pixPointsBonus: number;
  pointValueCents: number;
  maxPointsRedeemRatio: number;
  welcomePoints: number;
  freeShippingCents: number;
  pixDiscountPercent: number;
  kitDiscountPercent: number;
  subscriptionDefaultPercent: number;
  referrerPoints: number;
  referredPoints: number;
  levels: unknown[];
  updatedAt: string | null;
}

export async function readLoyalty(sql: Sql): Promise<LoyaltySettings | null> {
  const rows = await sql.query<{
    id: string;
    points_per_real: number;
    pix_points_bonus: number | string;
    point_value_cents: number;
    max_points_redeem_ratio: number | string;
    welcome_points: number;
    free_shipping_cents: number;
    pix_discount_percent: number;
    kit_discount_percent: number;
    subscription_default_percent: number;
    referrer_points: number;
    referred_points: number;
    levels: unknown[];
    updated_at: Date | string | null;
  }>("select * from loyalty_settings where id = 'padrao'");
  const row = rows.rows[0];
  if (!row) return null;
  return {
    id: row.id,
    pointsPerReal: num(row.points_per_real),
    pixPointsBonus: num(row.pix_points_bonus),
    pointValueCents: num(row.point_value_cents),
    maxPointsRedeemRatio: num(row.max_points_redeem_ratio),
    welcomePoints: num(row.welcome_points),
    freeShippingCents: num(row.free_shipping_cents),
    pixDiscountPercent: num(row.pix_discount_percent),
    kitDiscountPercent: num(row.kit_discount_percent),
    subscriptionDefaultPercent: num(row.subscription_default_percent),
    referrerPoints: num(row.referrer_points),
    referredPoints: num(row.referred_points),
    levels: row.levels ?? [],
    updatedAt: iso(row.updated_at),
  };
}

export async function saveLoyalty(sql: Sql, input: LoyaltySettings): Promise<LoyaltySettings> {
  await sql.query(
    `insert into loyalty_settings (
       id, points_per_real, pix_points_bonus, point_value_cents, max_points_redeem_ratio,
       welcome_points, free_shipping_cents, pix_discount_percent, kit_discount_percent,
       subscription_default_percent, referrer_points, referred_points, levels, updated_at
     ) values ('padrao', $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, now())
     on conflict (id) do update set
       points_per_real = excluded.points_per_real,
       pix_points_bonus = excluded.pix_points_bonus,
       point_value_cents = excluded.point_value_cents,
       max_points_redeem_ratio = excluded.max_points_redeem_ratio,
       welcome_points = excluded.welcome_points,
       free_shipping_cents = excluded.free_shipping_cents,
       pix_discount_percent = excluded.pix_discount_percent,
       kit_discount_percent = excluded.kit_discount_percent,
       subscription_default_percent = excluded.subscription_default_percent,
       referrer_points = excluded.referrer_points,
       referred_points = excluded.referred_points,
       levels = excluded.levels,
       updated_at = now()`,
    [
      input.pointsPerReal,
      input.pixPointsBonus,
      input.pointValueCents,
      input.maxPointsRedeemRatio,
      input.welcomePoints,
      input.freeShippingCents,
      input.pixDiscountPercent,
      input.kitDiscountPercent,
      input.subscriptionDefaultPercent,
      input.referrerPoints,
      input.referredPoints,
      JSON.stringify(input.levels),
    ],
  );
  const saved = await readLoyalty(sql);
  if (!saved) throw new CatalogError(500, "Fidelidade não voltou depois de gravar.", "SAVE");
  return saved;
}

export interface ScratchPrizeRow {
  id: string;
  label: string;
  detail: string;
  weight: number;
  couponCode: string | null;
  points: number | null;
  active: boolean;
  position: number;
}

export async function listScratch(sql: Sql): Promise<ScratchPrizeRow[]> {
  const rows = await sql.query<{
    id: string;
    label: string;
    detail: string;
    weight: number;
    coupon_code: string | null;
    points: number | null;
    active: boolean;
    position: number;
  }>("select id, label, detail, weight, coupon_code, points, active, position from scratch_prizes order by position asc");
  return rows.rows.map((row) => ({
    id: row.id,
    label: row.label,
    detail: row.detail,
    weight: num(row.weight),
    couponCode: row.coupon_code,
    points: row.points === null ? null : num(row.points),
    active: row.active,
    position: num(row.position),
  }));
}

export async function saveScratch(sql: Sql, input: ScratchPrizeRow): Promise<ScratchPrizeRow> {
  await sql.query(
    `insert into scratch_prizes (id, label, detail, weight, coupon_code, points, active, position)
     values ($1, $2, $3, $4, $5, $6, $7, $8)
     on conflict (id) do update set
       label = excluded.label, detail = excluded.detail, weight = excluded.weight, coupon_code = excluded.coupon_code,
       points = excluded.points, active = excluded.active, position = excluded.position`,
    [input.id, input.label, input.detail, input.weight, input.couponCode, input.points, input.active, input.position],
  );
  const saved = (await listScratch(sql)).find((row) => row.id === input.id);
  if (!saved) throw new CatalogError(500, "Prêmio não voltou depois de gravar.", "SAVE");
  return saved;
}

export async function archiveScratch(sql: Sql, id: string): Promise<ScratchPrizeRow> {
  const current = (await listScratch(sql)).find((row) => row.id === id);
  if (!current) throw new CatalogError(404, "Prêmio não encontrado.", "NOT_FOUND");
  return saveScratch(sql, { ...current, active: false });
}

export interface BannerRow {
  id: string;
  slot: "hero" | "marquee" | "destaque";
  title: string;
  subtitle: string | null;
  href: string | null;
  imageUrl: string | null;
  accent: string | null;
  position: number;
  active: boolean;
  startsAt: string | null;
  endsAt: string | null;
}

export async function listBanners(sql: Sql): Promise<BannerRow[]> {
  const rows = await sql.query<{
    id: string;
    slot: BannerRow["slot"];
    title: string;
    subtitle: string | null;
    href: string | null;
    image_url: string | null;
    accent: string | null;
    position: number;
    active: boolean;
    starts_at: Date | string | null;
    ends_at: Date | string | null;
  }>("select id, slot, title, subtitle, href, image_url, accent, position, active, starts_at, ends_at from banners order by slot, position");
  return rows.rows.map((row) => ({
    id: row.id,
    slot: row.slot,
    title: row.title,
    subtitle: row.subtitle,
    href: row.href,
    imageUrl: row.image_url,
    accent: row.accent,
    position: num(row.position),
    active: row.active,
    startsAt: iso(row.starts_at),
    endsAt: iso(row.ends_at),
  }));
}

export async function saveBanner(sql: Sql, input: BannerRow): Promise<BannerRow> {
  await sql.query(
    `insert into banners (id, slot, title, subtitle, href, image_url, accent, position, active, starts_at, ends_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     on conflict (id) do update set
       slot = excluded.slot, title = excluded.title, subtitle = excluded.subtitle, href = excluded.href,
       image_url = excluded.image_url, accent = excluded.accent, position = excluded.position, active = excluded.active,
       starts_at = excluded.starts_at, ends_at = excluded.ends_at`,
    [input.id, input.slot, input.title, input.subtitle, input.href, input.imageUrl, input.accent, input.position, input.active, input.startsAt, input.endsAt],
  );
  const saved = (await listBanners(sql)).find((row) => row.id === input.id);
  if (!saved) throw new CatalogError(500, "Banner não voltou depois de gravar.", "SAVE");
  return saved;
}

export async function archiveBanner(sql: Sql, id: string): Promise<BannerRow> {
  const current = (await listBanners(sql)).find((row) => row.id === id);
  if (!current) throw new CatalogError(404, "Banner não encontrado.", "NOT_FOUND");
  return saveBanner(sql, { ...current, active: false });
}

export interface UgcRow {
  id: string;
  author: string;
  handle: string;
  caption: string;
  likes: number;
  accent: string;
  productId: string | null;
  position: number;
  hidden: boolean;
}

export async function listUgc(sql: Sql, includeHidden: boolean): Promise<UgcRow[]> {
  const rows = await sql.query<{
    id: string;
    author: string;
    handle: string;
    caption: string;
    likes: number;
    accent: string;
    product_id: string | null;
    position: number;
    hidden: boolean;
  }>(
    `select id, author, handle, caption, likes, accent, product_id, position, hidden
     from ugc_posts ${includeHidden ? "" : "where hidden = false"} order by position asc`,
  );
  return rows.rows.map((row) => ({
    id: row.id,
    author: row.author,
    handle: row.handle,
    caption: row.caption,
    likes: num(row.likes),
    accent: row.accent,
    productId: row.product_id,
    position: num(row.position),
    hidden: row.hidden,
  }));
}

export async function saveUgc(sql: Sql, input: UgcRow): Promise<UgcRow> {
  await sql.query(
    `insert into ugc_posts (id, author, handle, caption, likes, accent, product_id, position, hidden)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     on conflict (id) do update set
       author = excluded.author, handle = excluded.handle, caption = excluded.caption, likes = excluded.likes,
       accent = excluded.accent, product_id = excluded.product_id, position = excluded.position, hidden = excluded.hidden`,
    [input.id, input.author, input.handle, input.caption, input.likes, input.accent, input.productId, input.position, input.hidden],
  );
  const saved = (await listUgc(sql, true)).find((row) => row.id === input.id);
  if (!saved) throw new CatalogError(500, "Post social não voltou depois de gravar.", "SAVE");
  return saved;
}

export async function hideUgc(sql: Sql, id: string): Promise<UgcRow> {
  const current = (await listUgc(sql, true)).find((row) => row.id === id);
  if (!current) throw new CatalogError(404, "Post social não encontrado.", "NOT_FOUND");
  return saveUgc(sql, { ...current, hidden: true });
}

export function ugcPublic(rows: UgcRow[]): UgcPost[] {
  return rows.filter((row) => !row.hidden).map((row) => ({
    id: row.id,
    author: row.author,
    handle: row.handle,
    caption: row.caption,
    likes: row.likes,
    accent: row.accent,
    ...(row.productId ? { productSlug: row.productId } : {}),
  }));
}

export interface VideoRow {
  id: string;
  slug: string;
  title: string;
  caption: string;
  duration: string;
  frames: [string, string, string];
  transcript: string[];
  position: number;
  hidden: boolean;
}

export async function listVideos(sql: Sql, includeHidden: boolean): Promise<VideoRow[]> {
  const rows = await sql.query<{
    id: string;
    slug: string;
    title: string;
    caption: string;
    duration: string;
    frames: string[];
    transcript: string[];
    position: number;
    hidden: boolean;
  }>(
    `select id, slug, title, caption, duration, frames, transcript, position, hidden
     from video_spots ${includeHidden ? "" : "where hidden = false"} order by position asc`,
  );
  return rows.rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    title: row.title,
    caption: row.caption,
    duration: row.duration,
    frames: [row.frames[0] ?? "#000000", row.frames[1] ?? "#000000", row.frames[2] ?? "#000000"],
    transcript: row.transcript ?? [],
    position: num(row.position),
    hidden: row.hidden,
  }));
}

export async function saveVideo(sql: Sql, input: VideoRow): Promise<VideoRow> {
  await sql.query(
    `insert into video_spots (id, slug, title, caption, duration, frames, transcript, position, hidden)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     on conflict (id) do update set
       slug = excluded.slug, title = excluded.title, caption = excluded.caption, duration = excluded.duration,
       frames = excluded.frames, transcript = excluded.transcript, position = excluded.position, hidden = excluded.hidden`,
    [input.id, input.slug, input.title, input.caption, input.duration, input.frames, input.transcript, input.position, input.hidden],
  );
  const saved = (await listVideos(sql, true)).find((row) => row.id === input.id);
  if (!saved) throw new CatalogError(500, "Vídeo não voltou depois de gravar.", "SAVE");
  return saved;
}

export async function hideVideo(sql: Sql, id: string): Promise<VideoRow> {
  const current = (await listVideos(sql, true)).find((row) => row.id === id);
  if (!current) throw new CatalogError(404, "Vídeo não encontrado.", "NOT_FOUND");
  return saveVideo(sql, { ...current, hidden: true });
}

export interface ReviewAdmin {
  id: string;
  productSlug: string;
  author: string;
  handle: string | null;
  rating: number;
  title: string | null;
  body: string | null;
  verified: boolean;
  helpful: number;
  createdAt: string | null;
  status: "pendente" | "aprovada" | "oculta";
  reply: string | null;
}

export async function listReviews(sql: Sql, status?: string): Promise<ReviewAdmin[]> {
  const params: unknown[] = [];
  const where = status ? "where status = $1" : "";
  if (status) params.push(status);
  const rows = await sql.query<{
    id: string;
    product_slug: string;
    author: string;
    handle: string | null;
    rating: number;
    title: string | null;
    body: string | null;
    verified: boolean;
    helpful: number;
    created_at: Date | string | null;
    status: ReviewAdmin["status"];
    reply: string | null;
  }>(
    `select id, product_slug, author, handle, rating, title, body, verified, helpful, created_at, status, reply
     from reviews ${where} order by created_at desc nulls last`,
    params,
  );
  return rows.rows.map((row) => ({
    id: row.id,
    productSlug: row.product_slug,
    author: row.author,
    handle: row.handle,
    rating: num(row.rating),
    title: row.title,
    body: row.body,
    verified: row.verified,
    helpful: num(row.helpful),
    createdAt: iso(row.created_at),
    status: row.status,
    reply: row.reply,
  }));
}

export async function patchReview(sql: Sql, id: string, patch: { status: ReviewAdmin["status"]; reply: string | null }): Promise<ReviewAdmin> {
  const updated = await sql.query(
    `update reviews set status = $2, reply = $3, replied_at = case when $3::text is null then replied_at else now() end where id = $1 returning id`,
    [id, patch.status, patch.reply],
  );
  if (!updated.rows.length) throw new CatalogError(404, "Avaliação não encontrada.", "NOT_FOUND");
  const rows = await listReviews(sql);
  const saved = rows.find((row) => row.id === id);
  if (!saved) throw new CatalogError(404, "Avaliação não encontrada.", "NOT_FOUND");
  return saved;
}

export async function readPublicReviews(sql: Sql, productSlug: string): Promise<Review[]> {
  const rows = await sql.query<{
    id: string;
    product_slug: string;
    author: string;
    handle: string | null;
    rating: number;
    title: string | null;
    body: string | null;
    verified: boolean;
    helpful: number;
    created_at: Date | string | null;
    payload: { photos?: { alt: string; hex: string }[] } | null;
  }>(
    `select id, product_slug, author, handle, rating, title, body, verified, helpful, created_at, payload
     from reviews where product_slug = $1 and status = 'aprovada' order by created_at desc nulls last`,
    [productSlug],
  );
  return rows.rows.map((row) => ({
    id: row.id,
    productSlug: row.product_slug,
    author: row.author,
    handle: row.handle ?? "",
    rating: num(row.rating),
    title: row.title ?? "",
    body: row.body ?? "",
    photos: Array.isArray(row.payload?.photos) ? row.payload.photos : [],
    verified: row.verified,
    createdAt: (iso(row.created_at) ?? "").slice(0, 10),
    helpful: num(row.helpful),
  }));
}

export interface OrderAdmin {
  id: string;
  code: string;
  email: string;
  status: string;
  paymentMethod: string;
  totalCents: number;
  createdAt: string | null;
  trackingCode: string | null;
  shipmentStatus: string | null;
}

export async function listOrders(sql: Sql): Promise<OrderAdmin[]> {
  const rows = await sql.query<{
    id: string;
    code: string;
    email: string;
    status: string;
    payment_method: string;
    total_cents: number;
    created_at: Date | string | null;
    tracking_code: string | null;
    shipment_status: string | null;
  }>(
    `select o.id, o.code, o.email, o.status, o.payment_method, o.total_cents, o.created_at,
            s.tracking_code, s.status as shipment_status
     from orders o
     left join lateral (select tracking_code, status from shipments where order_id = o.id order by id asc limit 1) s on true
     order by o.created_at desc`,
  );
  return rows.rows.map((row) => ({
    id: row.id,
    code: row.code,
    email: row.email,
    status: row.status,
    paymentMethod: row.payment_method,
    totalCents: num(row.total_cents),
    createdAt: iso(row.created_at),
    trackingCode: row.tracking_code,
    shipmentStatus: row.shipment_status,
  }));
}

export async function patchOrder(
  sql: Sql,
  id: string,
  patch: { status?: string; trackingCode?: string | null; shipmentStatus?: string | null },
): Promise<OrderAdmin> {
  const existing = await sql.query("select id from orders where id = $1", [id]);
  if (!existing.rows.length) throw new CatalogError(404, "Pedido não encontrado.", "NOT_FOUND");
  if (patch.status) await sql.query("update orders set status = $2 where id = $1", [id, patch.status]);
  if (patch.trackingCode !== undefined || patch.shipmentStatus !== undefined) {
    const shipment = await sql.query<{ id: string }>("select id from shipments where order_id = $1 limit 1", [id]);
    if (shipment.rows[0]) {
      await sql.query("update shipments set tracking_code = coalesce($2, tracking_code), status = coalesce($3, status) where id = $1", [
        shipment.rows[0].id,
        patch.trackingCode ?? null,
        patch.shipmentStatus ?? null,
      ]);
    } else if (patch.trackingCode) {
      await sql.query(
        "insert into shipments (id, order_id, method, price_cents, tracking_code, status) values ($1, $2, 'pac', 0, $3, $4)",
        [randomUUID(), id, patch.trackingCode, patch.shipmentStatus ?? "enviado"],
      );
    }
  }
  const saved = (await listOrders(sql)).find((row) => row.id === id);
  if (!saved) throw new CatalogError(404, "Pedido não encontrado.", "NOT_FOUND");
  return saved;
}

export interface CustomerAdmin {
  id: string;
  email: string;
  name: string;
  pointsBalance: number;
  pointsLifetime: number;
}

export async function listCustomers(sql: Sql): Promise<CustomerAdmin[]> {
  const rows = await sql.query<{ id: string; email: string; name: string; points_balance: number; points_lifetime: number }>(
    "select id, email, name, points_balance, points_lifetime from customers order by name asc",
  );
  return rows.rows.map((row) => ({
    id: row.id,
    email: row.email,
    name: row.name,
    pointsBalance: num(row.points_balance),
    pointsLifetime: num(row.points_lifetime),
  }));
}

export async function adjustPoints(sql: Sql, id: string, delta: number, reason: string): Promise<CustomerAdmin> {
  const updated = await sql.query(
    `update customers
     set points_balance = points_balance + $2,
         points_lifetime = points_lifetime + case when $2 > 0 then $2 else 0 end
     where id = $1 and points_balance + $2 >= 0
     returning id`,
    [id, delta],
  );
  if (!updated.rows.length) {
    const exists = await sql.query("select id from customers where id = $1", [id]);
    if (!exists.rows.length) throw new CatalogError(404, "Cliente não encontrado.", "NOT_FOUND");
    throw new CatalogError(400, "Os pontos não podem ficar negativos.", "POINTS");
  }
  await sql.query("insert into points_ledger (id, customer_id, delta, reason) values ($1, $2, $3, $4)", [randomUUID(), id, delta, reason]);
  const saved = (await listCustomers(sql)).find((row) => row.id === id);
  if (!saved) throw new CatalogError(404, "Cliente não encontrado.", "NOT_FOUND");
  return saved;
}

export async function listSubscriptions(sql: Sql) {
  const rows = await sql.query<{
    id: string;
    customer_id: string;
    product_slug: string;
    variant_id: string;
    quantity: number;
    unit_price_cents: number;
    status: string;
    interval_days: number;
    next_charge_on: Date | string;
  }>(
    `select id, customer_id, product_slug, variant_id, quantity, unit_price_cents, status, interval_days, next_charge_on
     from subscriptions order by next_charge_on asc`,
  );
  return rows.rows.map((row) => ({
    id: row.id,
    customerId: row.customer_id,
    productSlug: row.product_slug,
    variantId: row.variant_id,
    quantity: num(row.quantity),
    unitPriceCents: num(row.unit_price_cents),
    status: row.status,
    intervalDays: num(row.interval_days),
    nextChargeOn: iso(row.next_charge_on)?.slice(0, 10) ?? null,
  }));
}

export async function listAdminCustomers(sql: Sql) {
  const people = await listCustomers(sql);
  const flags = await sql.query<{ id: string; marketing_opt_in: boolean }>("select id, marketing_opt_in from customers");
  const optIn = new Map(flags.rows.map((row) => [row.id, row.marketing_opt_in]));
  const subscriptions = await listSubscriptions(sql);
  return people.map((person) => ({
    ...person,
    marketingOptIn: optIn.get(person.id) ?? false,
    subscriptions: subscriptions
      .filter((item) => item.customerId === person.id)
      .map((item) => ({
        id: item.id,
        productId: item.productSlug,
        variantId: item.variantId,
        name: item.productSlug,
        quantity: item.quantity,
        unitPriceCents: item.unitPriceCents,
        intervalDays: item.intervalDays,
        status: item.status,
        nextChargeOn: item.nextChargeOn ?? "",
      })),
  }));
}

export async function getOrderDetail(sql: Sql, id: string) {
  const order = (await listOrders(sql)).find((row) => row.id === id);
  if (!order) return null;
  const full = await sql.query<{
    customer_id: string | null;
    subtotal_cents: number;
    discount_cents: number;
    pix_cents: number;
    shipping_cents: number;
    points_earned: number;
  }>("select customer_id, subtotal_cents, discount_cents, pix_cents, shipping_cents, points_earned from orders where id = $1", [id]);
  const row = full.rows[0];
  const lines = await sql.query<{
    id: string;
    product_slug: string;
    variant_id: string;
    name: string;
    quantity: number;
    unit_price_cents: number;
  }>("select id, product_slug, variant_id, name, quantity, unit_price_cents from order_lines where order_id = $1", [id]);
  const payment = await sql.query<{ status: string }>("select status from payments where order_id = $1 order by created_at desc limit 1", [id]);
  const shipment = await sql.query<{ method: string }>("select method from shipments where order_id = $1 limit 1", [id]);
  return {
    ...order,
    customerId: row?.customer_id ?? null,
    paymentStatus: payment.rows[0]?.status ?? "simulado",
    subtotalCents: num(row?.subtotal_cents),
    discountCents: num(row?.discount_cents),
    pixCents: num(row?.pix_cents),
    shippingCents: num(row?.shipping_cents),
    pointsEarned: num(row?.points_earned),
    shippingMethod: shipment.rows[0]?.method ?? "",
    trackingCode: order.trackingCode ?? "",
    shipmentStatus: order.shipmentStatus ?? "",
    createdAt: order.createdAt ?? "",
    lines: lines.rows.map((line) => ({
      id: line.id,
      productId: line.product_slug,
      variantId: line.variant_id,
      name: line.name,
      quantity: num(line.quantity),
      unitPriceCents: num(line.unit_price_cents),
    })),
  };
}

export interface SubscriptionWrite {
  id: string;
  customerId: string;
  productSlug: string;
  variantId: string;
  quantity: number;
  unitPriceCents: number;
  intervalDays: number;
  status: "ativa" | "pausada" | "cancelada";
  nextChargeOn: string;
}

export async function saveSubscription(sql: Sql, input: SubscriptionWrite) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.nextChargeOn)) throw new CatalogError(400, "Data inválida.", "DATE");
  const productSlug = await resolveProductSlug(sql, input.productSlug);
  const existing = await sql.query("select id from subscriptions where id = $1", [input.id]);
  const params = [
    input.id,
    input.customerId,
    productSlug,
    input.variantId,
    input.quantity,
    input.unitPriceCents,
    input.intervalDays,
    input.status,
    input.nextChargeOn,
  ];
  if (existing.rows.length) {
    await sql.query(
      `update subscriptions
       set customer_id = $2, product_slug = $3, variant_id = $4, quantity = $5,
           unit_price_cents = $6, interval_days = $7, status = $8, next_charge_on = $9::date
       where id = $1`,
      params,
    );
  } else {
    await sql.query(
      `insert into subscriptions (
         id, customer_id, product_slug, variant_id, quantity, unit_price_cents, interval_days, status, next_charge_on
       ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9::date)`,
      params,
    );
  }
  const saved = (await listSubscriptions(sql)).find((row) => row.id === input.id);
  if (!saved) throw new CatalogError(404, "Assinatura não encontrada.", "NOT_FOUND");
  return saved;
}

export async function patchSubscription(sql: Sql, id: string, status: "ativa" | "pausada" | "cancelada") {
  const current = await sql.query<{ product_slug: string }>("select product_slug from subscriptions where id = $1", [id]);
  const row = current.rows[0];
  if (!row) throw new CatalogError(404, "Assinatura não encontrada.", "NOT_FOUND");
  const productSlug = await resolveProductSlug(sql, row.product_slug);
  const updated = await sql.query("update subscriptions set status = $2, product_slug = $3 where id = $1 returning id", [
    id,
    status,
    productSlug,
  ]);
  if (!updated.rows.length) throw new CatalogError(404, "Assinatura não encontrada.", "NOT_FOUND");
  const saved = (await listSubscriptions(sql)).find((row) => row.id === id);
  if (!saved) throw new CatalogError(404, "Assinatura não encontrada.", "NOT_FOUND");
  return saved;
}
