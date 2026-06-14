-- =============================================================
--  Migration v2: Pricing Tier + Optimasi Pencarian Produk
--  Jalankan setelah schema_v1.sql dan user_table_extension.sql
--  Aman di-run ulang (idempotent).
--
--  Apa yang ditambah:
--   1. customer_category enum  → menentukan tier harga otomatis
--   2. customers.category      → kasir pilih pelanggan, harga nyesuain sendiri
--   3. product_units.price_toko → harga khusus segment toko lain
--   4. pg_trgm index           → pencarian 1000-2000 SKU tetap cepat
--   5. get_unit_price()        → fungsi bantu hitung harga per tier
-- =============================================================


-- ---------- 1. Enum tier pelanggan ----------
-- Proyek/kontraktor hutang besar dihandle di Accurate, tidak masuk POS.
-- Dua tier yang relevan di POS: retail (eceran) dan toko (grosir).
do $$ begin
  create type customer_category as enum ('retail', 'toko');
exception when duplicate_object then null;
end $$;


-- ---------- 2. Tambah category ke customers ----------
alter table customers
  add column if not exists category customer_category not null default 'retail';

comment on column customers.category is
  'Tier harga pelanggan. retail = harga eceran (default). toko = harga grosir toko lain.';

-- is_kontraktor lama dipertahankan untuk migrasi data,
-- tapi TIDAK dipakai untuk menentukan harga di POS.
-- Pricing sepenuhnya dikontrol oleh kolom category.


-- ---------- 3. Tambah price_toko ke product_units ----------
-- NULL artinya harga toko sama dengan harga retail (price).
-- Kasir tidak perlu isi ini; penentuan harga otomatis lewat get_unit_price().
alter table product_units
  add column if not exists price_toko numeric check (price_toko > 0);

comment on column product_units.price_toko is
  'Harga khusus segment toko lain. NULL = ikut harga retail.';


-- ---------- 4. Trigram index untuk pencarian produk cepat ----------
-- pg_trgm memungkinkan ILIKE ''%semen%'' tetap cepat di 2000+ SKU.
create extension if not exists pg_trgm;

create index if not exists idx_products_name_trgm
  on products using gin (name gin_trgm_ops);

create index if not exists idx_products_sku_trgm
  on products using gin (sku gin_trgm_ops);

-- Index aktif untuk filter category
create index if not exists idx_products_category
  on products (category)
  where active = true;


-- ---------- 5. Helper: ambil harga sesuai tier pelanggan ----------
-- Dipakai di aplikasi maupun query laporan agar logika harga
-- tidak berulang di mana-mana.
--
-- Contoh pakai:
--   select get_unit_price(unit_id, 'toko') from product_units;
create or replace function get_unit_price(
  p_unit_id  bigint,
  p_category customer_category default 'retail'
) returns numeric
language sql stable security definer set search_path = public as $$
  select case
    when p_category = 'toko' and price_toko is not null then price_toko
    else price
  end
  from product_units
  where id = p_unit_id;
$$;


-- ---------- 6. Seed harga toko untuk produk contoh ----------
-- Jalankan ini hanya sekali; hapus atau skip kalau data sudah ada.
update product_units set price_toko = 59000  where product_id = 1 and unit_name = 'sak';
update product_units set price_toko = 1300   where product_id = 1 and unit_name = 'kg';
update product_units set price_toko = 72000  where product_id = 2 and unit_name = 'batang';
update product_units set price_toko = 88000  where product_id = 3 and unit_name = 'kaleng';
update product_units set price_toko = 498000 where product_id = 3 and unit_name = 'dus (isi 6)';


-- ---------- 7. RLS yang hilang dari schema_v1 ----------
-- sale_items: RLS diaktifkan di v1 tapi tidak ada policy → semua insert diblok.
drop policy if exists "catat item penjualan" on sale_items;
create policy "catat item penjualan" on sale_items
  for insert with check (get_current_role() in ('kasir','admin','owner'));

drop policy if exists "lihat item penjualan" on sale_items;
create policy "lihat item penjualan" on sale_items
  for select using (
    get_current_role() in ('admin','owner')
    or exists (
      select 1 from sales
      where sales.id = sale_items.sale_id
        and sales.cashier_id = auth.uid()
        and sales.created_at::date = now()::date
    )
  );

-- customers: kasir perlu bisa BACA untuk customer-picker di POS.
alter table customers enable row level security;

drop policy if exists "semua staf baca pelanggan" on customers;
create policy "semua staf baca pelanggan" on customers
  for select to authenticated using (true);

drop policy if exists "kasir tambah pelanggan" on customers;
create policy "kasir tambah pelanggan" on customers
  for insert with check (get_current_role() in ('kasir','admin','owner'));

drop policy if exists "admin kelola pelanggan" on customers;
create policy "admin kelola pelanggan" on customers
  for update using (get_current_role() in ('admin','owner'));


-- ---------- Verifikasi ----------
select
  p.name                           as produk,
  pu.unit_name                     as satuan,
  pu.price                         as harga_retail,
  coalesce(pu.price_toko, pu.price) as harga_toko
from product_units pu
join products p on p.id = pu.product_id
order by p.name, pu.unit_name;
