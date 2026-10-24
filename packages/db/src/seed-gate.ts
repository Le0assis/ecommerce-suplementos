import { PIX_DISCOUNT_PERCENT } from "@pulso/domain";
import { exampleSeedKeys } from "./seed-keys";

export class ExampleSeedRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExampleSeedRefused";
  }
}

export interface SeedClient {
  query: (text: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
}

export interface ExampleSeedOptions {
  env?: NodeJS.ProcessEnv;
  argv?: readonly string[];
}

export interface SeedDecision {
  allow: boolean;
  replaceMockChildren: boolean;
  message: string;
}

const SESSION_AUDIT = ["login", "logout", "login_failed"];

const KEY_CHECKS: { table: string; column: string; label: string; key: keyof ReturnType<typeof exampleSeedKeys> }[] = [
  { table: "products", column: "id", label: "produto", key: "products" },
  { table: "categories", column: "slug", label: "categoria", key: "categories" },
  { table: "goals", column: "slug", label: "objetivo", key: "goals" },
  { table: "influencers", column: "slug", label: "atleta", key: "influencers" },
  { table: "coupons", column: "code", label: "cupom", key: "coupons" },
  { table: "posts", column: "slug", label: "post", key: "posts" },
  { table: "reviews", column: "id", label: "avaliação", key: "reviews" },
  { table: "drops", column: "id", label: "drop", key: "drops" },
  { table: "authors", column: "id", label: "autor", key: "authors" },
  { table: "quiz_questions", column: "id", label: "pergunta do quiz", key: "quizQuestions" },
  { table: "scratch_prizes", column: "id", label: "prêmio", key: "scratchPrizes" },
  { table: "banners", column: "id", label: "banner", key: "banners" },
  { table: "ugc_posts", column: "id", label: "post de ugc", key: "ugc" },
  { table: "video_spots", column: "id", label: "vídeo", key: "videos" },
  { table: "loyalty_settings", column: "id", label: "fidelidade", key: "loyalty" },
];

const OPERATIONAL = [
  ["orders", "pedido"],
  ["customers", "cliente"],
  ["addresses", "endereço"],
  ["order_lines", "item de pedido"],
  ["payments", "pagamento"],
  ["shipments", "envio"],
  ["points_ledger", "lançamento de pontos"],
  ["wishlist_items", "lista de desejos"],
  ["subscriptions", "assinatura"],
  ["drop_waitlist", "lista de espera"],
  ["promotions", "promoção"],
  ["influencer_quotes", "citação de atleta"],
  ["influencer_images", "foto de atleta"],
] as const;

export function seedOverwriteRequested(env: NodeJS.ProcessEnv, argv: readonly string[]): boolean {
  return env.PULSO_SEED_ALLOW_OVERWRITE === "1" || argv.includes("--force-example");
}

function refused(reason: string): SeedDecision {
  return {
    allow: false,
    replaceMockChildren: false,
    message: `Seed de exemplo recusado: ${reason} Nada foi regravado. Para regravar de propósito, use PULSO_SEED_ALLOW_OVERWRITE=1 ou --force-example.`,
  };
}

function released(): SeedDecision {
  return { allow: true, replaceMockChildren: true, message: "" };
}

function missingRelation(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("code" in error)) return false;
  return (error as { code?: string }).code === "42P01";
}

export async function inspectExampleSeed(client: SeedClient, options: ExampleSeedOptions = {}): Promise<SeedDecision> {
  const env = options.env ?? process.env;
  const argv = options.argv ?? process.argv;
  if (seedOverwriteRequested(env, argv)) return released();
  if (env.NODE_ENV === "production") {
    return refused("NODE_ENV=production. O mock fictício não entra em produção.");
  }

  const keys = exampleSeedKeys(PIX_DISCOUNT_PERCENT);
  try {
    for (const [table, label] of OPERATIONAL) {
      const found = await client.query(`select 1 as ok from ${table} limit 1`);
      if (found.rows.length) return refused(`há ${label} no banco, e o seed de exemplo não cria isso.`);
    }

    for (const check of KEY_CHECKS) {
      const found = await client.query(
        `select ${check.column} as id from ${check.table} where not (${check.column} = any($1::text[])) limit 1`,
        [keys[check.key]],
      );
      const id = found.rows[0]?.id;
      if (typeof id === "string" && id) return refused(`há ${check.label} fora das chaves do mock (${id}).`);
    }

    const review = await client.query(
      `select id from reviews
       where not (id = any($1::text[]))
          or reply is not null
          or replied_at is not null
          or status <> 'aprovada'
       limit 1`,
      [keys.reviews],
    );
    const reviewId = review.rows[0]?.id;
    if (typeof reviewId === "string" && reviewId) {
      return refused(`há avaliação editada ou fora do mock (${reviewId}).`);
    }

    const audit = await client.query(
      `select action, entity, entity_id from audit_log
       where action <> all($1::text[])
       limit 1`,
      [SESSION_AUDIT],
    );
    const action = audit.rows[0]?.action;
    if (typeof action === "string") {
      const entity = String(audit.rows[0]?.entity ?? "");
      const entityId = String(audit.rows[0]?.entity_id ?? "");
      return refused(`há marcador de edição do admin na auditoria (${action} ${entity} ${entityId}).`);
    }

    const marked = await client.query(`select 1 as ok from example_seed where id = 'mock'`);
    if (marked.rows.length) {
      const edited = await client.query(
        `select tabela, id from (
           select 'products' as tabela, products.id
           from products
           join example_seed mark on mark.id = 'mock' and products.updated_at > mark.applied_at
           union all
           select 'influencers', influencers.slug
           from influencers
           join example_seed mark on mark.id = 'mock' and influencers.updated_at > mark.applied_at
           union all
           select 'coupons', coupons.code
           from coupons
           join example_seed mark on mark.id = 'mock' and coupons.updated_at > mark.applied_at
           union all
           select 'posts', posts.slug
           from posts
           join example_seed mark on mark.id = 'mock' and posts.updated_at > mark.applied_at
           union all
           select 'drops', drops.id
           from drops
           join example_seed mark on mark.id = 'mock' and drops.updated_at > mark.applied_at
           union all
           select 'loyalty_settings', loyalty_settings.id
           from loyalty_settings
           join example_seed mark on mark.id = 'mock' and loyalty_settings.updated_at > mark.applied_at
         ) edited
         limit 1`,
      );
      const row = edited.rows[0];
      if (row?.id) return refused(`há updated_at posterior ao seed em ${String(row.tabela)} (${String(row.id)}).`);
      return released();
    }

    const spread = await client.query(
      `select (max(updated_at) > min(updated_at)) as edited from (
         select updated_at from products
         union all select updated_at from influencers
         union all select updated_at from coupons
         union all select updated_at from posts
         union all select updated_at from drops
         union all select updated_at from loyalty_settings
       ) stamps`,
    );
    const spreadFlag = spread.rows[0]?.edited;
    if (spreadFlag === true || spreadFlag === "t") {
      return refused("há updated_at posterior ao seed: as datas não batem com uma única gravação do exemplo.");
    }
    return released();
  } catch (error) {
    if (missingRelation(error)) {
      return refused("falta tabela do schema. Rode pnpm db:migrate antes do seed.");
    }
    throw error;
  }
}
