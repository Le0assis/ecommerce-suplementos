-- Índices das consultas reais do admin e da loja, e das FKs que o Postgres não indexa sozinho.
-- Só cria. Não apaga linha, não troca tipo, não valida dado antigo e não remove índice existente.
-- Dinheiro continua em centavos inteiros. published_at e next_charge_on continuam date.
-- CREATE INDEX (sem CONCURRENTLY): o migrador manda o arquivo inteiro numa query só.

create index if not exists addresses_customer_idx on addresses (customer_id);
create index if not exists order_lines_order_idx on order_lines (order_id);
create index if not exists order_lines_product_slug_idx on order_lines (product_slug);
create index if not exists order_lines_variant_idx on order_lines (variant_id);
create index if not exists payments_order_created_idx on payments (order_id, created_at desc);
create index if not exists shipments_order_idx on shipments (order_id, id);
create index if not exists points_order_idx on points_ledger (order_id);
create index if not exists wishlist_product_idx on wishlist_items (product_slug);
create index if not exists subscriptions_customer_idx on subscriptions (customer_id);
create index if not exists subscriptions_next_charge_idx on subscriptions (next_charge_on);

create index if not exists product_images_flavor_idx on product_images (flavor_id);
create index if not exists product_flavors_position_idx on product_flavors (product_id, position);
create index if not exists product_variants_position_idx on product_variants (product_id, position);
create index if not exists kit_items_position_idx on kit_items (kit_id, position);
create index if not exists influencer_products_position_idx on influencer_products (influencer_id, position);

create index if not exists posts_influencer_published_idx on posts (influencer_id, published_at desc nulls last);
create index if not exists posts_published_idx on posts (published_at desc nulls last);

create index if not exists products_store_idx on products (name) where status = 'ativo' and active = true;
create index if not exists products_admin_idx on products (updated_at desc, name) where status <> 'arquivado';
create index if not exists products_updated_idx on products (updated_at desc, name);
create index if not exists products_status_sort_idx on products (status, updated_at desc, name);
create index if not exists products_kits_idx on products (updated_at desc, name) where is_kit = true;

create index if not exists reviews_public_idx on reviews (product_slug, created_at desc nulls last) where status = 'aprovada';
create index if not exists reviews_admin_idx on reviews (status, created_at desc nulls last);
create index if not exists reviews_created_idx on reviews (created_at desc nulls last);

create index if not exists influencers_name_idx on influencers (name);
create index if not exists influencers_active_name_idx on influencers (name) where active = true;

create index if not exists categories_position_idx on categories (position, name);
create index if not exists goals_position_idx on goals (position, name);

create index if not exists coupons_active_code_idx on coupons (code) where active = true;

create index if not exists orders_created_idx on orders (created_at desc);
create index if not exists customers_name_idx on customers (name);

create index if not exists audit_log_created_idx on audit_log (created_at desc);
create index if not exists audit_log_entity_created_idx on audit_log (entity, created_at desc);
create index if not exists audit_log_entity_id_created_idx on audit_log (entity, entity_id, created_at desc);

create index if not exists drops_admin_idx on drops (updated_at desc, edition);
create index if not exists drops_flavor_idx on drops (flavor_id);
create index if not exists drops_open_idx on drops (product_id, status, ends_at) where status <> 'encerrado';

create index if not exists drop_waitlist_drop_created_idx on drop_waitlist (drop_id, created_at desc);

create index if not exists ugc_posts_visible_idx on ugc_posts (position) where hidden = false;
create index if not exists video_spots_visible_idx on video_spots (position) where hidden = false;

create index if not exists scratch_prizes_position_idx on scratch_prizes (position);
create index if not exists scratch_prizes_coupon_idx on scratch_prizes (coupon_code);

create index if not exists promotions_name_idx on promotions (name);
create index if not exists promotions_product_idx on promotions (product_id);
create index if not exists promotions_category_idx on promotions (category_id);

create index if not exists authors_name_idx on authors (name);
create index if not exists quiz_options_position_idx on quiz_options (position);

-- Linha de pedido nova precisa apontar para uma variação que existe.
-- NOT VALID não varre linha antiga. Apagar a variação continua bloqueado se houver pedido.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'order_lines'::regclass
      and conname = 'order_lines_variant_fk'
  ) then
    alter table order_lines
      add constraint order_lines_variant_fk
      foreign key (variant_id) references product_variants (id) on delete restrict
      not valid;
  end if;
end $$;
