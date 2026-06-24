-- ================================================================
--  Patch: Price Lists per Warehouse
--
--  Jalankan SEKALI di Supabase SQL Editor.
--  Prasyarat: schema_production.sql sudah dijalankan.
--
--  Yang dilakukan:
--   1. Tabel price_lists (master daftar harga)
--   2. Tabel price_list_items (harga per product_unit di price list)
--   3. Kolom price_list_id di warehouses
--   4. RLS
-- ================================================================

-- 1. Price lists
create table if not exists price_lists (
  id         bigserial    primary key,
  name       text         not null,
  created_at timestamptz  not null default now()
);

-- 2. Harga per produk per price list
--    NULL = gunakan harga master dari product_units
create table if not exists price_list_items (
  price_list_id   bigint   not null references price_lists(id) on delete cascade,
  product_unit_id bigint   not null references product_units(id) on delete cascade,
  price_retail    numeric,
  price_toko      numeric,
  primary key (price_list_id, product_unit_id)
);

-- 3. Warehouse pakai price list mana
alter table warehouses
  add column if not exists price_list_id bigint references price_lists(id);

-- 4. RLS
alter table price_lists      enable row level security;
alter table price_list_items enable row level security;

drop policy if exists "baca_price_lists"           on price_lists;
drop policy if exists "admin_kelola_price_lists"   on price_lists;
drop policy if exists "baca_price_list_items"      on price_list_items;
drop policy if exists "admin_kelola_price_list_items" on price_list_items;

create policy "baca_price_lists"
  on price_lists for select to authenticated using (true);

create policy "admin_kelola_price_lists"
  on price_lists for all to authenticated
  using    (get_current_role() in ('admin', 'owner'))
  with check (get_current_role() in ('admin', 'owner'));

create policy "baca_price_list_items"
  on price_list_items for select to authenticated using (true);

create policy "admin_kelola_price_list_items"
  on price_list_items for all to authenticated
  using    (get_current_role() in ('admin', 'owner'))
  with check (get_current_role() in ('admin', 'owner'));
